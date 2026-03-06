use crate::config::{AccountKind, AppConfig, Instance, Loader};
use crate::minecraft::download::{download_to, load_json};
use crate::minecraft::instance::ensure_instance_ready;
use crate::minecraft::models::{
  Argument, ArgumentValue, FeatureFlags, LaunchContext, MojangLibrary, ResolvedVersion,
  VersionArguments, VersionFile, VersionLogging,
};
use crate::minecraft::util::{
  build_maven_path_url, classpath_separator, current_os_name, library_allowed,
  parse_maven_coordinate, resolve_library_artifact, rules_allow,
};
use crate::minecraft::{DEFAULT_LIBRARIES_URL};
use std::{
  collections::{BTreeSet, HashMap, HashSet},
  env,
  fs::{self, File},
  io::{BufRead, BufReader, Read, Seek, SeekFrom},
  net::ToSocketAddrs,
  path::{Path, PathBuf},
  process::{Command, Stdio},
  sync::atomic::{AtomicBool, Ordering},
  sync::Arc,
  thread,
  time::Duration,
};

pub fn launch_instance(
  instance_id: &str,
  player_name: Option<String>,
  config: &AppConfig,
  emit: &dyn Fn(crate::minecraft::models::ProgressEvent),
  log: Arc<dyn Fn(&str, &str) + Send + Sync>,
  on_exit: Option<Arc<dyn Fn(u32) + Send + Sync>>,
) -> Result<u32, String> {
  let instance = config
    .instances
    .iter()
    .find(|item| item.id == instance_id)
    .ok_or_else(|| format!("instance '{}' not found", instance_id))?;

  ensure_instance_ready(instance, emit)?;

  let instance_dir = PathBuf::from(&instance.directory);
  apply_reference_sync(config, instance, &instance_dir, log.clone());

  let version_id = resolve_version_id(instance);
  let resolved = resolve_version_chain(&instance_dir, &version_id)?;
  let main_class = resolved
    .main_class
    .ok_or_else(|| "mainClass missing in version metadata".to_string())?;

  let jar_id = resolved
    .jar
    .clone()
    .or(resolved.base_version_id.clone())
    .unwrap_or_else(|| version_id.clone());
  let jar_path = instance_dir
    .join("versions")
    .join(&jar_id)
    .join(format!("{}.jar", jar_id));
  if !jar_path.exists() {
    return Err(format!("version jar '{}' missing", jar_path.display()));
  }

  let libraries_dir = instance_dir.join("libraries");
  let classpath = build_classpath(&resolved.libraries, &libraries_dir, &jar_path)?;
  let assets_root = instance_dir.join("assets");
  let asset_index_name = resolved
    .asset_index
    .as_ref()
    .map(|index| index.id.clone())
    .or(resolved.assets.clone())
    .unwrap_or_else(|| "legacy".to_string());
  let natives_id = resolved
    .base_version_id
    .clone()
    .unwrap_or_else(|| jar_id.clone());
  let natives_dir = instance_dir.join("natives").join(natives_id);
  let logging_path = resolved
    .logging
    .as_ref()
    .and_then(|logging| logging.client.as_ref())
    .and_then(|client| client.file.as_ref())
    .map(|file| assets_root.join("log_configs").join(&file.id))
    .unwrap_or_default();

  if let Some(logging) = &resolved.logging {
    download_logging_config(logging, &assets_root)?;
  }

  let (player, uuid, access_token, user_type, xuid) = resolve_auth(player_name, config);
  let client_id = uuid::Uuid::new_v4().to_string();
  let version_type = "release".to_string();

  let context = LaunchContext {
    player_name: player,
    uuid,
    access_token,
    user_type,
    xuid,
    client_id,
    version_name: resolved
      .id
      .clone()
      .unwrap_or_else(|| version_id.clone()),
    game_dir: instance_dir.to_string_lossy().to_string(),
    assets_root: assets_root.to_string_lossy().to_string(),
    library_dir: libraries_dir.to_string_lossy().to_string(),
    asset_index_name,
    classpath: classpath.clone(),
    natives_dir: natives_dir.to_string_lossy().to_string(),
    logging_path: logging_path.to_string_lossy().to_string(),
    launcher_name: "monolith".to_string(),
    launcher_version: env!("CARGO_PKG_VERSION").to_string(),
    version_type,
  };

  let mut jvm_args = Vec::new();
  let os_name = current_os_name();
  let feature_flags = FeatureFlags::default();
  if let Some(arguments) = &resolved.arguments {
    jvm_args.extend(flatten_arguments(arguments.jvm.as_ref(), os_name, &feature_flags));
  }

  jvm_args.retain(|arg| {
    !(arg == "-cp"
      || arg.contains("${classpath}")
      || (arg.contains("${classpath_separator}") && arg.contains("${classpath}"))
      || arg.contains("${natives_directory}"))
  });

  if !cfg!(target_os = "macos") {
    jvm_args.retain(|arg| arg != "-XstartOnFirstThread");
  }

  if let Some(logging) = &resolved.logging {
    if let Some(arg) = logging.client.as_ref().and_then(|client| client.argument.clone()) {
      jvm_args.push(arg);
    }
  }
  merge_ignore_list_with_jar_name(&mut jvm_args, &jar_path);

  let min_ram_mb = instance
    .java_min_ram_mb
    .unwrap_or(config.settings.java.min_ram_mb);
  let max_ram_mb = instance
    .java_max_ram_mb
    .unwrap_or(config.settings.java.max_ram_mb);
  jvm_args.push(format!("-Xms{}M", min_ram_mb));
  jvm_args.push(format!("-Xmx{}M", max_ram_mb));
  jvm_args.push(format!("-Djava.library.path={}", context.natives_dir));
  jvm_args.extend(config.settings.java.jvm_args.split_whitespace().map(String::from));
  if let Some(extra) = &instance.jvm_args {
    jvm_args.extend(extra.split_whitespace().map(String::from));
  }
  jvm_args.push("-cp".to_string());
  jvm_args.push(classpath);

  let mut game_args = Vec::new();
  if let Some(arguments) = &resolved.arguments {
    game_args.extend(flatten_arguments(arguments.game.as_ref(), os_name, &feature_flags));
  } else if let Some(raw) = &resolved.minecraft_arguments {
    game_args.extend(raw.split_whitespace().map(|item| item.to_string()));
  }
  game_args = strip_quickplay_args(game_args);

  let mut final_args = Vec::new();
  final_args.extend(jvm_args.into_iter().map(|arg| replace_tokens(arg, &context)));
  let main_class_name = main_class.clone();
  final_args.push(main_class);
  final_args.extend(game_args.into_iter().map(|arg| replace_tokens(arg, &context)));

  let java_cmd = resolve_java_command(config, instance)?;
  emit_launch_preamble(
    log.clone(),
    instance,
    &context,
    &java_cmd,
    &main_class_name,
    &final_args,
  );
  let mut command = Command::new(&java_cmd);
  command.args(&final_args);
  command.current_dir(&instance_dir);
  command.stdout(Stdio::piped());
  command.stderr(Stdio::piped());
  let log_files = vec![
    instance_dir.join("logs").join("latest.log"),
    instance_dir.join("logs").join("debug.log"),
    instance_dir.join("logs").join("chat.log"),
  ];
  let mut log_offsets = HashMap::new();
  for path in &log_files {
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    let offset = if file_name.eq_ignore_ascii_case("latest.log") {
      0
    } else {
      std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
    };
    log_offsets.insert(path.clone(), offset);
  }
  let mut child = command
    .spawn()
    .map_err(|err| format!("failed to launch java ({}): {}", java_cmd, err))?;

  if let Some(stdout) = child.stdout.take() {
    let log = log.clone();
    thread::spawn(move || {
      let reader = BufReader::new(stdout);
      for line in reader.lines().flatten() {
        log("stdout", &line);
      }
    });
  }

  if let Some(stderr) = child.stderr.take() {
    let log = log.clone();
    thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines().flatten() {
        log("stderr", &line);
      }
    });
  }

  let log_tail_active = Arc::new(AtomicBool::new(true));
  {
    let log = log.clone();
    let active = log_tail_active.clone();
    let files = log_files.clone();
    let offsets = log_offsets;
    thread::spawn(move || {
      tail_log_files(files, offsets, active, log);
    });
  }

  let pid = child.id();
  if let Some(callback) = on_exit {
    let active = log_tail_active.clone();
    thread::spawn(move || {
      let _ = child.wait();
      active.store(false, Ordering::Relaxed);
      callback(pid);
    });
  } else {
    let active = log_tail_active.clone();
    thread::spawn(move || {
      let _ = child.wait();
      active.store(false, Ordering::Relaxed);
    });
  }

  Ok(pid)
}

fn merge_ignore_list_with_jar_name(jvm_args: &mut [String], jar_path: &Path) {
  let Some(jar_name) = jar_path.file_name().and_then(|name| name.to_str()) else {
    return;
  };
  for arg in jvm_args.iter_mut() {
    if let Some(value) = arg.strip_prefix("-DignoreList=") {
      let has_jar = value.split(',').any(|item| item.trim().eq_ignore_ascii_case(jar_name));
      if !has_jar {
        arg.push(',');
        arg.push_str(jar_name);
      }
      break;
    }
  }
}

fn emit_launch_preamble(
  log: Arc<dyn Fn(&str, &str) + Send + Sync>,
  instance: &Instance,
  context: &LaunchContext,
  java_cmd: &str,
  main_class: &str,
  final_args: &[String],
) {
  log(
    "launcher",
    &format!("Monolith Launcher version: {}", env!("CARGO_PKG_VERSION")),
  );

  let launch_mode = if !context.access_token.is_empty() && context.user_type != "offline" {
    "online"
  } else {
    "offline"
  };
  log(
    "launcher",
    &format!("Launched instance in {} mode", launch_mode),
  );

  for host in [
    "login.microsoftonline.com",
    "session.minecraft.net",
    "textures.minecraft.net",
    "api.mojang.com",
  ] {
    let resolved = resolve_host_addresses(host);
    if resolved.is_empty() {
      log("launcher", &format!("{} resolves to: []", host));
    } else {
      log(
        "launcher",
        &format!("{} resolves to: [{}]", host, resolved.join(", ")),
      );
    }
  }

  log("launcher", &format!("Minecraft folder is: {}", context.game_dir));
  log("launcher", &format!("Java path is: {}", java_cmd));
  if let Some(version) = detect_java_version(java_cmd) {
    log("launcher", &format!("Java version: {}", version));
  }
  log("launcher", &format!("Main Class: {}", main_class));
  log("launcher", &format!("Native path: {}", context.natives_dir));
  log("launcher", "Libraries:");
  for entry in context.classpath.split(classpath_separator()) {
    if entry.trim().is_empty() {
      continue;
    }
    log("launcher", &format!("  {}", entry));
  }

  if let Some(main_index) = final_args.iter().position(|item| item == main_class) {
    let java_args = &final_args[..main_index];
    let game_args = if main_index + 1 < final_args.len() {
      &final_args[main_index + 1..]
    } else {
      &[]
    };

    let mut java_args_clean = Vec::new();
    for arg in java_args {
      if arg.starts_with("-cp") || arg.contains(".jar") {
        continue;
      }
      java_args_clean.push(arg.clone());
    }
    log(
      "launcher",
      &format!("Java Arguments: [{}]", java_args_clean.join(", ")),
    );

    let game_args_safe = redact_sensitive_args(game_args);
    log("launcher", &format!("Params: {}", game_args_safe.join(" ")));
  }

  let mods_dir = PathBuf::from(&instance.directory).join("mods");
  if mods_dir.is_dir() {
    log("launcher", "Mods:");
    if let Ok(entries) = fs::read_dir(mods_dir) {
      for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".jar") && !name.ends_with(".disabled") {
          continue;
        }
        let marker = if name.ends_with(".disabled") {
          "off"
        } else {
          "on"
        };
        let trimmed = name.trim_end_matches(".disabled").trim_end_matches(".jar");
        log("launcher", &format!("  [{}] {}", marker, trimmed));
      }
    }
  }
}

fn resolve_host_addresses(host: &str) -> Vec<String> {
  let mut values = BTreeSet::new();
  if let Ok(addresses) = (host, 443).to_socket_addrs() {
    for address in addresses {
      values.insert(address.ip().to_string());
    }
  }
  values.into_iter().collect()
}

fn detect_java_version(java_cmd: &str) -> Option<String> {
  let output = Command::new(java_cmd).arg("-version").output().ok()?;
  let stderr = String::from_utf8_lossy(&output.stderr);
  let stdout = String::from_utf8_lossy(&output.stdout);
  let line = stderr
    .lines()
    .chain(stdout.lines())
    .find(|line| !line.trim().is_empty())?;
  Some(line.trim().to_string())
}

fn redact_sensitive_args(args: &[String]) -> Vec<String> {
  let mut redacted = Vec::with_capacity(args.len());
  let mut redact_next = false;
  for arg in args {
    if redact_next {
      redacted.push("<redacted>".to_string());
      redact_next = false;
      continue;
    }
    let lower = arg.to_lowercase();
    if lower == "--accesstoken" || lower == "--clientid" || lower == "--xuid" {
      redacted.push(arg.clone());
      redact_next = true;
      continue;
    }
    if lower.starts_with("--accesstoken=")
      || lower.starts_with("--clientid=")
      || lower.starts_with("--xuid=")
    {
      let key = arg.split('=').next().unwrap_or(arg.as_str());
      redacted.push(format!("{}=<redacted>", key));
      continue;
    }
    redacted.push(arg.clone());
  }
  redacted
}

fn apply_reference_sync(
  config: &AppConfig,
  instance: &Instance,
  instance_dir: &Path,
  log: Arc<dyn Fn(&str, &str) + Send + Sync>,
) {
  let sync = &config.settings.pack_sync;
  if !sync.enabled {
    return;
  }

  let reference_id = match config.settings.reference_instance_id.as_ref() {
    Some(value) => value,
    None => return,
  };

  if reference_id == &instance.id {
    return;
  }

  let reference = match config
    .instances
    .iter()
    .find(|candidate| &candidate.id == reference_id)
  {
    Some(value) => value,
    None => {
      log(
        "launcher",
        "Sync skipped: reference instance not found in configuration.",
      );
      return;
    }
  };

  let reference_dir = PathBuf::from(&reference.directory);
  if !reference_dir.exists() {
    log(
      "launcher",
      "Sync skipped: reference instance directory does not exist.",
    );
    return;
  }

  if sync.resourcepacks {
    if let Err(err) = sync_directory_contents(
      &reference_dir.join("resourcepacks"),
      &instance_dir.join("resourcepacks"),
    ) {
      log("launcher", &format!("Sync resourcepacks failed: {}", err));
    }
  }
  if sync.texturepacks {
    if let Err(err) = sync_directory_contents(
      &reference_dir.join("texturepacks"),
      &instance_dir.join("texturepacks"),
    ) {
      log("launcher", &format!("Sync texturepacks failed: {}", err));
    }
  }
  if sync.shaderpacks {
    if let Err(err) = sync_directory_contents(
      &reference_dir.join("shaderpacks"),
      &instance_dir.join("shaderpacks"),
    ) {
      log("launcher", &format!("Sync shaderpacks failed: {}", err));
    }
  }
  if sync.server_list {
    if let Err(err) = sync_file_if_exists(
      &reference_dir.join("servers.dat"),
      &instance_dir.join("servers.dat"),
    ) {
      log("launcher", &format!("Sync servers.dat failed: {}", err));
    }
  }
  if sync.options_txt {
    if let Err(err) = sync_file_if_exists(
      &reference_dir.join("options.txt"),
      &instance_dir.join("options.txt"),
    ) {
      log("launcher", &format!("Sync options.txt failed: {}", err));
    }
  }
}

fn sync_directory_contents(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
  if !source_dir.is_dir() {
    return Ok(());
  }
  fs::create_dir_all(target_dir).map_err(|err| err.to_string())?;

  let entries = fs::read_dir(source_dir).map_err(|err| err.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|err| err.to_string())?;
    let source_path = entry.path();
    let target_path = target_dir.join(entry.file_name());
    let file_type = entry.file_type().map_err(|err| err.to_string())?;
    if file_type.is_dir() {
      sync_directory_contents(&source_path, &target_path)?;
      continue;
    }
    if file_type.is_file() {
      fs::copy(&source_path, &target_path).map_err(|err| err.to_string())?;
    }
  }

  Ok(())
}

fn sync_file_if_exists(source_file: &Path, target_file: &Path) -> Result<(), String> {
  if !source_file.is_file() {
    return Ok(());
  }
  if let Some(parent) = target_file.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  fs::copy(source_file, target_file).map_err(|err| err.to_string())?;
  Ok(())
}

fn resolve_version_id(instance: &Instance) -> String {
  match instance.loader {
    Loader::Vanilla => instance.version.clone(),
    Loader::Fabric => instance
      .loader_version
      .as_ref()
      .map(|loader| format!("fabric-loader-{}-{}", loader, instance.version))
      .unwrap_or_else(|| instance.version.clone()),
    Loader::Forge => {
      let loader = instance
        .loader_version
        .as_ref()
        .cloned()
        .unwrap_or_else(|| instance.version.clone());
      let full_version = if loader.contains(&instance.version) && loader.contains('-') {
        loader
      } else {
        format!("{}-{}", instance.version, loader)
      };
      format!("forge-{}", full_version)
    }
    Loader::NeoForge => instance
      .loader_version
      .as_ref()
      .map(|loader| format!("neoforge-{}", loader))
      .unwrap_or_else(|| instance.version.clone()),
  }
}

fn tail_log_files(
  paths: Vec<PathBuf>,
  initial_offsets: HashMap<PathBuf, u64>,
  active: Arc<AtomicBool>,
  log: Arc<dyn Fn(&str, &str) + Send + Sync>,
) {
  let mut offsets = initial_offsets;
  let mut pending: HashMap<PathBuf, String> = HashMap::new();
  for path in &paths {
    pending.entry(path.clone()).or_default();
    offsets.entry(path.clone()).or_insert(0);
  }

  while active.load(Ordering::Relaxed) {
    for path in &paths {
      if let Ok(mut file) = File::open(path) {
        if let Ok(meta) = file.metadata() {
          let len = meta.len();
          let offset = offsets.entry(path.clone()).or_insert(0);
          let pending_buf = pending.entry(path.clone()).or_default();

          if len < *offset {
            *offset = 0;
            pending_buf.clear();
          }

          if len > *offset && file.seek(SeekFrom::Start(*offset)).is_ok() {
            let mut chunk = String::new();
            if file.read_to_string(&mut chunk).is_ok() && !chunk.is_empty() {
              *offset = len;
              pending_buf.push_str(&chunk);
              while let Some(idx) = pending_buf.find('\n') {
                let mut line = pending_buf[..idx].to_string();
                if line.ends_with('\r') {
                  line.pop();
                }
                if !line.trim().is_empty() {
                  let stream = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("log");
                  log(stream, &line);
                }
                *pending_buf = pending_buf[idx + 1..].to_string();
              }
            }
          }
        }
      }
    }

    thread::sleep(Duration::from_millis(250));
  }
}

fn resolve_version_chain(
  instance_dir: &Path,
  version_id: &str,
) -> Result<ResolvedVersion, String> {
  let mut chain = Vec::new();
  let mut current_id = version_id.to_string();
  let mut visited = HashSet::new();

  loop {
    if !visited.insert(current_id.clone()) {
      return Err("version metadata contains a loop".to_string());
    }
    let version = load_version_file(instance_dir, &current_id)?;
    let inherits = version.inherits_from.clone();
    chain.push(version);
    if let Some(next_id) = inherits {
      current_id = next_id;
    } else {
      break;
    }
  }

  let base_version_id = chain.last().map(|version| version.id.clone());
  let mut resolved = ResolvedVersion::default();
  resolved.base_version_id = base_version_id.clone();

  for version in chain.into_iter().rev() {
    resolved.id = Some(version.id.clone());
    resolved.jar = version.jar.or(resolved.jar);
    if version.main_class.is_some() {
      resolved.main_class = version.main_class;
    }
    if version.asset_index.is_some() {
      resolved.asset_index = version.asset_index;
    }
    if version.assets.is_some() {
      resolved.assets = version.assets;
    }
    if version.logging.is_some() {
      resolved.logging = version.logging;
    }

    resolved.libraries.extend(version.libraries);

    if let Some(arguments) = version.arguments {
      resolved.arguments = merge_arguments(resolved.arguments.take(), arguments);
    }
    if version.minecraft_arguments.is_some() {
      resolved.minecraft_arguments = version.minecraft_arguments;
    }
  }

  Ok(resolved)
}

fn load_version_file(instance_dir: &Path, version_id: &str) -> Result<VersionFile, String> {
  let version_path = instance_dir
    .join("versions")
    .join(version_id)
    .join(format!("{}.json", version_id));
  if !version_path.exists() {
    return Err(format!(
      "version metadata '{}' missing",
      version_path.display()
    ));
  }
  load_json(&version_path)
}

fn merge_arguments(
  base: Option<VersionArguments>,
  current: VersionArguments,
) -> Option<VersionArguments> {
  let mut merged = base.unwrap_or_default();
  if let Some(game) = current.game {
    merged.game.get_or_insert_with(Vec::new).extend(game);
  }
  if let Some(jvm) = current.jvm {
    merged.jvm.get_or_insert_with(Vec::new).extend(jvm);
  }
  Some(merged)
}

fn flatten_arguments(
  arguments: Option<&Vec<Argument>>,
  os_name: &str,
  features: &FeatureFlags,
) -> Vec<String> {
  let mut flat = Vec::new();
  let arguments = match arguments {
    Some(arguments) => arguments,
    None => return flat,
  };

  for arg in arguments {
    match arg {
      Argument::String(value) => flat.push(value.clone()),
      Argument::Object(obj) => {
        if rules_allow(&obj.rules, os_name, features) {
          match &obj.value {
            ArgumentValue::String(value) => flat.push(value.clone()),
            ArgumentValue::List(list) => flat.extend(list.clone()),
          }
        }
      }
    }
  }

  flat
}

fn build_classpath(
  libraries: &[MojangLibrary],
  libraries_dir: &Path,
  version_jar: &Path,
) -> Result<String, String> {
  let mut entries: Vec<String> = Vec::new();
  let mut keyed: HashMap<String, usize> = HashMap::new();
  let mut seen_paths: HashSet<String> = HashSet::new();
  let os_name = current_os_name();

  for library in libraries {
    if !library_allowed(library.rules.as_ref(), os_name) {
      continue;
    }

    if let Some(downloads) = &library.downloads {
      if let Some(artifact) = &downloads.artifact {
        if let Some((_, path)) = resolve_library_artifact(artifact, &library.name, None) {
          let jar_path = libraries_dir.join(path);
          if jar_path.exists() {
            push_unique_library(
              &mut entries,
              &mut keyed,
              &mut seen_paths,
              &library.name,
              jar_path.to_string_lossy().to_string(),
            );
          }
          continue;
        }
      }
    }

    let base_url = library.url.as_deref().unwrap_or(DEFAULT_LIBRARIES_URL);
    if let Ok(coordinate) = parse_maven_coordinate(&library.name) {
      if let Ok((path, _)) = build_maven_path_url(base_url, &coordinate) {
        let jar_path = libraries_dir.join(path);
        if jar_path.exists() {
          push_unique_library(
            &mut entries,
            &mut keyed,
            &mut seen_paths,
            &library.name,
            jar_path.to_string_lossy().to_string(),
          );
        }
      }
    }
  }

  entries.push(version_jar.to_string_lossy().to_string());

  Ok(entries.join(classpath_separator()))
}

fn push_unique_library(
  entries: &mut Vec<String>,
  keyed: &mut HashMap<String, usize>,
  seen_paths: &mut HashSet<String>,
  name: &str,
  path: String,
) {
  if let Ok(coordinate) = parse_maven_coordinate(name) {
    let key = format!(
      "{}:{}:{}",
      coordinate.group,
      coordinate.artifact,
      coordinate.classifier.unwrap_or_default()
    );
    if let Some(idx) = keyed.get(&key) {
      entries[*idx] = path;
      return;
    }
    keyed.insert(key, entries.len());
    entries.push(path);
    return;
  }

  if seen_paths.insert(path.clone()) {
    entries.push(path);
  }
}

fn download_logging_config(logging: &VersionLogging, assets_root: &Path) -> Result<(), String> {
  let client = match &logging.client {
    Some(client) => client,
    None => return Ok(()),
  };
  let file = match &client.file {
    Some(file) => file,
    None => return Ok(()),
  };
  let dest = assets_root.join("log_configs").join(&file.id);
  download_to(&file.url, &dest)?;
  Ok(())
}

fn replace_tokens(value: String, context: &LaunchContext) -> String {
  value
    .replace("${auth_player_name}", &context.player_name)
    .replace("${version_name}", &context.version_name)
    .replace("${game_directory}", &context.game_dir)
    .replace("${assets_root}", &context.assets_root)
    .replace("${library_directory}", &context.library_dir)
    .replace("${assets_index_name}", &context.asset_index_name)
    .replace("${auth_uuid}", &context.uuid)
    .replace("${auth_access_token}", &context.access_token)
    .replace("${auth_xuid}", &context.xuid)
    .replace("${clientid}", &context.client_id)
    .replace("${user_type}", &context.user_type)
    .replace("${version_type}", &context.version_type)
    .replace("${user_properties}", "{}")
    .replace("${classpath}", &context.classpath)
    .replace("${classpath_separator}", classpath_separator())
    .replace("${natives_directory}", &context.natives_dir)
    .replace("${path}", &context.logging_path)
    .replace("${launcher_name}", &context.launcher_name)
    .replace("${launcher_version}", &context.launcher_version)
}

fn strip_quickplay_args(args: Vec<String>) -> Vec<String> {
  let mut filtered = Vec::new();
  let mut i = 0;
  while i < args.len() {
    let arg = &args[i];
    if arg.starts_with("--quickPlay") {
      if i + 1 < args.len() {
        let next = &args[i + 1];
        if !next.starts_with("--") {
          i += 2;
          continue;
        }
      }
      i += 1;
      continue;
    }
    filtered.push(arg.clone());
    i += 1;
  }
  filtered
}

fn resolve_player_name(config: &AppConfig) -> Option<String> {
  let active_id = config.active_account_id.as_ref()?;
  config
    .accounts
    .iter()
    .find(|account| &account.id == active_id)
    .map(|account| account.display_name.clone())
}

fn resolve_auth(
  player_name: Option<String>,
  config: &AppConfig,
) -> (String, String, String, String, String) {
  if let Some(active_id) = config.active_account_id.as_ref() {
    if let Some(account) = config.accounts.iter().find(|item| &item.id == active_id) {
      if account.kind == AccountKind::Microsoft {
        if let (Some(token), Some(uuid)) = (account.access_token.clone(), account.uuid.clone()) {
          return (
            account.display_name.clone(),
            uuid,
            token,
            "msa".to_string(),
            "0".to_string(),
          );
        }
      }
      if account.kind == AccountKind::Offline {
        let player = player_name
          .or_else(|| Some(account.display_name.clone()))
          .unwrap_or_else(|| "Player".to_string());
        let uuid = account
          .uuid
          .clone()
          .unwrap_or_else(|| offline_uuid(&player));
        return (player, uuid, "0".to_string(), "legacy".to_string(), "0".to_string());
      }
    }
  }

  let player = player_name
    .or_else(|| resolve_player_name(config))
    .unwrap_or_else(|| "Player".to_string());
  let uuid = offline_uuid(&player);
  (player, uuid, "0".to_string(), "legacy".to_string(), "0".to_string())
}

fn offline_uuid(name: &str) -> String {
  let offline = format!("OfflinePlayer:{}", name);
  uuid::Uuid::new_v3(&uuid::Uuid::NAMESPACE_DNS, offline.as_bytes()).to_string()
}

fn resolve_java_command(config: &AppConfig, instance: &Instance) -> Result<String, String> {
  let override_path = config
    .settings
    .java
    .overrides
    .iter()
    .find(|item| item.instance_id == instance.id)
    .and_then(|item| item.path.clone());

  let path = override_path.or_else(|| config.settings.java.runtime.path.clone());
  if let Some(path) = path {
    let candidate = PathBuf::from(&path);
    if candidate.is_dir() {
      let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
      let bin = candidate.join("bin").join(bin_name);
      if bin.exists() {
        return Ok(bin.to_string_lossy().to_string());
      }
      return Err(format!(
        "Java executable not found. Expected {} inside {}.",
        bin.display(),
        candidate.display()
      ));
    }
    if candidate.exists() {
      return Ok(candidate.to_string_lossy().to_string());
    }
    return Err(format!(
      "Java executable not found at {}.",
      candidate.display()
    ));
  }

  let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
  if let Some(java_home) = env::var_os("JAVA_HOME") {
    let candidate = PathBuf::from(java_home).join("bin").join(bin_name);
    if candidate.exists() {
      return Ok(candidate.to_string_lossy().to_string());
    }
  }
  if let Some(found) = find_in_path(bin_name) {
    return Ok(found.to_string_lossy().to_string());
  }

  Err("Java not found in PATH. Configure a Java path in Settings or set JAVA_HOME.".to_string())
}

fn find_in_path(bin_name: &str) -> Option<PathBuf> {
  let path_var = env::var_os("PATH")?;
  for path in env::split_paths(&path_var) {
    let candidate = path.join(bin_name);
    if candidate.exists() {
      return Some(candidate);
    }
  }
  None
}
