use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::config::{AppConfig, ConfigStore};

fn resolve_home_dir() -> Option<PathBuf> {
  if let Ok(home) = std::env::var("HOME") {
    return Some(PathBuf::from(home));
  }
  if let Ok(home) = std::env::var("USERPROFILE") {
    return Some(PathBuf::from(home));
  }
  None
}

#[tauri::command]
pub(crate) fn load_config(state: tauri::State<'_, Mutex<ConfigStore>>) -> Result<AppConfig, String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  Ok(store.get())
}

#[tauri::command]
pub(crate) fn save_config(
  config: AppConfig,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  store.set(config).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn export_config(state: tauri::State<'_, Mutex<ConfigStore>>) -> Result<String, String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let config = store.get();
  let base = resolve_home_dir().unwrap_or_else(|| PathBuf::from("."));
  let export_path = base.join("monolith-config-export.json");
  let payload = serde_json::to_vec_pretty(&config).map_err(|err| err.to_string())?;
  fs::write(&export_path, payload).map_err(|err| err.to_string())?;
  Ok(export_path.to_string_lossy().to_string())
}
