mod config;
mod commands;
mod minecraft;
mod modrinth;

use config::{AppConfig, ConfigStore, Instance};
use minecraft::{
  create_instance as create_instance_impl, list_fabric_game_versions as list_fabric_games_impl,
  list_fabric_loader_versions as list_fabric_loaders_impl,
  list_forge_versions as list_forge_versions_impl,
  list_vanilla_versions as list_vanilla_versions_impl, launch_instance as launch_instance_impl,
  ForgeVersionSummary, LoaderVersionSummary, NewInstanceRequest, ProgressEvent, VersionSummary,
};
use std::{
  collections::HashMap,
  io::{Read, Write},
  net::TcpListener,
  path::PathBuf,
  process::Command,
  sync::{Arc, Mutex},
  thread,
  time::{SystemTime, UNIX_EPOCH},
};
use serde::Serialize;
use tauri::{Emitter, Manager};
use rand::RngCore;
use sha2::{Digest, Sha256};
use base64::Engine;
use sysinfo::{Pid, System};
use discord_rpc_client::Client as DiscordClient;
use std::env;

fn configure_wayland_env() {
  if env::var_os("WAYLAND_DISPLAY").is_none() {
    return;
  }

  env::set_var(
    "GDK_BACKEND",
    env::var("GDK_BACKEND").unwrap_or_else(|_| "wayland,x11".to_string()),
  );
  env::set_var(
    "WEBKIT_DISABLE_DMABUF_RENDERER",
    env::var("WEBKIT_DISABLE_DMABUF_RENDERER")
      .or_else(|_| env::var("MONOLITH_DISABLE_DMABUF"))
      .unwrap_or_else(|_| "1".to_string()),
  );
  env::set_var(
    "WEBKIT_DISABLE_COMPOSITING_MODE",
    env::var("WEBKIT_DISABLE_COMPOSITING_MODE")
      .or_else(|_| env::var("MONOLITH_DISABLE_COMPOSITING"))
      .unwrap_or_else(|_| "1".to_string()),
  );
}

fn discord_set_menu_activity(state: &tauri::State<'_, Mutex<DiscordRpcState>>) {
  let mut guard = match state.lock() {
    Ok(guard) => guard,
    Err(poisoned) => poisoned.into_inner(),
  };
  if let Some(client) = guard.client.as_mut() {
    let _ = client.set_activity(|activity| {
      activity
        .assets(|assets| assets.large_image(DISCORD_LARGE_IMAGE))
    });
  }
}

fn discord_clear_activity(state: &tauri::State<'_, Mutex<DiscordRpcState>>) {
  let mut guard = match state.lock() {
    Ok(guard) => guard,
    Err(poisoned) => poisoned.into_inner(),
  };
  if let Some(client) = guard.client.as_mut() {
    let _ = client.clear_activity();
  }
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
      let body = r#"<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign-in Complete - Monolith Launcher</title>
          <style>
              * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
              }
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                  background: #0a0a0a;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 20px;
              }
              .container {
                  background: #1a1a1a;
                  border: 1px solid #2a2a2a;
                  border-radius: 16px;
                  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                  padding: 48px;
                  max-width: 480px;
                  text-align: center;
                  animation: slideUp 0.5s ease-out;
              }
              @keyframes slideUp {
                  from {
                      opacity: 0;
                      transform: translateY(20px);
                  }
                  to {
                      opacity: 1;
                      transform: translateY(0);
                  }
              }
              .checkmark {
                  width: 80px;
                  height: 80px;
                  border-radius: 50%;
                  background: #ffffff;
                  margin: 0 auto 24px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  animation: scaleIn 0.5s ease-out 0.2s backwards;
              }
              @keyframes scaleIn {
                  from {
                      transform: scale(0);
                  }
                  to {
                      transform: scale(1);
                  }
              }
              .checkmark svg {
                  width: 48px;
                  height: 48px;
                  stroke: #0a0a0a;
                  stroke-width: 3;
                  fill: none;
                  stroke-linecap: round;
                  stroke-linejoin: round;
              }
              h1 {
                  color: #ffffff;
                  font-size: 28px;
                  font-weight: 700;
                  margin-bottom: 12px;
              }
              p {
                  color: #a0a0a0;
                  font-size: 16px;
                  line-height: 1.6;
                  margin-bottom: 8px;
              }
              .brand {
                  color: #ffffff;
                  font-weight: 600;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="checkmark">
                  <svg viewBox="0 0 52 52">
                      <path d="M14 27l9 9 19-19"/>
                  </svg>
              </div>
              <h1>Sign-in Complete!</h1>
              <p>Your Microsoft account has been successfully linked.</p>
              <p>You can now return to <span class="brand">Monolith Launcher</span>.</p>
          </div>
      </body>
      </html>"#;

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
    ureq::Error::Status(code, response) => {
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

fn minecraft_login_with_microsoft(access_token: &str) -> Result<MinecraftLoginResponse, String> {
  let xbl_body = serde_json::json!({
    "Properties": {
      "AuthMethod": "RPS",
      "SiteName": "user.auth.xboxlive.com",
      "RpsTicket": format!("d={}", access_token),
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

  Ok(mc_response)
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

  let mc_response = minecraft_login_with_microsoft(&token_response.access_token)?;

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
  let owns_minecraft = check_entitlements(&mc_response.access_token).ok();
    
  let account = config::Account {
    id: account_id.clone(),
    display_name: profile.name.clone(),
    kind: config::AccountKind::Microsoft,
    last_used: None,
    access_token: Some(mc_response.access_token),
    refresh_token: token_response.refresh_token,
    expires_at: Some(expires_at),
    uuid: Some(profile.id),
    owns_minecraft,
  };

  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  config.accounts.retain(|item| item.id != account_id);
  config.accounts.push(account.clone());
  store.set(config).map_err(|err| err.to_string())?;

  Ok(account)
}

fn refresh_microsoft_accounts_inner(config: &mut AppConfig) -> Result<usize, String> {
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
    let mc_response = minecraft_login_with_microsoft(&token_response.access_token)?;
    account.access_token = Some(mc_response.access_token);
    if let Some(token) = account.access_token.as_ref() {
      account.owns_minecraft = check_entitlements(token).ok();
    }
    if let Some(next_refresh) = token_response.refresh_token {
      account.refresh_token = Some(next_refresh);
    }
    account.expires_at = Some(now.saturating_add(mc_response.expires_in));
    refreshed += 1;
  }

  for account in &mut config.accounts {
    if account.kind != config::AccountKind::Microsoft {
      continue;
    }
    if account.owns_minecraft.is_some() {
      continue;
    }
    if let Some(token) = account.access_token.as_ref() {
      account.owns_minecraft = check_entitlements(token).ok();
    }
  }

  Ok(refreshed)
}

fn ensure_active_microsoft_session(config: &mut AppConfig) -> Result<(), String> {
  let active_id = match config.active_account_id.as_ref() {
    Some(id) => id.clone(),
    None => return Ok(()),
  };
  let is_microsoft = config
    .accounts
    .iter()
    .any(|account| account.id == active_id && account.kind == config::AccountKind::Microsoft);
  if !is_microsoft {
    return Ok(());
  }
  refresh_microsoft_accounts_inner(config)?;
  let account = config.accounts.iter().find(|item| item.id == active_id);
  let Some(account) = account else {
    return Ok(());
  };
  if account.access_token.is_none() || account.uuid.is_none() {
    return Err("Microsoft session expired. Please re-login.".to_string());
  }
  Ok(())
}

#[tauri::command]
fn refresh_microsoft_accounts(
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<usize, String> {
  let mut store = state.lock().map_err(|_| "config store lock poisoned".to_string())?;
  let mut config = store.get();
  let refreshed = refresh_microsoft_accounts_inner(&mut config)?;
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

pub(crate) fn resolve_instance_dir(
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


#[derive(serde::Serialize)]
struct InstanceMetrics {
  rss_mb: f32,
}

const DISCORD_APP_ID: u64 = 1468203692716064883;
const DISCORD_LARGE_IMAGE: &str = "monolithicon";

struct DiscordRpcState {
  client: Option<DiscordClient>,
}

impl DiscordRpcState {
  fn new() -> Self {
    let mut client = DiscordClient::new(DISCORD_APP_ID);
    client.start();
    let _ = client.set_activity(|activity| {
      activity
        .assets(|assets| assets.large_image(DISCORD_LARGE_IMAGE))
    });
    Self { client: Some(client) }
  }
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

#[derive(Clone, Serialize)]
struct InstanceLogEvent {
  instance_id: String,
  line: String,
  stream: String,
}

#[derive(Clone, Serialize)]
struct LaunchEndedEvent {
  instance_id: String,
  pid: u32,
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

fn handle_instance_exit(
  app_handle: &tauri::AppHandle,
  instance_id: &str,
  pid: u32,
) {
  let running_state = app_handle.state::<Mutex<HashMap<String, u32>>>();
  let mut map = match running_state.lock() {
    Ok(guard) => guard,
    Err(poisoned) => poisoned.into_inner(),
  };
  if map.get(instance_id).copied() != Some(pid) {
    return;
  }
  map.remove(instance_id);
  let discord_state = app_handle.state::<Mutex<DiscordRpcState>>();
  discord_set_menu_activity(&discord_state);
  let payload = LaunchEndedEvent {
    instance_id: instance_id.to_string(),
    pid,
  };
  let _ = app_handle.emit("launch:ended", payload);
}

#[tauri::command]
fn stop_instance(
  instance_id: String,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
  discord: tauri::State<'_, Mutex<DiscordRpcState>>,
) -> Result<(), String> {
  let mut map = running.lock().map_err(|_| "process map lock poisoned".to_string())?;
  let pid = map
    .get(&instance_id)
    .copied()
    .ok_or_else(|| "instance not running".to_string())?;
  signal_process(pid, false)?;
  map.remove(&instance_id);
  discord_set_menu_activity(&discord);
  Ok(())
}

#[tauri::command]
fn kill_instance(
  instance_id: String,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
  discord: tauri::State<'_, Mutex<DiscordRpcState>>,
) -> Result<(), String> {
  let mut map = running.lock().map_err(|_| "process map lock poisoned".to_string())?;
  let pid = map
    .get(&instance_id)
    .copied()
    .ok_or_else(|| "instance not running".to_string())?;
  signal_process(pid, true)?;
  map.remove(&instance_id);
  discord_set_menu_activity(&discord);
  Ok(())
}

#[tauri::command]
async fn list_vanilla_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  tauri::async_runtime::spawn_blocking(move || list_vanilla_versions_impl(include_snapshots))
    .await
    .map_err(|_| "version task failed".to_string())?
}

#[tauri::command]
async fn list_fabric_game_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  tauri::async_runtime::spawn_blocking(move || list_fabric_games_impl(include_snapshots))
    .await
    .map_err(|_| "version task failed".to_string())?
}

#[tauri::command]
async fn list_fabric_loader_versions(
  game_version: String,
  include_snapshots: bool,
) -> Result<Vec<LoaderVersionSummary>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    list_fabric_loaders_impl(&game_version, include_snapshots)
  })
  .await
  .map_err(|_| "version task failed".to_string())?
}

#[tauri::command]
async fn list_forge_versions(game_version: String) -> Result<Vec<ForgeVersionSummary>, String> {
  tauri::async_runtime::spawn_blocking(move || list_forge_versions_impl(&game_version))
    .await
    .map_err(|_| "version task failed".to_string())?
}

#[tauri::command]
async fn create_instance(
  window: tauri::Window,
  request: NewInstanceRequest,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Instance, String> {
  let config = {
    let mut store = state
      .lock()
      .map_err(|_| "config store lock poisoned".to_string())?;
    let mut config = store.get();
    ensure_active_microsoft_session(&mut config)?;
    store.set(config.clone()).map_err(|err| err.to_string())?;
    config
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
  discord: tauri::State<'_, Mutex<DiscordRpcState>>,
  running: tauri::State<'_, Mutex<HashMap<String, u32>>>,
) -> Result<u32, String> {
  let config = {
    let mut store = state
      .lock()
      .map_err(|_| "config store lock poisoned".to_string())?;
    let mut config = store.get();
    ensure_active_microsoft_session(&mut config)?;
    store.set(config.clone()).map_err(|err| err.to_string())?;
    config
  };

  let launch_window = window.clone();
  let instance_id_clone = instance_id.clone();
  let log_window = window.clone();
  let log_instance_id = instance_id.clone();
  let app_handle = window.app_handle();
  let exit_instance_id = instance_id.clone();
  let exit_handle = app_handle.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let emitter = |event: ProgressEvent| {
      let _ = launch_window.emit("install:progress", event);
    };
    let log = Arc::new(move |stream: &str, line: &str| {
      let payload = InstanceLogEvent {
        instance_id: log_instance_id.clone(),
        line: line.to_string(),
        stream: stream.to_string(),
      };
      let _ = log_window.emit("instance:log", payload);
    });
    let on_exit = Arc::new(move |pid: u32| {
      handle_instance_exit(&exit_handle, &exit_instance_id, pid);
    });
    launch_instance_impl(&instance_id_clone, player_name, &config, &emitter, log, Some(on_exit))
  })
  .await
  .map_err(|_| "launch task cancelled".to_string())?;

  match result {
    Ok(pid) => {
      if let Ok(mut map) = running.lock() {
        map.insert(instance_id.clone(), pid);
      }
      discord_clear_activity(&discord);
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
  configure_wayland_env();
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
      app.manage(Mutex::new(DiscordRpcState::new()));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::system::ping,
      commands::config::load_config,
      commands::config::save_config,
      commands::instances::open_instance_folder,
      commands::instances::rename_instance,
      commands::instances::set_instance_pinned,
      commands::instances::remove_instance,
      commands::instances::repair_instance,
      commands::system::open_external,
      commands::system::detect_java,
      commands::config::export_config,
      commands::instances::import_instance,
      start_microsoft_login,
      complete_microsoft_login,
      refresh_microsoft_accounts,
      check_minecraft_ownership,
      commands::packs::list_instance_mods,
      commands::packs::toggle_mod,
      commands::packs::list_instance_packs,
      commands::packs::toggle_instance_pack,
      commands::packs::list_instance_datapacks,
      commands::packs::toggle_instance_datapack,
      commands::worlds::list_instance_worlds,
      commands::servers::list_instance_servers,
      commands::servers::save_instance_servers,
      commands::worlds::update_instance_world,
      commands::instances::open_instance_path,
      commands::packs::open_instance_datapacks,
      commands::instances::update_instance_settings,
      modrinth::search_modrinth_projects,
      modrinth::install_modrinth_project,
      modrinth::uninstall_modrinth_project,
      modrinth::list_modrinth_installs,
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
