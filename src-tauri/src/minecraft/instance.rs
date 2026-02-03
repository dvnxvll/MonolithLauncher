use crate::config::{AppConfig, Instance, InstanceManifest, Loader, INSTANCE_CONFIG_FILE};
use crate::minecraft::install::{install_fabric, install_forge, install_vanilla};
use crate::minecraft::models::{InstallState, NewInstanceRequest, ProgressEvent};
use std::{fs, path::Path, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

pub fn create_instance(
  request: NewInstanceRequest,
  config: &mut AppConfig,
  emit: &dyn Fn(ProgressEvent),
) -> Result<Instance, String> {
  if request.name.trim().is_empty() {
    return Err("instance name cannot be empty".to_string());
  }
  let requested_name = request.name.trim();
  if config
    .instances
    .iter()
    .any(|instance| instance.name.eq_ignore_ascii_case(requested_name))
  {
    return Err("instance name already exists".to_string());
  }

  if matches!(request.loader, Loader::Fabric | Loader::Forge)
    && request.loader_version.is_none()
  {
    return Err("loader version is required".to_string());
  }

  let root_id = resolve_root_id(&request, config)?;
  let root_path = resolve_root_path(config, &root_id)?;
  let instance_id = allocate_instance_id(&request.name, config, &root_path)?;
  let directory = root_path.join(&instance_id);

  emit(ProgressEvent {
    stage: "prepare".to_string(),
    message: "Preparing instance layout".to_string(),
    current: 0,
    total: None,
    detail: None,
  });
  create_instance_layout(&directory)?;

  let created_at = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();

  let instance = Instance {
    id: instance_id,
    name: request.name,
    version: request.game_version,
    loader: request.loader,
    loader_version: request.loader_version,
    show_snapshots: request.show_snapshots,
    pinned: false,
    root_id: Some(root_id),
    directory: directory.to_string_lossy().to_string(),
    java_min_ram_mb: None,
    java_min_ram_gb: None,
    java_max_ram_mb: None,
    java_max_ram_gb: None,
    jvm_args: None,
  };

  write_instance_manifest(&directory, &instance, created_at)?;
  config.instances.push(instance.clone());
  Ok(instance)
}

pub fn ensure_instance_ready(
  instance: &Instance,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  let instance_dir = PathBuf::from(&instance.directory);
  if !instance_dir.exists() {
    return Err(format!(
      "instance directory '{}' missing",
      instance_dir.display()
    ));
  }

  create_instance_layout(&instance_dir)?;

  if install_state_matches(&instance_dir, instance)? {
    return Ok(());
  }

  emit(ProgressEvent {
    stage: "prepare".to_string(),
    message: "Preparing instance assets".to_string(),
    current: 0,
    total: None,
    detail: None,
  });

  match instance.loader {
    Loader::Vanilla => {
      install_vanilla(&instance.version, &instance_dir, emit)?;
    }
    Loader::Fabric => {
      let loader_version = instance
        .loader_version
        .clone()
        .ok_or_else(|| "fabric loader version is required".to_string())?;
      install_fabric(&instance.version, &loader_version, &instance_dir, emit)?;
    }
    Loader::Forge => {
      let loader_version = instance
        .loader_version
        .clone()
        .ok_or_else(|| "forge version is required".to_string())?;
      install_forge(&instance.version, &loader_version, &instance_dir, emit)?;
    }
  }

  write_install_state(&instance_dir, instance)?;
  Ok(())
}

fn resolve_root_id(request: &NewInstanceRequest, config: &AppConfig) -> Result<String, String> {
  if let Some(root_id) = &request.root_id {
    if config.instance_roots.iter().any(|root| &root.id == root_id) {
      return Ok(root_id.clone());
    }
    return Err(format!("instance root '{}' not found", root_id));
  }

  config
    .default_instance_root_id
    .clone()
    .or_else(|| config.instance_roots.first().map(|root| root.id.clone()))
    .ok_or_else(|| "no instance root configured".to_string())
}

fn resolve_root_path(config: &AppConfig, root_id: &str) -> Result<PathBuf, String> {
  let root = config
    .instance_roots
    .iter()
    .find(|root| root.id == root_id)
    .ok_or_else(|| format!("instance root '{}' not found", root_id))?;

  Ok(PathBuf::from(&root.path))
}

fn allocate_instance_id(
  name: &str,
  config: &AppConfig,
  root_path: &Path,
) -> Result<String, String> {
  let base = sanitize_folder_name(name);
  let mut candidate = base.clone();
  let mut counter = 2;

  loop {
    let exists_in_config = config.instances.iter().any(|instance| instance.id == candidate);
    let exists_on_disk = root_path.join(&candidate).exists();
    if !exists_in_config && !exists_on_disk {
      return Ok(candidate);
    }
    candidate = format!("{} {}", base, counter);
    counter += 1;
  }
}

fn sanitize_folder_name(name: &str) -> String {
  let trimmed = name.trim();
  let mut result = String::new();
  for ch in trimmed.chars() {
    if ch == '/' || ch == '\\' || ch == ':' || ch == '*' || ch == '?' || ch == '\"' || ch == '<'
      || ch == '>' || ch == '|'
    {
      result.push('-');
    } else {
      result.push(ch);
    }
  }
  let cleaned = result.trim().to_string();
  if cleaned.is_empty() {
    "Instance".to_string()
  } else {
    cleaned
  }
}

fn create_instance_layout(instance_dir: &Path) -> Result<(), String> {
  let paths = vec![
    instance_dir.to_path_buf(),
    instance_dir.join("versions"),
    instance_dir.join("libraries"),
    instance_dir.join("assets/indexes"),
    instance_dir.join("assets/objects"),
    instance_dir.join("resourcepacks"),
    instance_dir.join("shaderpacks"),
    instance_dir.join("texturepacks"),
    instance_dir.join("config"),
    instance_dir.join("logs"),
    instance_dir.join("mods"),
    instance_dir.join("installers"),
    instance_dir.join("natives"),
  ];

  for path in paths {
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
  }

  Ok(())
}

fn install_state_matches(instance_dir: &Path, instance: &Instance) -> Result<bool, String> {
  if let Some(mut manifest) = load_manifest(instance_dir) {
    if manifest.installed_version.is_some() {
      return Ok(
        manifest.installed_version.as_deref() == Some(&instance.version)
          && manifest.installed_loader.as_ref() == Some(&instance.loader)
          && manifest.installed_loader_version == instance.loader_version,
      );
    }
    if let Some(install_state) = load_legacy_install_state(instance_dir) {
      manifest.installed_version = Some(install_state.version);
      manifest.installed_loader = Some(install_state.loader);
      manifest.installed_loader_version = install_state.loader_version;
      let _ = save_manifest(instance_dir, &manifest);
      return Ok(
        manifest.installed_version.as_deref() == Some(&instance.version)
          && manifest.installed_loader.as_ref() == Some(&instance.loader)
          && manifest.installed_loader_version == instance.loader_version,
      );
    }
  }

  Ok(false)
}

fn write_install_state(instance_dir: &Path, instance: &Instance) -> Result<(), String> {
  let mut manifest = load_manifest(instance_dir).unwrap_or_else(|| {
    InstanceManifest::from_instance(instance, None)
  });
  manifest.installed_version = Some(instance.version.clone());
  manifest.installed_loader = Some(instance.loader.clone());
  manifest.installed_loader_version = instance.loader_version.clone();
  save_manifest(instance_dir, &manifest)
}

fn load_manifest(instance_dir: &Path) -> Option<InstanceManifest> {
  let path = instance_dir.join(INSTANCE_CONFIG_FILE);
  let data = fs::read_to_string(path).ok()?;
  serde_json::from_str(&data).ok()
}

fn save_manifest(instance_dir: &Path, manifest: &InstanceManifest) -> Result<(), String> {
  let payload = serde_json::to_vec_pretty(manifest)
    .map_err(crate::minecraft::download::map_json_error)?;
  let path = instance_dir.join(INSTANCE_CONFIG_FILE);
  fs::write(path, payload).map_err(|err| err.to_string())
}

fn load_legacy_install_state(instance_dir: &Path) -> Option<InstallState> {
  let path = instance_dir.join("install.json");
  if !path.exists() {
    return None;
  }
  crate::minecraft::download::load_json(&path).ok()
}

fn write_instance_manifest(
  instance_dir: &Path,
  instance: &Instance,
  created_at: u64,
) -> Result<(), String> {
  let manifest = InstanceManifest::from_instance(instance, Some(created_at));
  let payload = serde_json::to_vec_pretty(&manifest)
    .map_err(crate::minecraft::download::map_json_error)?;
  let path = instance_dir.join(INSTANCE_CONFIG_FILE);
  fs::write(path, payload).map_err(|err| err.to_string())?;
  Ok(())
}
