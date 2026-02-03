use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use fastnbt::Value as NbtValue;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};

use crate::config::ConfigStore;
use crate::resolve_instance_dir;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct ServerEntry {
  name: String,
  ip: String,
  #[serde(default)]
  accept_textures: Option<bool>,
  #[serde(default)]
  icon: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct ServersDat {
  #[serde(default)]
  servers: Vec<ServerDatEntry>,
  #[serde(flatten)]
  extra: HashMap<String, NbtValue>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct ServerDatEntry {
  name: String,
  ip: String,
  #[serde(rename = "acceptTextures", default)]
  accept_textures: Option<bool>,
  #[serde(default)]
  icon: Option<String>,
  #[serde(flatten)]
  extra: HashMap<String, NbtValue>,
}

fn load_servers_dat(path: &Path) -> Result<ServersDat, String> {
  if !path.exists() {
    return Ok(ServersDat::default());
  }
  let file = fs::File::open(path).map_err(|err| err.to_string())?;
  let mut decoder = GzDecoder::new(file);
  match fastnbt::from_reader(&mut decoder) {
    Ok(payload) => Ok(payload),
    Err(_) => {
      let raw_file = fs::File::open(path).map_err(|err| err.to_string())?;
      match fastnbt::from_reader(raw_file) {
        Ok(payload) => Ok(payload),
        Err(_) => Ok(ServersDat::default()),
      }
    }
  }
}

fn save_servers_dat(path: &Path, servers: Vec<ServerEntry>) -> Result<(), String> {
  let mut payload = if path.exists() {
    load_servers_dat(path)?
  } else {
    ServersDat::default()
  };
  payload.servers = servers
    .into_iter()
    .map(|entry| ServerDatEntry {
      name: entry.name,
      ip: entry.ip,
      accept_textures: entry.accept_textures,
      icon: entry.icon.and_then(|value| {
        if let Some(stripped) = value.strip_prefix("data:image/png;base64,") {
          Some(stripped.to_string())
        } else {
          Some(value)
        }
      }),
      extra: HashMap::new(),
    })
    .collect();
  let file = fs::File::create(path).map_err(|err| err.to_string())?;
  let mut encoder = GzEncoder::new(file, Compression::default());
  fastnbt::to_writer(&mut encoder, &payload).map_err(|err| err.to_string())?;
  encoder.finish().map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub(crate) fn list_instance_servers(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<ServerEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let servers_file = instance_dir.join("servers.dat");
  if !servers_file.exists() {
    return Ok(Vec::new());
  }
  let payload = load_servers_dat(&servers_file)?;
  let entries = payload
    .servers
    .into_iter()
    .map(|entry| ServerEntry {
      name: entry.name,
      ip: entry.ip,
      accept_textures: entry.accept_textures,
      icon: entry.icon,
    })
    .collect();
  Ok(entries)
}

#[tauri::command]
pub(crate) fn save_instance_servers(
  instance_id: String,
  servers: Vec<ServerEntry>,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let servers_file = instance_dir.join("servers.dat");
  save_servers_dat(&servers_file, servers)
}
