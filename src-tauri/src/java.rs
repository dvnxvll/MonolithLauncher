use crate::config::{AppConfig, Instance, JavaRuntimeEntry};
use regex::Regex;
use std::{
  collections::HashSet,
  env,
  fs,
  path::{Path, PathBuf},
  process::Command,
};

#[derive(Clone, serde::Serialize)]
pub(crate) struct ResolvedJavaRuntime {
  pub path: String,
  pub version: Option<String>,
  pub major: Option<u32>,
  pub source: String,
  pub label: String,
}

pub(crate) fn detect_java_version(java_cmd: &str) -> Option<String> {
  let output = Command::new(java_cmd).arg("-version").output().ok()?;
  let combined = String::from_utf8_lossy(&output.stderr).to_string()
    + &String::from_utf8_lossy(&output.stdout);
  let re = Regex::new(r#"version \"([^\"]+)\""#).ok()?;
  re.captures(&combined)
    .and_then(|cap| cap.get(1))
    .map(|m| m.as_str().trim().to_string())
}

pub(crate) fn parse_java_major(version: &str) -> Option<u32> {
  let trimmed = version.trim();
  if trimmed.is_empty() {
    return None;
  }
  let token = trimmed
    .split(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
    .find(|segment| segment.chars().any(|ch| ch.is_ascii_digit()))?;
  let mut parts = token.split('.');
  let first = parts.next()?.parse::<u32>().ok()?;
  if first == 1 {
    return parts.next()?.parse::<u32>().ok();
  }
  Some(first)
}

pub(crate) fn resolve_java_command(config: &AppConfig, instance: &Instance) -> Result<String, String> {
  let runtime = resolve_java_runtime(config, instance)?;
  Ok(runtime.path)
}

pub(crate) fn resolve_java_runtime(
  config: &AppConfig,
  instance: &Instance,
) -> Result<ResolvedJavaRuntime, String> {
  if let Some(entry) = config
    .settings
    .java
    .overrides
    .iter()
    .find(|item| item.instance_id == instance.id)
    .filter(|item| item.path.as_deref().map(|value| !value.trim().is_empty()).unwrap_or(false))
  {
    return build_runtime_from_config_path(
      entry.path.as_deref().unwrap_or_default(),
      entry.version.clone(),
      "instance_override",
      &format!("{} Java Override", instance.name),
    );
  }

  if let Some(path) = config.settings.java.runtime.path.as_deref() {
    if !path.trim().is_empty() {
      return build_runtime_from_config_path(
        path,
        config.settings.java.runtime.version.clone(),
        "settings",
        "Default Java Runtime",
      );
    }
  }

  let bin_name = java_binary_name();
  if let Some(java_home) = env::var_os("JAVA_HOME") {
    let candidate = PathBuf::from(java_home).join("bin").join(bin_name);
    if candidate.exists() {
      let path = candidate.to_string_lossy().to_string();
      let version = detect_java_version(&path);
      let major = version.as_deref().and_then(parse_java_major);
      return Ok(ResolvedJavaRuntime {
        path,
        version,
        major,
        source: "java_home".to_string(),
        label: "JAVA_HOME".to_string(),
      });
    }
  }

  if let Some(found) = find_in_path(bin_name) {
    let path = found.to_string_lossy().to_string();
    let version = detect_java_version(&path);
    let major = version.as_deref().and_then(parse_java_major);
    return Ok(ResolvedJavaRuntime {
      path,
      version,
      major,
      source: "path".to_string(),
      label: "PATH Java".to_string(),
    });
  }

  Err("Java not found in PATH. Configure a Java path in Settings or set JAVA_HOME.".to_string())
}

pub(crate) fn discover_java_runtimes(config: Option<&AppConfig>) -> Vec<JavaRuntimeEntry> {
  let mut entries = Vec::new();
  let mut seen = HashSet::new();

  let mut push_entry = |path: String, label: String, version: Option<String>| {
    let key = path.trim().to_string();
    let dedupe_key = runtime_dedupe_key(&key);
    if key.is_empty() || !seen.insert(dedupe_key) {
      return;
    }
    let version = version.or_else(|| detect_java_version(&key));
    let id = runtime_id(&label, &key);
    entries.push(JavaRuntimeEntry {
      id,
      label,
      path: key,
      version,
    });
  };

  if let Some(config) = config {
    for runtime in &config.settings.java.runtimes {
      push_entry(
        runtime.path.clone(),
        runtime.label.clone(),
        runtime.version.clone(),
      );
    }
    if let Some(path) = config.settings.java.runtime.path.clone() {
      let label = config
        .settings
        .java
        .runtime
        .version
        .as_ref()
        .map(|version| format!("Default Java {}", version))
        .unwrap_or_else(|| "Default Java".to_string());
      push_entry(path, label, config.settings.java.runtime.version.clone());
    }
  }

  if let Ok(runtime) = detect_java_from_command_lookup() {
    push_entry(runtime.path, runtime.label, runtime.version);
  }

  for candidate in common_java_locations() {
    if !candidate.exists() {
      continue;
    }
    let path = candidate.to_string_lossy().to_string();
    let version = detect_java_version(&path);
    let major = version
      .as_deref()
      .and_then(parse_java_major)
      .map(|value| value.to_string());
    let label = major
      .map(|value| format!("Detected Java {}", value))
      .unwrap_or_else(|| "Detected Java".to_string());
    push_entry(path, label, version);
  }

  entries.sort_by(|a, b| {
    let a_major = a.version.as_deref().and_then(parse_java_major).unwrap_or(0);
    let b_major = b.version.as_deref().and_then(parse_java_major).unwrap_or(0);
    b_major
      .cmp(&a_major)
      .then_with(|| a.label.to_lowercase().cmp(&b.label.to_lowercase()))
      .then_with(|| a.path.to_lowercase().cmp(&b.path.to_lowercase()))
  });
  entries
}

fn build_runtime_from_config_path(
  path: &str,
  version_hint: Option<String>,
  source: &str,
  label: &str,
) -> Result<ResolvedJavaRuntime, String> {
  let candidate = resolve_java_binary_path(Path::new(path));
  if !candidate.exists() {
    return Err(format!(
      "Java executable not found at {}.",
      candidate.display()
    ));
  }
  let path = candidate.to_string_lossy().to_string();
  let version = version_hint.or_else(|| detect_java_version(&path));
  let major = version.as_deref().and_then(parse_java_major);
  Ok(ResolvedJavaRuntime {
    path,
    version,
    major,
    source: source.to_string(),
    label: label.to_string(),
  })
}

fn detect_java_from_command_lookup() -> Result<ResolvedJavaRuntime, String> {
  let java_path = find_java_binary()?;
  let version = detect_java_version(&java_path);
  let major = version.as_deref().and_then(parse_java_major);
  Ok(ResolvedJavaRuntime {
    path: java_path,
    version,
    major,
    source: "path".to_string(),
    label: "PATH Java".to_string(),
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

fn resolve_java_binary_path(path: &Path) -> PathBuf {
  if path.is_dir() {
    let direct = path.join(java_binary_name());
    if direct.exists() {
      return direct;
    }
    let in_bin = path.join("bin").join(java_binary_name());
    if in_bin.exists() {
      return in_bin;
    }
  }
  path.to_path_buf()
}

fn find_in_path(bin_name: &str) -> Option<PathBuf> {
  let path_var = env::var_os("PATH")?;
  for path in env::split_paths(&path_var) {
    let candidate = path.join(bin_name);
    if candidate.exists() {
      return Some(candidate);
    }
  }
  None
}

fn common_java_locations() -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  let bin = java_binary_name();

  if let Ok(java_home) = env::var("JAVA_HOME") {
    candidates.push(PathBuf::from(java_home).join("bin").join(bin));
  }

  #[cfg(target_os = "windows")]
  {
    for env_key in ["ProgramFiles", "ProgramFiles(x86)"] {
      if let Ok(base) = env::var(env_key) {
        for folder in ["Java", "Eclipse Adoptium", "AdoptOpenJDK", "Microsoft", "Zulu"] {
          if let Ok(entries) = std::fs::read_dir(PathBuf::from(&base).join(folder)) {
            for entry in entries.flatten() {
              candidates.push(entry.path().join("bin").join(bin));
              candidates.push(entry.path().join("Contents").join("Home").join("bin").join(bin));
            }
          }
        }
      }
    }
  }

  #[cfg(target_os = "linux")]
  {
    for base in ["/usr/lib/jvm", "/usr/java", "/opt/java"] {
      if let Ok(entries) = std::fs::read_dir(base) {
        for entry in entries.flatten() {
          candidates.push(entry.path().join("bin").join(bin));
        }
      }
    }
  }

  #[cfg(target_os = "macos")]
  {
    for base in ["/Library/Java/JavaVirtualMachines", "/System/Library/Java/JavaVirtualMachines"] {
      if let Ok(entries) = std::fs::read_dir(base) {
        for entry in entries.flatten() {
          candidates.push(entry.path().join("Contents").join("Home").join("bin").join(bin));
        }
      }
    }
  }

  candidates
}

fn java_binary_name() -> &'static str {
  if cfg!(windows) {
    "java.exe"
  } else {
    "java"
  }
}

fn runtime_id(label: &str, path: &str) -> String {
  let mut result = String::new();
  for ch in format!("{}-{}", label, path).chars() {
    if ch.is_ascii_alphanumeric() {
      result.push(ch.to_ascii_lowercase());
    } else if !result.ends_with('-') {
      result.push('-');
    }
  }
  let trimmed = result.trim_matches('-');
  if trimmed.is_empty() {
    "java-runtime".to_string()
  } else {
    trimmed.to_string()
  }
}

pub(crate) fn runtime_dedupe_key(path: &str) -> String {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  let resolved = resolve_java_binary_path(Path::new(trimmed));
  let canonical = fs::canonicalize(&resolved).unwrap_or(resolved);
  let normalized = canonical.to_string_lossy().trim().to_string();
  if cfg!(windows) {
    normalized.to_ascii_lowercase()
  } else {
    normalized
  }
}
