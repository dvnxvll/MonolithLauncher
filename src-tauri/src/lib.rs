mod config;
mod minecraft;

use config::{AppConfig, ConfigStore, Instance, InstanceManifest, INSTANCE_CONFIG_FILE};
use minecraft::{
  create_instance as create_instance_impl, list_fabric_game_versions as list_fabric_games_impl,
  list_fabric_loader_versions as list_fabric_loaders_impl,
  list_forge_versions as list_forge_versions_impl,
  list_vanilla_versions as list_vanilla_versions_impl, launch_instance as launch_instance_impl,
  ForgeVersionSummary, LoaderVersionSummary, NewInstanceRequest, ProgressEvent, VersionSummary,
};
use std::{
  collections::HashMap,
  env,
  fs,
  io::{Read, Write},
  net::TcpListener,
  path::{Path, PathBuf},
  process::Command,
  sync::Mutex,
  thread,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use regex::Regex;
use rand::RngCore;
use sha2::{Digest, Sha256};
use base64::Engine;
use sysinfo::{Pid, System};

#[tauri::command]
fn ping() -> String {
  "pong".into()
}

fn open_target(target: &str) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    Command::new("explorer")
      .arg(target)
      .spawn()
      .map_err(|err| err.to_string())?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(target)
      .spawn()
      .map_err(|err| err.to_string())?;
    return Ok(());
  }
  #[cfg(target_os = "linux")]
  {
    Command::new("xdg-open")
      .arg(target)
      .spawn()
      .map_err(|err| err.to_string())?;
    return Ok(());
  }
  Err("unsupported platform".to_string())
}

fn load_manifest(path: &Path) -> Result<InstanceManifest, String> {
  let data = fs::read_to_string(path).map_err(|err| err.to_string())?;
  serde_json::from_str(&data).map_err(|err| err.to_string())
}

fn save_manifest(path: &Path, manifest: &InstanceManifest) -> Result<(), String> {
  let payload = serde_json::to_vec_pretty(manifest).map_err(|err| err.to_string())?;
  fs::write(path, payload).map_err(|err| err.to_string())
}

fn resolve_home_dir() -> Option<PathBuf> {
  if let Ok(home) = env::var("HOME") {
    return Some(PathBuf::from(home));
  }
  if let Ok(home) = env::var("USERPROFILE") {
    return Some(PathBuf::from(home));
  }
  None
}

fn parse_code_from_request(request: &str) -> Option<String> {
  let first_line = request.lines().next()?;
  let mut parts = first_line.split_whitespace();
  let _method = parts.next()?;
  let path = parts.next()?;
  let query = path.split('?').nth(1)?;
  for pair in query.split('&') {
    let mut kv = pair.splitn(2, '=');
    let key = kv.next()?;
    let value = kv.next().unwrap_or_default();
    if key == "code" {
      return urlencoding::decode(value).ok().map(|v| v.to_string());
    }
  }
  None
}

fn respond_ok(mut stream: std::net::TcpStream) {
  let body = r#"<html><body><h3>Microsoft sign-in complete.</h3><p>You can return to Monolith.</p></body></html>"#;
  let response = format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
    body.len(),
    body
  );
  let _ = stream.write_all(response.as_bytes());
}

fn generate_pkce_pair() -> Result<(String, String), String> {
  let mut bytes = [0u8; 32];
  rand::thread_rng().fill_bytes(&mut bytes);
  let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
  let mut hasher = Sha256::new();
  hasher.update(verifier.as_bytes());
  let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hasher.finalize());
  Ok((verifier, challenge))
}

#[tauri::command]
fn start_microsoft_login(
  window: tauri::Window,
  client_id: String,
  login_state: tauri::State<'_, Mutex<MicrosoftLoginState>>,
) -> Result<String, String> {
  let redirect_uri = "http://localhost:6542";
  let scope = "XboxLive.signin offline_access openid profile";
  let (verifier, challenge) = generate_pkce_pair()?;
  if let Ok(mut state) = login_state.lock() {
    state.code_verifier = Some(verifier);
  }
  let authorize_url = format!(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&prompt=select_account&domain_hint=consumers&code_challenge_method=S256&code_challenge={}",
    urlencoding::encode(&client_id),
    urlencoding::encode(redirect_uri),
    urlencoding::encode(scope),
    urlencoding::encode(&challenge),
  );

  let handle = window.clone();
  thread::spawn(move || {
    let listener = match TcpListener::bind("127.0.0.1:6542") {
      Ok(listener) => listener,
      Err(_) => {
        let _ = handle.emit("microsoft:error", "Unable to bind localhost:6542");
        return;
      }
    };
    if let Ok((mut stream, _)) = listener.accept() {
      let mut buffer = [0u8; 8192];
      let read = stream.read(&mut buffer).unwrap_or(0);
      let request = String::from_utf8_lossy(&buffer[..read]).to_string();
      if let Some(code) = parse_code_from_request(&request) {
        let _ = handle.emit("microsoft:code", code);
      } else {
        let _ = handle.emit("microsoft:error", "Missing code in callback");
      }
      respond_ok(stream);
    }
  });

  Ok(authorize_url)
}

fn format_ureq_error(err: ureq::Error) -> String {
  match err {
    ureq::Error::Status(code, mut response) => {
      let body = response.into_string().unwrap_or_else(|_| "".to_string());
      if body.is_empty() {
        format!("status code {}", code)
      } else {
        format!("status code {}: {}", code, body)
      }
    }
    ureq::Error::Transport(err) => err.to_string(),
  }
}

fn post_form(url: &str, body: &str) -> Result<ureq::Response, String> {
  ureq::post(url)
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send_string(body)
    .map_err(format_ureq_error)
}

fn post_json<T: serde::Serialize>(url: &str, body: &T) -> Result<ureq::Response, String> {
  ureq::post(url)
    .set("Content-Type", "application/json")
    .set("Accept", "application/json")
    .send_json(serde_json::to_value(body).map_err(|err| err.to_string())?)
    .map_err(format_ureq_error)
}

fn refresh_microsoft_token(
  client_id: &str,
  refresh_token: &str,
) -> Result<OAuthTokenResponse, String> {
  let body = format!(
    "client_id={}&scope={}&refresh_token={}&grant_type=refresh_token",
    urlencoding::encode(client_id),
    urlencoding::encode("XboxLive.signin offline_access openid profile"),
    urlencoding::encode(refresh_token),
  );
  post_form("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", &body)?
    .into_json()
    .map_err(|err| err.to_string())
}

fn check_entitlements(access_token: &str) -> Result<bool, String> {
  let response: EntitlementsResponse =
    ureq::get("https://api.minecraftservices.com/entitlements/mcstore")
      .set("Authorization", &format!("Bearer {}", access_token))
      .call()
      .map_err(|err| err.to_string())?
      .into_json()
      .map_err(|err| err.to_string())?;
  Ok(!response.items.is_empty())
}

#[tauri::command]
fn complete_microsoft_login(
  code: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
  login_state: tauri::State<'_, Mutex<MicrosoftLoginState>>,
) -> Result<config::Account, String> {
  let (client_id, code_verifier) = {
    let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
    let config = store.get();
    let client_id = config.settings.microsoft_client_id;
    let verifier = login_state
      .lock()
      .map_err(|_| "login state lock poisoned".to_string())?
      .code_verifier
      .clone()
      .ok_or_else(|| "missing PKCE verifier".to_string())?;
    (client_id, verifier)
  };

  let token_body = format!(
    "client_id={}&scope={}&code={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}",
    urlencoding::encode(&client_id),
    urlencoding::encode("XboxLive.signin offline_access openid profile"),
    urlencoding::encode(&code),
    urlencoding::encode("http://localhost:6542"),
    urlencoding::encode(&code_verifier),
  );
  let token_response: OAuthTokenResponse = post_form(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    &token_body,
  )?
  .into_json()
  .map_err(|err| err.to_string())?;

  let xbl_body = serde_json::json!({
    "Properties": {
      "AuthMethod": "RPS",
      "SiteName": "user.auth.xboxlive.com",
      "RpsTicket": format!("d={}", token_response.access_token),
    },
    "RelyingParty": "http://auth.xboxlive.com",
    "TokenType": "JWT"
  });
  let xbl_response: XblResponse = post_json(
    "https://user.auth.xboxlive.com/user/authenticate",
    &xbl_body,
  )?
  .into_json()
  .map_err(|err| err.to_string())?;

  let uhs = xbl_response
    .display_claims
    .xui
    .get(0)
    .ok_or_else(|| "missing xbox user hash".to_string())?
    .uhs
    .clone();

  let xsts_body = serde_json::json!({
    "Properties": {
      "SandboxId": "RETAIL",
      "UserTokens": [xbl_response.token]
    },
    "RelyingParty": "rp://api.minecraftservices.com/",
    "TokenType": "JWT"
  });
  let xsts_response: XblResponse = post_json(
    "https://xsts.auth.xboxlive.com/xsts/authorize",
    &xsts_body,
  )?
  .into_json()
  .map_err(|err| err.to_string())?;

  let identity_token = format!("XBL3.0 x={};{}", uhs, xsts_response.token);
  let mc_body = serde_json::json!({ "identityToken": identity_token });
  let mc_response: MinecraftLoginResponse = post_json(
    "https://api.minecraftservices.com/authentication/login_with_xbox",
    &mc_body,
  )?
  .into_json()
  .map_err(|err| err.to_string())?;

  let profile: MinecraftProfile = ureq::get("https://api.minecraftservices.com/minecraft/profile")
    .set("Authorization", &format!("Bearer {}", mc_response.access_token))
    .call()
    .map_err(format_ureq_error)?
    .into_json()
    .map_err(|err| err.to_string())?;

  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let expires_at = now.saturating_add(mc_response.expires_in);

  let account_id = format!("microsoft-{}", profile.id);
  let account = config::Account {
    id: account_id.clone(),
    display_name: profile.name.clone(),
    kind: config::AccountKind::Microsoft,
    last_used: None,
    access_token: Some(mc_response.access_token),
    refresh_token: token_response.refresh_token,
    expires_at: Some(expires_at),
    uuid: Some(profile.id),
    owns_minecraft: None,
  };

  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  config.accounts.retain(|item| item.id != account_id);
  config.accounts.push(account.clone());
  config.active_account_id = Some(account_id);
  store.set(config).map_err(|err| err.to_string())?;

  Ok(account)
}

#[tauri::command]
fn refresh_microsoft_accounts(
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<usize, String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  let client_id = config.settings.microsoft_client_id.clone();
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let mut refreshed = 0usize;

  for account in &mut config.accounts {
    if account.kind != config::AccountKind::Microsoft {
      continue;
    }
    let needs_refresh = account
      .expires_at
      .map(|ts| ts <= now.saturating_add(60))
      .unwrap_or(true)
      || account.access_token.is_none();
    if !needs_refresh {
      continue;
    }
    let refresh = match &account.refresh_token {
      Some(token) => token.clone(),
      None => continue,
    };
    let token_response = refresh_microsoft_token(&client_id, &refresh)?;
    account.access_token = Some(token_response.access_token);
    if let Some(next_refresh) = token_response.refresh_token {
      account.refresh_token = Some(next_refresh);
    }
    account.expires_at = Some(now.saturating_add(token_response.expires_in));
    refreshed += 1;
  }

  store.set(config).map_err(|err| err.to_string())?;
  Ok(refreshed)
}

#[tauri::command]
fn check_minecraft_ownership(
  state: tauri::State<'_, Mutex<ConfigStore>>,
  account_id: Option<String>,
) -> Result<usize, String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  let mut checked = 0usize;

  for account in &mut config.accounts {
    if account.kind != config::AccountKind::Microsoft {
      continue;
    }
    if let Some(target) = &account_id {
      if &account.id != target {
        continue;
      }
    }
    let token = match &account.access_token {
      Some(token) => token.clone(),
      None => continue,
    };
    let owns = check_entitlements(&token)?;
    account.owns_minecraft = Some(owns);
    checked += 1;
  }

  store.set(config).map_err(|err| err.to_string())?;
  Ok(checked)
}

fn resolve_instance_dir(
  instance_id: &str,
  state: &tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<PathBuf, String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let config = store.get();
  let instance = config
    .instances
    .iter()
    .find(|item| item.id == instance_id)
    .ok_or_else(|| "instance not found".to_string())?;
  Ok(PathBuf::from(&instance.directory))
}

fn strip_known_suffixes(name: &str) -> String {
  name
    .trim_end_matches(".disabled")
    .trim_end_matches(".jar")
    .trim_end_matches(".zip")
    .to_string()
}

fn parse_version_from_name(name: &str) -> Option<String> {
  let trimmed = strip_known_suffixes(name);
  let parts: Vec<&str> = trimmed.rsplitn(2, '-').collect();
  if parts.len() == 2 {
    let candidate = parts[0];
    if candidate.chars().any(|ch| ch.is_ascii_digit()) {
      return Some(candidate.to_string());
    }
  }
  None
}

#[derive(serde::Serialize)]
struct JavaDetection {
  path: Option<String>,
  version: Option<String>,
}

#[derive(serde::Serialize)]
struct ModEntry {
  name: String,
  filename: String,
  version: Option<String>,
  enabled: bool,
}

#[derive(serde::Serialize)]
struct PackEntry {
  name: String,
  filename: String,
  version: Option<String>,
  enabled: bool,
}

#[derive(serde::Serialize)]
struct SimpleEntry {
  name: String,
  version: Option<String>,
  info: Option<String>,
}

#[derive(serde::Serialize)]
struct InstanceMetrics {
  rss_mb: f32,
}

#[derive(Default)]
struct MicrosoftLoginState {
  code_verifier: Option<String>,
}

#[derive(serde::Deserialize)]
struct OAuthTokenResponse {
  access_token: String,
  refresh_token: Option<String>,
  expires_in: u64,
  token_type: Option<String>,
  scope: Option<String>,
}

#[derive(serde::Deserialize)]
struct XblResponse {
  #[serde(rename = "Token")]
  token: String,
  #[serde(rename = "DisplayClaims")]
  display_claims: XblClaims,
}

#[derive(serde::Deserialize)]
struct XblClaims {
  xui: Vec<XblUser>,
}

#[derive(serde::Deserialize)]
struct XblUser {
  uhs: String,
}

#[derive(serde::Deserialize)]
struct MinecraftLoginResponse {
  access_token: String,
  expires_in: u64,
  token_type: Option<String>,
}

#[derive(serde::Deserialize)]
struct MinecraftProfile {
  id: String,
  name: String,
}

#[derive(serde::Deserialize)]
struct EntitlementsResponse {
  items: Vec<EntitlementItem>,
}

#[derive(serde::Deserialize)]
struct EntitlementItem {
  name: Option<String>,
}

#[tauri::command]
fn detect_java() -> Result<JavaDetection, String> {
  let java_path = find_java_binary().ok();
  let version = detect_java_version(java_path.as_deref().unwrap_or("java"));
  Ok(JavaDetection {
    path: java_path,
    version,
  })
}

fn find_java_binary() -> Result<String, String> {
  let output = if cfg!(target_os = "windows") {
    Command::new("where").arg("java").output()
  } else {
    Command::new("which").arg("java").output()
  }
  .map_err(|err| err.to_string())?;

  if !output.status.success() {
    return Err("java not found in PATH".to_string());
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  let first = stdout.lines().next().ok_or_else(|| "java path missing".to_string())?;
  Ok(first.trim().to_string())
}

fn detect_java_version(java_cmd: &str) -> Option<String> {
  let output = Command::new(java_cmd).arg("-version").output().ok()?;
  let combined = String::from_utf8_lossy(&output.stderr).to_string()
    + &String::from_utf8_lossy(&output.stdout);
  let re = Regex::new(r#""(\d+)(?:\.\d+)*""#).ok()?;
  re.captures(&combined)
    .and_then(|cap| cap.get(1))
    .map(|m| m.as_str().to_string())
}

#[tauri::command]
fn load_config(state: tauri::State<'_, Mutex<ConfigStore>>) -> Result<AppConfig, String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  Ok(store.get())
}

#[tauri::command]
fn save_config(
  config: AppConfig,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  store.set(config).map_err(|err| err.to_string())
}

#[tauri::command]
fn open_instance_folder(
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
fn rename_instance(
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
fn remove_instance(
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
  let disabled_path = PathBuf::from(&instance.directory).join("instance.json.disabled");
  fs::rename(manifest_path, disabled_path).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  open_target(&url)
}

#[tauri::command]
fn export_config(state: tauri::State<'_, Mutex<ConfigStore>>) -> Result<String, String> {
  let store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let config = store.get();
  let base = resolve_home_dir().unwrap_or_else(|| PathBuf::from("."));
  let export_path = base.join("monolith-config-export.json");
  let payload = serde_json::to_vec_pretty(&config).map_err(|err| err.to_string())?;
  fs::write(&export_path, payload).map_err(|err| err.to_string())?;
  Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
fn import_instance(
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
    root_id,
    directory: directory.to_string_lossy().to_string(),
    java_min_ram_gb: None,
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
fn list_instance_mods(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<ModEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let mods_dir = instance_dir.join("mods");
  if !mods_dir.exists() {
    return Ok(Vec::new());
  }
  let entries = fs::read_dir(&mods_dir).map_err(|err| err.to_string())?;
  let mut results = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let filename = match path.file_name().and_then(|name| name.to_str()) {
      Some(name) => name.to_string(),
      None => continue,
    };
    if !filename.ends_with(".jar") && !filename.ends_with(".disabled") {
      continue;
    }
    let enabled = filename.ends_with(".jar");
    let name = strip_known_suffixes(&filename);
    let version = parse_version_from_name(&filename);
    results.push(ModEntry {
      name,
      filename,
      version,
      enabled,
    });
  }
  results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(results)
}

#[tauri::command]
fn toggle_mod(
  instance_id: String,
  filename: String,
  enabled: bool,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let mods_dir = instance_dir.join("mods");
  let source = mods_dir.join(&filename);
  if !source.exists() {
    return Err("mod file not found".to_string());
  }
  let target = if enabled {
    if filename.ends_with(".disabled") {
      mods_dir.join(filename.trim_end_matches(".disabled"))
    } else {
      return Ok(());
    }
  } else if filename.ends_with(".jar") {
    mods_dir.join(format!("{}.disabled", filename))
  } else {
    return Ok(());
  };
  fs::rename(source, target).map_err(|err| err.to_string())?;
  Ok(())
}

fn resolve_pack_dir(instance_dir: &Path, kind: &str) -> Option<PathBuf> {
  let folder = match kind {
    "resourcepacks" => "resourcepacks",
    "shaderpacks" => "shaderpacks",
    "texturepacks" => "texturepacks",
    "mods" => "mods",
    _ => return None,
  };
  Some(instance_dir.join(folder))
}

#[tauri::command]
fn list_instance_packs(
  instance_id: String,
  kind: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<PackEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let pack_dir = resolve_pack_dir(&instance_dir, &kind)
    .ok_or_else(|| "unsupported pack kind".to_string())?;
  if !pack_dir.exists() {
    return Ok(Vec::new());
  }
  let entries = fs::read_dir(&pack_dir).map_err(|err| err.to_string())?;
  let mut results = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    let filename = match path.file_name().and_then(|name| name.to_str()) {
      Some(name) => name.to_string(),
      None => continue,
    };
    let enabled = !filename.ends_with(".disabled");
    let name = strip_known_suffixes(&filename);
    let version = parse_version_from_name(&filename);
    results.push(PackEntry {
      name,
      filename,
      version,
      enabled,
    });
  }
  results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(results)
}

#[tauri::command]
fn toggle_instance_pack(
  instance_id: String,
  kind: String,
  filename: String,
  enabled: bool,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let pack_dir = resolve_pack_dir(&instance_dir, &kind)
    .ok_or_else(|| "unsupported pack kind".to_string())?;
  let source = pack_dir.join(&filename);
  if !source.exists() {
    return Err("pack file not found".to_string());
  }
  let target = if enabled {
    if filename.ends_with(".disabled") {
      pack_dir.join(filename.trim_end_matches(".disabled"))
    } else {
      return Ok(());
    }
  } else if filename.ends_with(".disabled") {
    return Ok(());
  } else {
    pack_dir.join(format!("{}.disabled", filename))
  };
  fs::rename(source, target).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
fn list_instance_worlds(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<SimpleEntry>, String> {
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
    let name = path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("World")
      .to_string();
    results.push(SimpleEntry {
      name,
      version: None,
      info: Some("World".to_string()),
    });
  }
  results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(results)
}

#[tauri::command]
fn list_instance_servers(
  instance_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<SimpleEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let servers_file = instance_dir.join("servers.dat");
  let mut results = Vec::new();
  if servers_file.exists() {
    results.push(SimpleEntry {
      name: "servers.dat".to_string(),
      version: None,
      info: Some("Present".to_string()),
    });
  }
  Ok(results)
}

#[tauri::command]
fn open_instance_path(
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
    _ => return Err("unsupported path kind".to_string()),
  };
  if !target.exists() {
    return Err("target path missing".to_string());
  }
  open_target(&target.to_string_lossy())
}

#[tauri::command]
fn update_instance_settings(
  instance_id: String,
  min_ram: Option<u8>,
  max_ram: Option<u8>,
  jvm_args: Option<String>,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let manifest_path = instance_dir.join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path)?;
  manifest.java_min_ram_gb = min_ram;
  manifest.java_max_ram_gb = max_ram;
  manifest.jvm_args = jvm_args.and_then(|value| {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  });
  save_manifest(&manifest_path, &manifest)
}

#[tauri::command]
fn get_instance_metrics(
  instance_id: String,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
) -> Result<Option<InstanceMetrics>, String> {
  let map = running.lock().map_err(|_| "process map lock poisoned".to_string())?;
  let pid = match map.get(&instance_id) {
    Some(pid) => *pid,
    None => return Ok(None),
  };
  let mut system = System::new();
  system.refresh_processes();
  let process = system.process(Pid::from_u32(pid));
  if let Some(proc) = process {
    let rss_kb = proc.memory();
    let rss_mb = rss_kb as f32 / 1024.0;
    return Ok(Some(InstanceMetrics { rss_mb }));
  }
  Ok(None)
}

fn signal_process(pid: u32, force: bool) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    let mut cmd = Command::new("taskkill");
    cmd.arg("/PID").arg(pid.to_string());
    if force {
      cmd.arg("/F");
    }
    let status = cmd.status().map_err(|err| err.to_string())?;
    if status.success() {
      return Ok(());
    }
    return Err("failed to stop process".to_string());
  }
  #[cfg(not(target_os = "windows"))]
  {
    let signal = if force { "-KILL" } else { "-TERM" };
    let status = Command::new("kill")
      .arg(signal)
      .arg(pid.to_string())
      .status()
      .map_err(|err| err.to_string())?;
    if status.success() {
      return Ok(());
    }
    return Err("failed to stop process".to_string());
  }
}

#[tauri::command]
fn stop_instance(
  instance_id: String,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
) -> Result<(), String> {
  let mut map = running.lock().map_err(|_| "process map lock poisoned".to_string())?;
  let pid = map
    .get(&instance_id)
    .copied()
    .ok_or_else(|| "instance not running".to_string())?;
  signal_process(pid, false)?;
  map.remove(&instance_id);
  Ok(())
}

#[tauri::command]
fn kill_instance(
  instance_id: String,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
) -> Result<(), String> {
  let mut map = running.lock().map_err(|_| "process map lock poisoned".to_string())?;
  let pid = map
    .get(&instance_id)
    .copied()
    .ok_or_else(|| "instance not running".to_string())?;
  signal_process(pid, true)?;
  map.remove(&instance_id);
  Ok(())
}

#[tauri::command]
fn list_vanilla_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  list_vanilla_versions_impl(include_snapshots)
}

#[tauri::command]
fn list_fabric_game_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  list_fabric_games_impl(include_snapshots)
}

#[tauri::command]
fn list_fabric_loader_versions(
  game_version: String,
  include_snapshots: bool,
) -> Result<Vec<LoaderVersionSummary>, String> {
  list_fabric_loaders_impl(&game_version, include_snapshots)
}

#[tauri::command]
fn list_forge_versions(game_version: String) -> Result<Vec<ForgeVersionSummary>, String> {
  list_forge_versions_impl(&game_version)
}

#[tauri::command]
async fn create_instance(
  window: tauri::Window,
  request: NewInstanceRequest,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Instance, String> {
  let config = {
    let store = state
      .lock()
      .map_err(|_| "config store lock poisoned".to_string())?;
    store.get()
  };

  let progress_window = window.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let mut config = config;
    let emitter = |event: ProgressEvent| {
      let _ = progress_window.emit("install:progress", event);
    };
    create_instance_impl(request, &mut config, &emitter).map(|instance| (instance, config))
  })
  .await
  .map_err(|_| "install task cancelled".to_string())?;

  match result {
    Ok((instance, updated_config)) => {
      let mut store = state
        .lock()
        .map_err(|_| "config store lock poisoned".to_string())?;
      store.set(updated_config).map_err(|err| err.to_string())?;
      let _ = window.emit("install:done", &instance);
      Ok(instance)
    }
    Err(err) => {
      let _ = window.emit("install:error", err.clone());
      Err(err)
    }
  }
}

#[tauri::command]
async fn launch_instance(
  window: tauri::Window,
  instance_id: String,
  player_name: Option<String>,
  state: tauri::State<'_, Mutex<ConfigStore>>,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
) -> Result<u32, String> {
  let config = {
    let store = state
      .lock()
      .map_err(|_| "config store lock poisoned".to_string())?;
    store.get()
  };

  let launch_window = window.clone();
  let instance_id_clone = instance_id.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let emitter = |event: ProgressEvent| {
      let _ = launch_window.emit("install:progress", event);
    };
    launch_instance_impl(&instance_id_clone, player_name, &config, &emitter)
  })
  .await
  .map_err(|_| "launch task cancelled".to_string())?;

  match result {
    Ok(pid) => {
      if let Ok(mut map) = running.lock() {
        map.insert(instance_id.clone(), pid);
      }
      let _ = window.emit("launch:started", pid);
      Ok(pid)
    }
    Err(err) => {
      let _ = window.emit("launch:error", err.clone());
      Err(err)
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let config_path = app.path().app_config_dir()?.join("config.json");
      let store = ConfigStore::load(config_path)?;
      app.manage(Mutex::new(store));
      app.manage(Mutex::new(HashMap::<String, u32>::new()));
      app.manage(Mutex::new(MicrosoftLoginState::default()));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      ping,
      load_config,
      save_config,
      open_instance_folder,
      rename_instance,
      remove_instance,
      open_external,
      detect_java,
      export_config,
      import_instance,
      start_microsoft_login,
      complete_microsoft_login,
      refresh_microsoft_accounts,
      check_minecraft_ownership,
      list_instance_mods,
      toggle_mod,
      list_instance_packs,
      toggle_instance_pack,
      list_instance_worlds,
      list_instance_servers,
      open_instance_path,
      update_instance_settings,
      get_instance_metrics,
      list_vanilla_versions,
      list_fabric_game_versions,
      list_fabric_loader_versions,
      list_forge_versions,
      create_instance,
      launch_instance,
      stop_instance,
      kill_instance
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
