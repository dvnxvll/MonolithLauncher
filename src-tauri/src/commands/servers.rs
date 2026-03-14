use std::collections::HashMap;
use std::fs;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::Path;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

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

#[derive(Clone, serde::Serialize)]
pub(crate) struct ServerLatencyReport {
  pub address: String,
  pub host: String,
  pub port: u16,
  pub probes: u8,
  pub success_count: u8,
  pub failure_count: u8,
  pub loss_pct: f32,
  pub median_ms: Option<f32>,
  pub average_ms: Option<f32>,
  pub jitter_ms: Option<f32>,
}

fn parse_server_target(address: &str) -> Result<(String, u16), String> {
  let value = address.trim();
  if value.is_empty() {
    return Err("server address is required".to_string());
  }
  if value.starts_with('[') {
    if let Some(end) = value.find(']') {
      let host = value[1..end].trim().to_string();
      let port = value
        .get(end + 1..)
        .and_then(|rest| rest.strip_prefix(':'))
        .and_then(|port| port.parse::<u16>().ok())
        .unwrap_or(25565);
      if host.is_empty() {
        return Err("invalid server address".to_string());
      }
      return Ok((host, port));
    }
  }
  if let Some((host, port)) = value.rsplit_once(':') {
    if !host.contains(':') {
      if let Ok(parsed_port) = port.parse::<u16>() {
        return Ok((host.trim().to_string(), parsed_port));
      }
    }
  }
  Ok((value.to_string(), 25565))
}

fn resolve_socket_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
  let mut addrs = (host, port)
    .to_socket_addrs()
    .map_err(|err| err.to_string())?;
  addrs
    .next()
    .ok_or_else(|| "unable to resolve server address".to_string())
}

fn probe_server_latency_sync(
  address: String,
  probes: u8,
  timeout_ms: u64,
) -> Result<ServerLatencyReport, String> {
  let (host, port) = parse_server_target(&address)?;
  let target = resolve_socket_addr(&host, port)?;
  let timeout = Duration::from_millis(timeout_ms);
  let mut samples = Vec::<f32>::new();
  let mut failures: u8 = 0;

  for idx in 0..probes {
    let start = Instant::now();
    let result = TcpStream::connect_timeout(&target, timeout);
    match result {
      Ok(stream) => {
        let elapsed = start.elapsed().as_secs_f32() * 1000.0;
        samples.push(elapsed);
        let _ = stream.shutdown(std::net::Shutdown::Both);
      }
      Err(_) => {
        failures = failures.saturating_add(1);
      }
    }
    if idx + 1 < probes {
      thread::sleep(Duration::from_millis(80));
    }
  }

  samples.sort_by(|a, b| a.total_cmp(b));
  let success_count = samples.len() as u8;
  let loss_pct = if probes == 0 {
    100.0
  } else {
    ((failures as f32) * 100.0) / (probes as f32)
  };
  let average_ms = if success_count > 0 {
    Some(samples.iter().sum::<f32>() / success_count as f32)
  } else {
    None
  };
  let median_ms = if success_count > 0 {
    let middle = success_count as usize / 2;
    if success_count % 2 == 0 {
      Some((samples[middle - 1] + samples[middle]) / 2.0)
    } else {
      Some(samples[middle])
    }
  } else {
    None
  };
  let jitter_ms = if success_count > 1 {
    let mut deltas = Vec::new();
    for pair in samples.windows(2) {
      if let [a, b] = pair {
        deltas.push((b - a).abs());
      }
    }
    Some(deltas.iter().sum::<f32>() / deltas.len() as f32)
  } else {
    None
  };

  Ok(ServerLatencyReport {
    address,
    host,
    port,
    probes,
    success_count,
    failure_count: failures,
    loss_pct,
    median_ms,
    average_ms,
    jitter_ms,
  })
}

#[tauri::command]
pub(crate) async fn analyze_server_latency(
  address: String,
  probes: Option<u8>,
  timeout_ms: Option<u64>,
) -> Result<ServerLatencyReport, String> {
  let probe_count = probes.unwrap_or(5).clamp(1, 10);
  let timeout = timeout_ms.unwrap_or(1200).clamp(200, 5000);
  tauri::async_runtime::spawn_blocking(move || {
    probe_server_latency_sync(address, probe_count, timeout)
  })
  .await
  .map_err(|_| "server latency probe task failed".to_string())?
}
