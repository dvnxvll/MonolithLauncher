use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::commands::system::open_target;
use crate::config::{self, ConfigStore, Instance, InstanceManifest, INSTANCE_CONFIG_FILE};
use crate::resolve_instance_dir;

fn load_manifest(path: &PathBuf) -> Result<InstanceManifest, String> {
  let data = fs::read_to_string(path).map_err(|err| err.to_string())?;
  serde_json::from_str(&data).map_err(|err| err.to_string())
}

fn save_manifest(path: &PathBuf, manifest: &InstanceManifest) -> Result<(), String> {
  let payload = serde_json::to_vec_pretty(manifest).map_err(|err| err.to_string())?;
  fs::write(path, payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn open_instance_folder(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let path = resolve_instance_dir(&instance_id, &state)?;
  if !path.exists() {
    return Err("instance directory missing".to_string());
  }
  let target = path.to_string_lossy().to_string();
  open_target(&target)
}

#[tauri::command]
pub(crate) fn open_instance_path(
  instance_id: String,
  kind: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let target = match kind.as_str() {
    "root" => instance_dir,
    "resourcepacks" => instance_dir.join("resourcepacks"),
    "shaderpacks" => instance_dir.join("shaderpacks"),
    "texturepacks" => instance_dir.join("texturepacks"),
    "mods" => instance_dir.join("mods"),
    "worlds" | "saves" => instance_dir.join("saves"),
    "servers" => instance_dir.join("servers.dat"),
    _ => return Err("unsupported path kind".to_string()),
  };
  if !target.exists() {
    return Err("target path missing".to_string());
  }
  open_target(&target.to_string_lossy())
}

#[tauri::command]
pub(crate) fn rename_instance(
  instance_id: String,
  new_name: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  if new_name.trim().is_empty() {
    return Err("instance name cannot be empty".to_string());
  }
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let config = store.get();
  let instance = config
    .instances
    .iter()
    .find(|item| item.id == instance_id)
    .ok_or_else(|| "instance not found".to_string())?;
  let manifest_path = PathBuf::from(&instance.directory).join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path)?;
  manifest.name = new_name.trim().to_string();
  save_manifest(&manifest_path, &manifest)
}

#[tauri::command]
pub(crate) fn set_instance_pinned(
  instance_id: String,
  pinned: bool,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let manifest_path = instance_dir.join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path)?;
  manifest.pinned = pinned;
  save_manifest(&manifest_path, &manifest)
}

#[tauri::command]
pub(crate) fn remove_instance(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  let instance = config
    .instances
    .iter()
    .find(|item| item.id == instance_id)
    .ok_or_else(|| "instance not found".to_string())?
    .clone();
  let instance_dir = PathBuf::from(&instance.directory);
  if instance_dir.exists() {
    fs::remove_dir_all(&instance_dir).map_err(|err| err.to_string())?;
  }
  config.instances.retain(|item| item.id != instance.id);
  if config.settings.reference_instance_id.as_deref() == Some(&instance.id) {
    config.settings.reference_instance_id = None;
  }
  config
    .settings
    .java
    .overrides
    .retain(|item| item.instance_id != instance.id);
  store.set(config).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub(crate) fn repair_instance(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let config = store.get();
  let instance = config
    .instances
    .iter()
    .find(|item| item.id == instance_id)
    .ok_or_else(|| "instance not found".to_string())?;
  let manifest_path = PathBuf::from(&instance.directory).join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path)?;
  manifest.installed_version = None;
  manifest.installed_loader = None;
  manifest.installed_loader_version = None;
  save_manifest(&manifest_path, &manifest)?;
  let legacy_install = PathBuf::from(&instance.directory).join("install.json");
  let _ = fs::remove_file(legacy_install);
  let versions_dir = PathBuf::from(&instance.directory).join("versions");
  let libraries_dir = PathBuf::from(&instance.directory).join("libraries");
  let natives_dir = PathBuf::from(&instance.directory).join("natives");
  let installers_dir = PathBuf::from(&instance.directory).join("installers");
  let _ = fs::remove_dir_all(versions_dir);
  let _ = fs::remove_dir_all(libraries_dir);
  let _ = fs::remove_dir_all(natives_dir);
  let _ = fs::remove_dir_all(installers_dir);
  Ok(())
}

#[tauri::command]
pub(crate) fn import_instance(
  path: String,
  name: String,
  version: String,
  loader: config::Loader,
  loader_version: Option<String>,
  show_snapshots: bool,
  root_id: Option<String>,
) -> Result<(), String> {
  if matches!(loader, config::Loader::Fabric | config::Loader::Forge)
    && loader_version.is_none()
  {
    return Err("loader version is required".to_string());
  }
  let directory = PathBuf::from(&path);
  if !directory.is_dir() {
    return Err("instance directory does not exist".to_string());
  }
  let id = directory
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| "invalid instance folder name".to_string())?
    .to_string();
  let instance = Instance {
    id,
    name: name.trim().to_string(),
    version: version.trim().to_string(),
    loader,
    loader_version,
    show_snapshots,
    pinned: false,
    root_id,
    directory: directory.to_string_lossy().to_string(),
    java_min_ram_mb: None,
    java_min_ram_gb: None,
    java_max_ram_mb: None,
    java_max_ram_gb: None,
    jvm_args: None,
  };
  let created_at = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let manifest = InstanceManifest::from_instance(&instance, Some(created_at));
  let manifest_path = directory.join(INSTANCE_CONFIG_FILE);
  save_manifest(&manifest_path, &manifest)?;
  Ok(())
}

#[tauri::command]
pub(crate) fn update_instance_settings(
  instance_id: String,
  min_ram_mb: Option<u32>,
  max_ram_mb: Option<u32>,
  jvm_args: Option<String>,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let manifest_path = instance_dir.join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path)?;
  manifest.java_min_ram_mb = min_ram_mb;
  manifest.java_min_ram_gb = None;
  manifest.java_max_ram_mb = max_ram_mb;
  manifest.java_max_ram_gb = None;
  manifest.jvm_args = jvm_args.and_then(|value| {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  });
  save_manifest(&manifest_path, &manifest)
}
