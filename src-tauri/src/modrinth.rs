use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::State;

use crate::config::ConfigStore;
use crate::minecraft::download_to;
use crate::resolve_instance_dir;

const MODRINTH_BASE_URL: &str = "https://api.modrinth.com/v2";
const MODRINTH_TIMEOUT_SECS: u64 = 20;
const MODRINTH_CACHE_TTL_SECS: u64 = 600;
const MODRINTH_CACHE_MAX_ENTRIES: usize = 64;

#[derive(Deserialize)]
struct ModrinthSearchResponse {
  hits: Vec<ModrinthSearchHit>,
}

#[derive(Deserialize)]
struct ModrinthSearchHit {
  project_id: String,
  title: String,
  description: String,
  downloads: u64,
  author: String,
  slug: String,
  icon_url: Option<String>,
}

#[derive(Serialize, Clone)]
pub(crate) struct ModrinthProjectHit {
  project_id: String,
  title: String,
  description: String,
  downloads: u64,
  author: String,
  slug: String,
  icon_url: Option<String>,
}

#[derive(Clone, Deserialize)]
struct ModrinthVersionFile {
  url: String,
  filename: String,
  primary: bool,
}

#[derive(Clone, Deserialize)]
struct ModrinthVersion {
  version_number: String,
  version_type: String,
  date_published: String,
  files: Vec<ModrinthVersionFile>,
  #[serde(default)]
  dependencies: Vec<ModrinthDependency>,
}

#[derive(Clone, Deserialize)]
struct ModrinthDependency {
  project_id: Option<String>,
  version_id: Option<String>,
  dependency_type: String,
}

#[derive(Deserialize)]
struct ModrinthProjectInfo {
  project_type: String,
}

#[derive(Serialize)]
pub(crate) struct ModrinthInstallResult {
  filename: String,
  version: String,
  project_id: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct ModrinthInstallIndex {
  #[serde(default)]
  mods: HashMap<String, ModrinthInstallRecord>,
  #[serde(default)]
  resources: HashMap<String, ModrinthInstallRecord>,
  #[serde(default)]
  shaders: HashMap<String, ModrinthInstallRecord>,
  #[serde(default)]
  datapacks: HashMap<String, HashMap<String, ModrinthInstallRecord>>,
}

#[derive(Clone, Serialize, Deserialize)]
struct ModrinthInstallRecord {
  filename: String,
  #[serde(default)]
  version: Option<String>,
}

#[derive(Clone)]
struct ModrinthCacheEntry {
  created_at: Instant,
  hits: Vec<ModrinthProjectHit>,
}

static MODRINTH_SEARCH_CACHE: OnceLock<Mutex<HashMap<String, ModrinthCacheEntry>>> =
  OnceLock::new();

fn encode_json_param<T: Serialize>(value: &T) -> Result<String, String> {
  let json = serde_json::to_string(value).map_err(|err| err.to_string())?;
  Ok(urlencoding::encode(&json).into_owned())
}

fn modrinth_agent() -> ureq::Agent {
  ureq::AgentBuilder::new()
    .timeout_connect(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(MODRINTH_TIMEOUT_SECS))
    .build()
}

fn should_retry_http(err: &ureq::Error) -> bool {
  match err {
    ureq::Error::Status(code, _) => *code == 429 || *code >= 500,
    ureq::Error::Transport(_) => true,
  }
}

fn modrinth_request_with_retry(url: &str) -> Result<ureq::Response, String> {
  let delays = [200_u64, 500, 1000, 2000, 4000];
  for (idx, delay) in delays.iter().enumerate() {
    let response = modrinth_agent()
      .get(url)
      .set("User-Agent", "MonolithLauncher")
      .set("Connection", "close")
      .call();
    match response {
      Ok(response) => return Ok(response),
      Err(err) => {
        if !should_retry_http(&err) || idx == delays.len() - 1 {
          return Err(format!("Modrinth request failed: {}", err));
        }
        std::thread::sleep(std::time::Duration::from_millis(*delay));
      }
    }
  }
  Err("Modrinth request failed".to_string())
}

fn fetch_modrinth_text(url: &str) -> Result<String, String> {
  let response = modrinth_request_with_retry(url)?;
  response.into_string().map_err(|err| err.to_string())
}

fn fetch_modrinth_json<T: for<'de> Deserialize<'de>>(url: &str) -> Result<T, String> {
  let text = fetch_modrinth_text(url)?;
  serde_json::from_str(&text).map_err(|err| err.to_string())
}

fn modrinth_search_cache() -> &'static Mutex<HashMap<String, ModrinthCacheEntry>> {
  MODRINTH_SEARCH_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_modrinth_cache(cache: &mut HashMap<String, ModrinthCacheEntry>) {
  let ttl = Duration::from_secs(MODRINTH_CACHE_TTL_SECS);
  cache.retain(|_, entry| entry.created_at.elapsed() < ttl);
  if cache.len() <= MODRINTH_CACHE_MAX_ENTRIES {
    return;
  }
  let mut entries: Vec<(String, Instant)> = cache
    .iter()
    .map(|(key, entry)| (key.clone(), entry.created_at))
    .collect();
  entries.sort_by_key(|(_, created_at)| *created_at);
  let overflow = cache.len().saturating_sub(MODRINTH_CACHE_MAX_ENTRIES);
  for (key, _) in entries.into_iter().take(overflow) {
    cache.remove(&key);
  }
}

fn build_modrinth_cache_key(
  query: &str,
  project_type: &str,
  game_version: &str,
  loader: Option<&str>,
  limit: u32,
  index: Option<&str>,
  extra_facets: &Option<Vec<Vec<String>>>,
) -> String {
  let facets = serde_json::to_string(extra_facets).unwrap_or_default();
  format!(
    "q={}|type={}|ver={}|loader={}|limit={}|sort={}|facets={}",
    query,
    project_type,
    game_version,
    loader.unwrap_or(""),
    limit,
    index.unwrap_or(""),
    facets
  )
}

fn read_modrinth_cache(key: &str) -> Option<Vec<ModrinthProjectHit>> {
  let mut cache = modrinth_search_cache()
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
  prune_modrinth_cache(&mut cache);
  cache.get(key).map(|entry| entry.hits.clone())
}

fn write_modrinth_cache(key: String, hits: Vec<ModrinthProjectHit>) {
  let mut cache = modrinth_search_cache()
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
  cache.insert(
    key,
    ModrinthCacheEntry {
      created_at: Instant::now(),
      hits,
    },
  );
  prune_modrinth_cache(&mut cache);
}

fn modrinth_index_path(instance_dir: &Path) -> PathBuf {
  instance_dir.join("modrinth.json")
}

fn load_modrinth_index(instance_dir: &Path) -> Result<ModrinthInstallIndex, String> {
  let path = modrinth_index_path(instance_dir);
  if !path.exists() {
    return Ok(ModrinthInstallIndex::default());
  }
  let data = fs::read_to_string(path).map_err(|err| err.to_string())?;
  serde_json::from_str(&data).map_err(|err| err.to_string())
}

fn save_modrinth_index(
  instance_dir: &Path,
  installs: &ModrinthInstallIndex,
) -> Result<(), String> {
  let payload = serde_json::to_vec_pretty(installs).map_err(|err| err.to_string())?;
  let path = modrinth_index_path(instance_dir);
  fs::write(path, payload).map_err(|err| err.to_string())
}

fn remove_previous_file(target_dir: &Path, record: Option<ModrinthInstallRecord>) {
  if let Some(record) = record {
    if record.filename.is_empty() {
      return;
    }
    let path = target_dir.join(record.filename);
    let _ = fs::remove_file(path);
  }
}

fn build_search_url(
  query: &str,
  project_type: &str,
  game_version: &str,
  loader: Option<&str>,
  limit: u32,
  index: Option<&str>,
  extra_facets: Option<Vec<Vec<String>>>,
) -> Result<String, String> {
  let mut facets = vec![vec![format!("project_type:{}", project_type)]];
  if !game_version.is_empty() {
    facets.push(vec![format!("versions:{}", game_version)]);
  }
  if let Some(loader) = loader {
    facets.push(vec![format!("categories:{}", loader)]);
  }
  if let Some(extra) = extra_facets {
    for group in extra {
      if !group.is_empty() {
        facets.push(group);
      }
    }
  }
  let facets_param = encode_json_param(&facets)?;
  let mut url = format!(
    "{}/search?query={}&facets={}&limit={}",
    MODRINTH_BASE_URL,
    urlencoding::encode(query),
    facets_param,
    limit
  );
  if let Some(index) = index {
    url.push_str(&format!("&index={}", urlencoding::encode(index)));
  }
  Ok(url)
}

fn resolve_loader_filter(project_type: &str, loader: Option<&str>) -> Option<String> {
  match project_type {
    "resourcepack" => Some("minecraft".to_string()),
    "mod" => loader.map(|value| value.to_string()),
    _ => None,
  }
}

fn resolve_target_dir(
  instance_dir: &Path,
  project_type: &str,
  world_id: Option<&str>,
) -> Result<PathBuf, String> {
  match project_type {
    "mod" => Ok(instance_dir.join("mods")),
    "resourcepack" => Ok(instance_dir.join("resourcepacks")),
    "shader" => Ok(instance_dir.join("shaderpacks")),
    "datapack" => {
      let world = world_id.ok_or_else(|| "world id is required for datapacks".to_string())?;
      Ok(instance_dir.join("saves").join(world).join("datapacks"))
    }
    _ => Err("unsupported Modrinth project type".to_string()),
  }
}

fn get_install_record(
  installs: &ModrinthInstallIndex,
  project_type: &str,
  project_id: &str,
  world_id: Option<&str>,
) -> Option<ModrinthInstallRecord> {
  match project_type {
    "mod" => installs.mods.get(project_id).cloned(),
    "resourcepack" => installs.resources.get(project_id).cloned(),
    "shader" => installs.shaders.get(project_id).cloned(),
    "datapack" => world_id
      .and_then(|world| installs.datapacks.get(world))
      .and_then(|map| map.get(project_id))
      .cloned(),
    _ => None,
  }
}

fn record_install(
  installs: &mut ModrinthInstallIndex,
  project_type: &str,
  project_id: String,
  world_id: Option<&str>,
  record: ModrinthInstallRecord,
  target_dir: &Path,
) {
  match project_type {
    "mod" => {
      let prev = installs.mods.insert(project_id, record);
      remove_previous_file(target_dir, prev);
    }
    "resourcepack" => {
      let prev = installs.resources.insert(project_id, record);
      remove_previous_file(target_dir, prev);
    }
    "shader" => {
      let prev = installs.shaders.insert(project_id, record);
      remove_previous_file(target_dir, prev);
    }
    "datapack" => {
      if let Some(world) = world_id {
        let entry = installs.datapacks.entry(world.to_string()).or_default();
        let prev = entry.insert(project_id, record);
        remove_previous_file(target_dir, prev);
      }
    }
    _ => {}
  }
}

fn fetch_project_type(project_id: &str) -> Result<String, String> {
  let url = format!("{}/project/{}", MODRINTH_BASE_URL, project_id);
  let info: ModrinthProjectInfo = fetch_modrinth_json(&url)?;
  Ok(info.project_type)
}

fn fetch_version_by_id(version_id: &str) -> Result<ModrinthVersion, String> {
  let url = format!("{}/version/{}", MODRINTH_BASE_URL, version_id);
  fetch_modrinth_json(&url)
}

fn select_version<'a>(versions: &'a [ModrinthVersion]) -> Option<&'a ModrinthVersion> {
  if versions.is_empty() {
    return None;
  }
  let mut releases: Vec<&ModrinthVersion> = versions
    .iter()
    .filter(|version| version.version_type == "release")
    .collect();
  if releases.is_empty() {
    releases = versions.iter().collect();
  }
  releases
    .into_iter()
    .max_by(|a, b| a.date_published.cmp(&b.date_published))
}

fn select_file<'a>(version: &'a ModrinthVersion) -> Option<&'a ModrinthVersionFile> {
  version
    .files
    .iter()
    .find(|file| file.primary)
    .or_else(|| version.files.first())
}

#[tauri::command]
pub(crate) async fn search_modrinth_projects(
  query: String,
  project_type: String,
  game_version: String,
  loader: Option<String>,
  limit: Option<u32>,
  sort: Option<String>,
  extra_facets: Option<Vec<Vec<String>>>,
) -> Result<Vec<ModrinthProjectHit>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let resolved_limit = limit.unwrap_or(8);
    let cache_key = build_modrinth_cache_key(
      &query,
      &project_type,
      &game_version,
      loader.as_deref(),
      resolved_limit,
      sort.as_deref(),
      &extra_facets,
    );
    if let Some(cached) = read_modrinth_cache(&cache_key) {
      return Ok(cached);
    }
    let url = build_search_url(
      &query,
      &project_type,
      &game_version,
      loader.as_deref(),
      resolved_limit,
      sort.as_deref(),
      extra_facets,
    )?;
    let response: ModrinthSearchResponse = fetch_modrinth_json(&url)?;
    let hits: Vec<ModrinthProjectHit> = response
      .hits
      .into_iter()
      .map(|hit| ModrinthProjectHit {
        project_id: hit.project_id,
        title: hit.title,
        description: hit.description,
        downloads: hit.downloads,
        author: hit.author,
        slug: hit.slug,
        icon_url: hit.icon_url,
      })
      .collect();
    write_modrinth_cache(cache_key, hits.clone());
    Ok(hits)
  })
  .await
  .map_err(|_| "Modrinth search task failed".to_string())?
}

#[tauri::command]
pub(crate) async fn install_modrinth_project(
  instance_id: String,
  project_id: String,
  project_type: String,
  game_version: String,
  loader: Option<String>,
  world_id: Option<String>,
  state: State<'_, Mutex<ConfigStore>>,
) -> Result<ModrinthInstallResult, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  tauri::async_runtime::spawn_blocking(move || {
    let mut installs = load_modrinth_index(&instance_dir)?;
    let mut visited = HashSet::new();
    let result = install_modrinth_internal(
      &instance_dir,
      &project_id,
      &project_type,
      &game_version,
      loader.as_deref(),
      world_id.as_deref(),
      None,
      &mut installs,
      &mut visited,
    )?;
    save_modrinth_index(&instance_dir, &installs)?;
    Ok(result)
  })
  .await
  .map_err(|_| "Modrinth install task failed".to_string())?
}

fn install_modrinth_internal(
  instance_dir: &Path,
  project_id: &str,
  project_type: &str,
  game_version: &str,
  loader: Option<&str>,
  world_id: Option<&str>,
  version_id: Option<&str>,
  installs: &mut ModrinthInstallIndex,
  visited: &mut HashSet<String>,
) -> Result<ModrinthInstallResult, String> {
  let key = format!("{}:{}", project_type, project_id);
  if !visited.insert(key) {
    let existing = get_install_record(installs, project_type, project_id, world_id);
    return Ok(ModrinthInstallResult {
      filename: existing
        .as_ref()
        .map(|record| record.filename.clone())
        .unwrap_or_default(),
      version: existing
        .as_ref()
        .and_then(|record| record.version.clone())
        .unwrap_or_default(),
      project_id: project_id.to_string(),
    });
  }

  let target_dir = resolve_target_dir(instance_dir, project_type, world_id)?;
  fs::create_dir_all(&target_dir).map_err(|err| err.to_string())?;

  if let Some(record) = get_install_record(installs, project_type, project_id, world_id) {
    let existing_path = target_dir.join(&record.filename);
    if existing_path.exists() {
      return Ok(ModrinthInstallResult {
        filename: record.filename,
        version: record.version.unwrap_or_default(),
        project_id: project_id.to_string(),
      });
    }
  }

  let version = if let Some(version_id) = version_id {
    fetch_version_by_id(version_id)?
  } else {
    let mut url = format!("{}/project/{}/version", MODRINTH_BASE_URL, project_id);
    let versions_param = encode_json_param(&vec![game_version])?;
    url.push_str(&format!("?game_versions={}", versions_param));
    if let Some(loader_value) = resolve_loader_filter(project_type, loader) {
      let loaders_param = encode_json_param(&vec![loader_value])?;
      url.push_str(&format!("&loaders={}", loaders_param));
    }
    let versions: Vec<ModrinthVersion> = fetch_modrinth_json(&url)?;
    select_version(&versions).ok_or_else(|| "no matching Modrinth versions".to_string())?.clone()
  };

  for dependency in &version.dependencies {
    if dependency.dependency_type != "required" {
      continue;
    }
    let dep_project_id = match dependency.project_id.as_ref() {
      Some(project_id) => project_id,
      None => continue,
    };
    let dep_project_type = fetch_project_type(dep_project_id)?;
    if !matches!(
      dep_project_type.as_str(),
      "mod" | "resourcepack" | "shader" | "datapack"
    ) {
      continue;
    }
    if dep_project_type == "datapack" && world_id.is_none() {
      continue;
    }
    let dep_world_id = if dep_project_type == "datapack" {
      world_id
    } else {
      None
    };
    let _ = install_modrinth_internal(
      instance_dir,
      dep_project_id,
      &dep_project_type,
      game_version,
      loader,
      dep_world_id,
      dependency.version_id.as_deref(),
      installs,
      visited,
    )?;
  }

  let file = select_file(&version)
    .ok_or_else(|| "no downloadable files for Modrinth version".to_string())?;
  let destination: PathBuf = target_dir.join(&file.filename);
  download_to(&file.url, &destination)?;

  let record = ModrinthInstallRecord {
    filename: file.filename.clone(),
    version: Some(version.version_number.clone()),
  };
  record_install(
    installs,
    project_type,
    project_id.to_string(),
    world_id,
    record,
    &target_dir,
  );

  Ok(ModrinthInstallResult {
    filename: file.filename.clone(),
    version: version.version_number,
    project_id: project_id.to_string(),
  })
}

#[tauri::command]
pub(crate) fn list_modrinth_installs(
  instance_id: String,
  project_type: String,
  world_id: Option<String>,
  state: State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<String>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let installs = load_modrinth_index(&instance_dir)?;
  let mut entries = match project_type.as_str() {
    "mod" => installs.mods.keys().cloned().collect::<Vec<_>>(),
    "resourcepack" => installs.resources.keys().cloned().collect::<Vec<_>>(),
    "shader" => installs.shaders.keys().cloned().collect::<Vec<_>>(),
    "datapack" => {
      let world = world_id
        .ok_or_else(|| "world id is required for datapacks".to_string())?;
      installs
        .datapacks
        .get(&world)
        .map(|map| map.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default()
    }
    _ => return Err("unsupported Modrinth project type".to_string()),
  };
  entries.sort();
  Ok(entries)
}

#[tauri::command]
pub(crate) fn uninstall_modrinth_project(
  instance_id: String,
  project_id: String,
  project_type: String,
  world_id: Option<String>,
  state: State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let mut installs = load_modrinth_index(&instance_dir)?;
  let (target_dir, record) = match project_type.as_str() {
    "mod" => (instance_dir.join("mods"), installs.mods.remove(&project_id)),
    "resourcepack" => (
      instance_dir.join("resourcepacks"),
      installs.resources.remove(&project_id),
    ),
    "shader" => (
      instance_dir.join("shaderpacks"),
      installs.shaders.remove(&project_id),
    ),
    "datapack" => {
      let world = world_id
        .ok_or_else(|| "world id is required for datapacks".to_string())?;
      let record = if let Some(entry) = installs.datapacks.get_mut(&world) {
        let record = entry.remove(&project_id);
        if entry.is_empty() {
          installs.datapacks.remove(&world);
        }
        record
      } else {
        None
      };
      (
        instance_dir.join("saves").join(&world).join("datapacks"),
        record,
      )
    }
    _ => return Err("unsupported Modrinth project type".to_string()),
  };

  if let Some(record) = record {
    let path = target_dir.join(record.filename);
    if path.exists() {
      fs::remove_file(path).map_err(|err| err.to_string())?;
    }
    save_modrinth_index(&instance_dir, &installs)?;
  }
  Ok(())
}
