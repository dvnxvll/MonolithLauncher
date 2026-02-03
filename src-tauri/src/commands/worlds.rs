use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use fastnbt::Value as NbtValue;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};

use crate::config::ConfigStore;
use crate::resolve_instance_dir;

const WORLD_SIZE_CACHE_TTL_SECS: u64 = 300;

#[derive(serde::Serialize)]
pub(crate) struct WorldEntry {
  id: String,
  name: String,
  icon: Option<String>,
  game_mode: Option<String>,
  size_bytes: Option<u64>,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct LevelDat {
  #[serde(rename = "Data")]
  data: LevelData,
  #[serde(flatten)]
  extra: HashMap<String, NbtValue>,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct LevelData {
  #[serde(rename = "LevelName")]
  level_name: String,
  #[serde(flatten)]
  extra: HashMap<String, NbtValue>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct WorldSizeCache {
  size_bytes: u64,
  computed_at: u64,
}

fn resolve_game_mode(data: &LevelData) -> Option<String> {
  let game_type = match data.extra.get("GameType") {
    Some(NbtValue::Int(value)) => Some(*value),
    Some(NbtValue::Byte(value)) => Some(*value as i32),
    Some(NbtValue::Short(value)) => Some(*value as i32),
    _ => None,
  }?;
  let label = match game_type {
    0 => "Survival",
    1 => "Creative",
    2 => "Adventure",
    3 => "Spectator",
    _ => "Unknown",
  };
  Some(label.to_string())
}

fn directory_size(path: &Path) -> u64 {
  let mut total = 0u64;
  let entries = match fs::read_dir(path) {
    Ok(entries) => entries,
    Err(_) => return 0,
  };
  for entry in entries.flatten() {
    let entry_path = entry.path();
    if entry_path.is_dir() {
      total = total.saturating_add(directory_size(&entry_path));
    } else if let Ok(metadata) = entry.metadata() {
      total = total.saturating_add(metadata.len());
    }
  }
  total
}

fn world_cache_path(world_dir: &Path) -> std::path::PathBuf {
  world_dir.join(".monolith-world-cache.json")
}

fn now_epoch_secs() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or(0)
}

fn load_world_size_cache(world_dir: &Path) -> Option<WorldSizeCache> {
  let path = world_cache_path(world_dir);
  let data = fs::read_to_string(path).ok()?;
  serde_json::from_str(&data).ok()
}

fn save_world_size_cache(world_dir: &Path, size_bytes: u64) {
  let cache = WorldSizeCache {
    size_bytes,
    computed_at: now_epoch_secs(),
  };
  if let Ok(payload) = serde_json::to_vec_pretty(&cache) {
    let _ = fs::write(world_cache_path(world_dir), payload);
  }
}

fn resolve_world_size(world_dir: &Path) -> u64 {
  if let Some(cache) = load_world_size_cache(world_dir) {
    let age = now_epoch_secs().saturating_sub(cache.computed_at);
    if age <= WORLD_SIZE_CACHE_TTL_SECS {
      return cache.size_bytes;
    }
  }
  let size_bytes = directory_size(world_dir);
  save_world_size_cache(world_dir, size_bytes);
  size_bytes
}

fn load_level_dat(path: &Path) -> Result<LevelDat, String> {
  if !path.exists() {
    return Ok(LevelDat::default());
  }
  let file = fs::File::open(path).map_err(|err| err.to_string())?;
  let mut decoder = GzDecoder::new(file);
  match fastnbt::from_reader(&mut decoder) {
    Ok(payload) => Ok(payload),
    Err(_) => {
      let raw_file = fs::File::open(path).map_err(|err| err.to_string())?;
      fastnbt::from_reader(raw_file).map_err(|err| err.to_string())
    }
  }
}

fn save_level_dat(path: &Path, payload: &LevelDat) -> Result<(), String> {
  let file = fs::File::create(path).map_err(|err| err.to_string())?;
  let mut encoder = GzEncoder::new(file, Compression::default());
  fastnbt::to_writer(&mut encoder, payload).map_err(|err| err.to_string())?;
  encoder.finish().map_err(|err| err.to_string())?;
  Ok(())
}

fn load_world_icon(world_dir: &Path) -> Result<Option<String>, String> {
  let icon_path = world_dir.join("icon.png");
  if !icon_path.exists() {
    return Ok(None);
  }
  let bytes = fs::read(&icon_path).map_err(|err| err.to_string())?;
  let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
  Ok(Some(format!("data:image/png;base64,{}", encoded)))
}

#[tauri::command]
pub(crate) fn list_instance_worlds(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<WorldEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let worlds_dir = instance_dir.join("saves");
  if !worlds_dir.exists() {
    return Ok(Vec::new());
  }
  let entries = fs::read_dir(&worlds_dir).map_err(|err| err.to_string())?;
  let mut results = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    let id = path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("world")
      .to_string();
    let level_dat = path.join("level.dat");
    let payload = load_level_dat(&level_dat).ok();
    let display_name = payload
      .as_ref()
      .and_then(|payload| {
        let name = payload.data.level_name.trim().to_string();
        if name.is_empty() { None } else { Some(name) }
      })
      .unwrap_or_else(|| id.clone());
    let game_mode = payload.as_ref().and_then(|payload| resolve_game_mode(&payload.data));
    let icon = load_world_icon(&path).ok().flatten();
    let size_bytes = Some(resolve_world_size(&path));
    results.push(WorldEntry {
      id,
      name: display_name,
      icon,
      game_mode,
      size_bytes,
    });
  }
  results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(results)
}

#[tauri::command]
pub(crate) fn update_instance_world(
  instance_id: String,
  world_id: String,
  name: String,
  icon: Option<String>,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let world_dir = instance_dir.join("saves").join(&world_id);
  if !world_dir.exists() {
    return Err("world not found".to_string());
  }
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("world name cannot be empty".to_string());
  }
  let level_dat_path = world_dir.join("level.dat");
  let mut payload = load_level_dat(&level_dat_path).unwrap_or_default();
  payload.data.level_name = trimmed.to_string();
  save_level_dat(&level_dat_path, &payload)?;

  let icon_path = world_dir.join("icon.png");
  match icon {
    Some(value) => {
      let raw = value
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(value.as_str());
      let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|_| "invalid icon data".to_string())?;
      fs::write(&icon_path, bytes).map_err(|err| err.to_string())?;
    }
    None => {
      let _ = fs::remove_file(&icon_path);
    }
  }

  Ok(())
}
