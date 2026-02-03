use regex::Regex;
use std::process::Command;

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
