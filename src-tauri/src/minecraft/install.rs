use crate::minecraft::download::{download_to, fetch_json, fetch_text, load_json};
use crate::minecraft::models::{
  FabricProfile, ForgeProfile, MojangAssetIndexFile, MojangVersionMeta, NativeJar, ProfileLibrary,
  ProgressEvent,
};
use crate::minecraft::util::{
  build_maven_path_url, current_arch_suffix, current_os_name, is_excluded, library_allowed,
  parse_maven_coordinate, resolve_library_artifact,
};
use crate::minecraft::{
  DEFAULT_LIBRARIES_URL, FABRIC_LOADER_URL, MOJANG_MANIFEST_URL, RESOURCES_BASE_URL,
};
use std::{
  collections::HashSet,
  fs,
  io,
  path::Path,
  process::Command,
};
use zip::ZipArchive;

pub(crate) fn install_vanilla(
  game_version: &str,
  instance_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  emit(ProgressEvent {
    stage: "version".to_string(),
    message: format!("Resolving {}", game_version),
    current: 0,
    total: None,
  });

  let manifest: crate::minecraft::models::MojangManifest = fetch_json(MOJANG_MANIFEST_URL)?;
  let entry = manifest
    .versions
    .into_iter()
    .find(|version| version.id == game_version)
    .ok_or_else(|| format!("vanilla version '{}' not found", game_version))?;

  let version_dir = instance_dir.join("versions").join(&entry.id);
  fs::create_dir_all(&version_dir).map_err(|err| err.to_string())?;

  let version_json_path = version_dir.join(format!("{}.json", entry.id));
  download_to(&entry.url, &version_json_path)?;

  let version_meta: MojangVersionMeta = load_json(&version_json_path)?;
  let client_jar_path = version_dir.join(format!("{}.jar", entry.id));
  download_to(&version_meta.downloads.client.url, &client_jar_path)?;

  let libraries_dir = instance_dir.join("libraries");
  let natives_dir = instance_dir.join("natives").join(&entry.id);
  let native_jars = download_mojang_libraries(&version_meta, &libraries_dir, emit)?;
  extract_natives(&native_jars, &natives_dir, emit)?;

  download_assets(&version_meta, instance_dir, emit)?;

  Ok(())
}

pub(crate) fn install_fabric(
  game_version: &str,
  loader_version: &str,
  instance_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  let url = format!(
    "{}/{}/{}/profile/json",
    FABRIC_LOADER_URL,
    urlencoding::encode(game_version),
    urlencoding::encode(loader_version)
  );

  let profile_text = fetch_text(&url)?;
  let profile: FabricProfile = serde_json::from_str(&profile_text)
    .map_err(crate::minecraft::download::map_json_error)?;
  let profile_dir = instance_dir.join("versions").join(&profile.id);
  fs::create_dir_all(&profile_dir).map_err(|err| err.to_string())?;

  let profile_path = profile_dir.join(format!("{}.json", profile.id));
  fs::write(&profile_path, profile_text).map_err(|err| err.to_string())?;

  let base_version = profile
    .inherits_from
    .clone()
    .unwrap_or_else(|| game_version.to_string());
  install_vanilla(&base_version, instance_dir, emit)?;

  let libraries_dir = instance_dir.join("libraries");
  download_fabric_libraries(&profile, &libraries_dir, emit)?;

  Ok(())
}

pub(crate) fn install_forge(
  game_version: &str,
  loader_version: &str,
  instance_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  let full_version = if loader_version.contains(game_version) && loader_version.contains('-') {
    loader_version.to_string()
  } else {
    format!("{}-{}", game_version, loader_version)
  };

  let installer_url = format!(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-installer.jar",
    full_version
  );
  let installer_path = instance_dir
    .join("installers")
    .join(format!("forge-{}-installer.jar", full_version));
  download_to(&installer_url, &installer_path)?;

  install_vanilla(game_version, instance_dir, emit)?;
  run_forge_installer(&installer_path, instance_dir, &full_version, emit)?;
  Ok(())
}

fn download_mojang_libraries(
  meta: &MojangVersionMeta,
  libraries_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<Vec<NativeJar>, String> {
  let os_name = current_os_name();
  let arch = current_arch_suffix();

  let mut jobs = Vec::new();
  let mut seen = HashSet::new();
  let mut native_jars = Vec::new();

  for library in &meta.libraries {
    if !library_allowed(library.rules.as_ref(), os_name) {
      continue;
    }

    if let Some(downloads) = &library.downloads {
      if let Some(artifact) = &downloads.artifact {
        if let Some((url, path)) = resolve_library_artifact(artifact, &library.name, None) {
          let dest = libraries_dir.join(path);
          if seen.insert(dest.clone()) {
            jobs.push(crate::minecraft::models::DownloadJob { url, dest });
          }
        }
      }

      if let Some(natives) = &library.natives {
        if let Some(template) = natives.get(os_name) {
          let classifier = template.replace("${arch}", arch);
          if let Some(classifiers) = &downloads.classifiers {
            if let Some(native_artifact) = classifiers.get(&classifier) {
              if let Some((url, path)) =
                resolve_library_artifact(native_artifact, &library.name, Some(&classifier))
              {
                let excludes = library
                  .extract
                  .as_ref()
                  .and_then(|extract| extract.exclude.clone())
                  .unwrap_or_default();
                let dest = libraries_dir.join(path);
                if seen.insert(dest.clone()) {
                  jobs.push(crate::minecraft::models::DownloadJob { url, dest: dest.clone() });
                }
                native_jars.push(NativeJar { path: dest, excludes });
              }
            }
          }
        }
      }
    }
  }

  let total = jobs.len() as u64;
  for (idx, job) in jobs.into_iter().enumerate() {
    emit(ProgressEvent {
      stage: "libraries".to_string(),
      message: format!("Downloading libraries ({}/{})", idx + 1, total),
      current: (idx + 1) as u64,
      total: Some(total),
    });
    download_to(&job.url, &job.dest)?;
  }

  Ok(native_jars)
}

fn extract_natives(
  native_jars: &[NativeJar],
  natives_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  if native_jars.is_empty() {
    return Ok(());
  }

  fs::create_dir_all(natives_dir).map_err(|err| err.to_string())?;
  let total = native_jars.len() as u64;

  for (idx, native) in native_jars.iter().enumerate() {
    emit(ProgressEvent {
      stage: "natives".to_string(),
      message: format!("Extracting natives ({}/{})", idx + 1, total),
      current: (idx + 1) as u64,
      total: Some(total),
    });

    let file = fs::File::open(&native.path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| err.to_string())?;

    for i in 0..archive.len() {
      let mut file = archive.by_index(i).map_err(|err| err.to_string())?;
      let name = file.name().to_string();
      if name.ends_with('/') || is_excluded(&name, &native.excludes) {
        continue;
      }

      let dest_path = natives_dir.join(&name);
      if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
      }
      let mut out_file = fs::File::create(&dest_path).map_err(|err| err.to_string())?;
      io::copy(&mut file, &mut out_file).map_err(|err| err.to_string())?;
    }
  }

  Ok(())
}

fn download_assets(
  meta: &MojangVersionMeta,
  instance_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  emit(ProgressEvent {
    stage: "assets".to_string(),
    message: "Downloading asset index".to_string(),
    current: 0,
    total: None,
  });

  let asset_index_path = instance_dir
    .join("assets/indexes")
    .join(format!("{}.json", meta.asset_index.id));
  download_to(&meta.asset_index.url, &asset_index_path)?;

  let index: MojangAssetIndexFile = load_json(&asset_index_path)?;
  let total = index.objects.len() as u64;
  let mut count = 0_u64;

  for object in index.objects.values() {
    let hash = object.hash.as_str();
    if hash.len() < 2 {
      continue;
    }
    let prefix = &hash[0..2];
    let dest = instance_dir
      .join("assets/objects")
      .join(prefix)
      .join(hash);

    let url = format!("{}/{}/{}", RESOURCES_BASE_URL, prefix, hash);
    download_to(&url, &dest)?;

    count += 1;
    if count == total || count % 250 == 0 {
      emit(ProgressEvent {
        stage: "assets".to_string(),
        message: format!("Downloading assets ({}/{})", count, total),
        current: count,
        total: Some(total),
      });
    }
  }

  Ok(())
}

fn download_fabric_libraries(
  profile: &FabricProfile,
  libraries_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  if profile.libraries.is_empty() {
    return Ok(());
  }

  let mut jobs = Vec::new();
  for library in &profile.libraries {
    let coordinate = match parse_maven_coordinate(&library.name) {
      Ok(coordinate) => coordinate,
      Err(_) => continue,
    };
    let base_url = library.url.as_deref().unwrap_or(DEFAULT_LIBRARIES_URL);
    if let Ok((path, url)) = build_maven_path_url(base_url, &coordinate) {
      jobs.push(crate::minecraft::models::DownloadJob {
        url,
        dest: libraries_dir.join(path),
      });
    }
  }

  let total = jobs.len() as u64;
  for (idx, job) in jobs.into_iter().enumerate() {
    emit(ProgressEvent {
      stage: "libraries".to_string(),
      message: format!("Downloading Fabric libraries ({}/{})", idx + 1, total),
      current: (idx + 1) as u64,
      total: Some(total),
    });
    download_to(&job.url, &job.dest)?;
  }

  Ok(())
}

fn run_forge_installer(
  installer_path: &Path,
  instance_dir: &Path,
  full_version: &str,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  let forge_version_id = format!("forge-{}", full_version);
  let forge_json_path = instance_dir
    .join("versions")
    .join(&forge_version_id)
    .join(format!("{}.json", forge_version_id));

  if !forge_json_path.exists() {
    emit(ProgressEvent {
      stage: "forge".to_string(),
      message: "Running Forge installer".to_string(),
      current: 0,
      total: None,
    });

    let output = Command::new("java")
      .arg("-jar")
      .arg(installer_path)
      .arg("--installClient")
      .current_dir(instance_dir)
      .output()
      .map_err(|err| format!("failed to run forge installer: {}", err))?;

    if !output.status.success() {
      let stdout = String::from_utf8_lossy(&output.stdout);
      let stderr = String::from_utf8_lossy(&output.stderr);
      return Err(format!(
        "forge installer failed (code {:?}): {} {}",
        output.status.code(),
        stdout.trim(),
        stderr.trim()
      ));
    }
  }

  if forge_json_path.exists() {
    if let Ok(profile) = load_json::<ForgeProfile>(&forge_json_path) {
      let libraries_dir = instance_dir.join("libraries");
      download_profile_libraries(&profile.libraries, &libraries_dir, emit)?;
    }
  }

  Ok(())
}

fn download_profile_libraries(
  libraries: &[ProfileLibrary],
  libraries_dir: &Path,
  emit: &dyn Fn(ProgressEvent),
) -> Result<(), String> {
  if libraries.is_empty() {
    return Ok(());
  }

  let mut jobs = Vec::new();
  for library in libraries {
    let coordinate = match parse_maven_coordinate(&library.name) {
      Ok(coordinate) => coordinate,
      Err(_) => continue,
    };
    let base_url = library.url.as_deref().unwrap_or(DEFAULT_LIBRARIES_URL);
    if let Ok((path, url)) = build_maven_path_url(base_url, &coordinate) {
      jobs.push(crate::minecraft::models::DownloadJob {
        url,
        dest: libraries_dir.join(path),
      });
    }
  }

  let total = jobs.len() as u64;
  for (idx, job) in jobs.into_iter().enumerate() {
    emit(ProgressEvent {
      stage: "libraries".to_string(),
      message: format!("Downloading Forge libraries ({}/{})", idx + 1, total),
      current: (idx + 1) as u64,
      total: Some(total),
    });
    download_to(&job.url, &job.dest)?;
  }

  Ok(())
}
