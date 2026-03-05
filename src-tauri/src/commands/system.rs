use regex::Regex;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_UPDATE_REPO: &str = "dvnxvll/MonolithLauncher";

#[derive(serde::Deserialize)]
struct GitHubRelease {
  tag_name: String,
  name: Option<String>,
  html_url: String,
  draft: bool,
  prerelease: bool,
  published_at: Option<String>,
}

pub(crate) fn open_target(target: &str) -> Result<(), String> {
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
  #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
  {
    Err("unsupported platform".to_string())
  }
}

#[derive(serde::Serialize)]
pub(crate) struct JavaDetection {
  path: Option<String>,
  version: Option<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct UpdateCheckResult {
  current_version: String,
  has_update: bool,
  latest_tag: Option<String>,
  latest_name: Option<String>,
  latest_url: Option<String>,
  published_at: Option<String>,
}

#[tauri::command]
pub(crate) fn ping() -> String {
  "pong".into()
}

#[tauri::command]
pub(crate) fn detect_java() -> Result<JavaDetection, String> {
  let java_path = find_java_binary().ok();
  let version = detect_java_version(java_path.as_deref().unwrap_or("java"));
  Ok(JavaDetection {
    path: java_path,
    version,
  })
}

#[tauri::command]
pub(crate) fn open_external(url: String) -> Result<(), String> {
  open_target(&url)
}

#[tauri::command]
pub(crate) fn check_latest_release() -> Result<UpdateCheckResult, String> {
  let current_version = env!("CARGO_PKG_VERSION").to_string();
  if env_truthy("MONOLITH_UPDATE_TEST") {
    let repo = resolve_update_repo();
    let stamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_secs())
      .unwrap_or(0);
    return Ok(UpdateCheckResult {
      current_version,
      has_update: true,
      latest_tag: Some(format!("v999.0.0-update-test-{}", stamp)),
      latest_name: Some("Update Test Build".to_string()),
      latest_url: Some(format!("https://github.com/{}/releases", repo)),
      published_at: None,
    });
  }

  let current_semver = parse_semver_triplet(&current_version)
    .ok_or_else(|| "failed to parse current app version".to_string())?;
  let repo = resolve_update_repo();
  let url = format!("https://api.github.com/repos/{}/releases?per_page=20", repo);

  let response = ureq::get(&url)
    .set("Accept", "application/vnd.github+json")
    .set("User-Agent", "monolith-launcher")
    .call()
    .map_err(|err| format!("release check failed: {}", err))?;
  let releases: Vec<GitHubRelease> = response
    .into_json()
    .map_err(|err| format!("release response parse failed: {}", err))?;

  let mut latest: Option<((u64, u64, u64), GitHubRelease)> = None;
  for release in releases {
    if release.draft || release.prerelease {
      continue;
    }
    if release.tag_name.to_lowercase().contains("nightly") {
      continue;
    }
    let Some(semver) = parse_semver_triplet(&release.tag_name) else {
      continue;
    };
    match &latest {
      Some((best, _)) if semver <= *best => {}
      _ => latest = Some((semver, release)),
    }
  }

  if let Some((latest_semver, release)) = latest {
    let has_update = latest_semver > current_semver;
    return Ok(UpdateCheckResult {
      current_version,
      has_update,
      latest_tag: Some(release.tag_name),
      latest_name: release.name,
      latest_url: Some(release.html_url),
      published_at: release.published_at,
    });
  }

  Ok(UpdateCheckResult {
    current_version,
    has_update: false,
    latest_tag: None,
    latest_name: None,
    latest_url: None,
    published_at: None,
  })
}

fn parse_semver_triplet(value: &str) -> Option<(u64, u64, u64)> {
  let trimmed = value.trim().trim_start_matches('v');
  let core = trimmed
    .split(|ch| ch == '-' || ch == '+')
    .next()
    .unwrap_or(trimmed);
  if core.is_empty() {
    return None;
  }
  let mut parts = core.split('.');
  let major = parts.next()?.parse::<u64>().ok()?;
  let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
  let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
  Some((major, minor, patch))
}

fn resolve_update_repo() -> String {
  if let Ok(value) = std::env::var("MONOLITH_UPDATE_REPO") {
    if let Some(repo) = parse_repo_slug(&value) {
      return repo;
    }
  }
  parse_repo_slug(env!("CARGO_PKG_REPOSITORY"))
    .unwrap_or_else(|| DEFAULT_UPDATE_REPO.to_string())
}

fn parse_repo_slug(value: &str) -> Option<String> {
  let mut normalized = value.trim().trim_end_matches('/').to_string();
  if normalized.ends_with(".git") {
    normalized.truncate(normalized.len().saturating_sub(4));
  }
  if let Some(pos) = normalized.find("github.com/") {
    normalized = normalized[pos + "github.com/".len()..].to_string();
  } else {
    normalized = normalized
      .trim_start_matches("https://")
      .trim_start_matches("http://")
      .to_string();
  }

  let mut segments = normalized.split('/').filter(|segment| !segment.is_empty());
  let owner = segments.next()?;
  let repo = segments.next()?;
  if !is_valid_repo_segment(owner) || !is_valid_repo_segment(repo) {
    return None;
  }
  Some(format!("{}/{}", owner, repo))
}

fn is_valid_repo_segment(value: &str) -> bool {
  !value.is_empty()
    && value
      .chars()
      .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

fn env_truthy(key: &str) -> bool {
  let Ok(value) = std::env::var(key) else {
    return false;
  };
  matches!(
    value.trim().to_ascii_lowercase().as_str(),
    "1" | "true" | "yes" | "on"
  )
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
