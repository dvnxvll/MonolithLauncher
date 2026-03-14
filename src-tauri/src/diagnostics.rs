use crate::config::{AppConfig, Instance, InstanceManifest, Loader, INSTANCE_CONFIG_FILE};
use crate::java::{
  detect_java_version, discover_java_runtimes, resolve_java_runtime, ResolvedJavaRuntime,
};
use std::{
  collections::{BTreeMap, BTreeSet, HashMap},
  fs,
  io::Read,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};
use zip::ZipArchive;

#[derive(Clone, serde::Serialize)]
pub(crate) struct InstanceCheck {
  pub id: String,
  pub label: String,
  pub status: String,
  pub summary: String,
  pub detail: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct InstanceDiagnostic {
  pub code: String,
  pub severity: String,
  pub title: String,
  pub summary: String,
  pub suggested_fix: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct JavaCompatibility {
  pub recommended_major: u32,
  pub selected: Option<ResolvedJavaRuntime>,
  pub compatible: bool,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct InstanceSnapshot {
  pub id: String,
  pub created_at_unix: u64,
  pub reason: Option<String>,
  pub file_count: u64,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct RepairResult {
  pub snapshot: Option<InstanceSnapshot>,
  pub cleared_targets: Vec<String>,
  pub summary: String,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct InstancePreflightReport {
  pub ready: bool,
  pub checks: Vec<InstanceCheck>,
  pub diagnostics: Vec<InstanceDiagnostic>,
  pub java: JavaCompatibility,
  pub repair_targets: Vec<String>,
  pub snapshot_count: usize,
  pub latest_log_excerpt: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SnapshotMetadata {
  id: String,
  created_at_unix: u64,
  reason: Option<String>,
  file_count: u64,
}

#[derive(Default)]
struct ModInspection {
  ids: Vec<String>,
  name: Option<String>,
  version: Option<String>,
  dependencies: Vec<String>,
  ecosystems: BTreeSet<String>,
}

pub(crate) fn build_instance_preflight(
  config: &AppConfig,
  instance: &Instance,
) -> InstancePreflightReport {
  let instance_dir = PathBuf::from(&instance.directory);
  let mut checks = Vec::new();
  let mut diagnostics = Vec::new();
  let mut ready = true;

  if instance_dir.is_dir() {
    checks.push(InstanceCheck {
      id: "instance_dir".to_string(),
      label: "Instance Directory".to_string(),
      status: "ok".to_string(),
      summary: format!("{}", instance_dir.display()),
      detail: None,
    });
  } else {
    checks.push(InstanceCheck {
      id: "instance_dir".to_string(),
      label: "Instance Directory".to_string(),
      status: "error".to_string(),
      summary: "Instance directory is missing.".to_string(),
      detail: Some(instance_dir.display().to_string()),
    });
    diagnostics.push(InstanceDiagnostic {
      code: "instance_directory_missing".to_string(),
      severity: "error".to_string(),
      title: "Instance directory missing".to_string(),
      summary: "The instance folder no longer exists on disk.".to_string(),
      suggested_fix: Some("Repair the instance or recreate the instance folder.".to_string()),
    });
    ready = false;
  }

  let manifest_path = instance_dir.join(INSTANCE_CONFIG_FILE);
  let manifest = load_manifest(&manifest_path);
  if manifest.is_some() {
    checks.push(InstanceCheck {
      id: "manifest".to_string(),
      label: "Instance Manifest".to_string(),
      status: "ok".to_string(),
      summary: "Instance manifest is present.".to_string(),
      detail: None,
    });
  } else {
    checks.push(InstanceCheck {
      id: "manifest".to_string(),
      label: "Instance Manifest".to_string(),
      status: "error".to_string(),
      summary: "Instance manifest is missing or unreadable.".to_string(),
      detail: Some(manifest_path.display().to_string()),
    });
    diagnostics.push(InstanceDiagnostic {
      code: "instance_manifest_missing".to_string(),
      severity: "error".to_string(),
      title: "Instance manifest missing".to_string(),
      summary: "Launcher metadata for this instance could not be read.".to_string(),
      suggested_fix: Some("Restore a snapshot or repair the instance to regenerate launcher-managed files.".to_string()),
    });
    ready = false;
  }

  let selected_java = resolve_java_runtime(config, instance).ok();
  let recommended_major = recommended_java_major(&instance.version);
  let java_compatible = selected_java
    .as_ref()
    .and_then(|runtime| runtime.major)
    .map(|major| major >= recommended_major)
    .unwrap_or(false);

  match selected_java.as_ref() {
    Some(runtime) if java_compatible => checks.push(InstanceCheck {
      id: "java".to_string(),
      label: "Java Runtime".to_string(),
      status: "ok".to_string(),
      summary: format!(
        "{} (Java {}).",
        runtime.label,
        runtime.major.unwrap_or(recommended_major)
      ),
      detail: Some(runtime.path.clone()),
    }),
    Some(runtime) => {
      checks.push(InstanceCheck {
        id: "java".to_string(),
        label: "Java Runtime".to_string(),
        status: "error".to_string(),
        summary: format!(
          "Selected Java {} is below the recommended Java {}.",
          runtime.major.unwrap_or(0),
          recommended_major
        ),
        detail: Some(runtime.path.clone()),
      });
      diagnostics.push(InstanceDiagnostic {
        code: "java_incompatible".to_string(),
        severity: "error".to_string(),
        title: "Java version is incompatible".to_string(),
        summary: format!(
          "Minecraft {} is expected to run on Java {} or newer, but the selected runtime resolves to Java {}.",
          instance.version,
          recommended_major,
          runtime.major.unwrap_or(0)
        ),
        suggested_fix: Some("Choose a newer Java runtime in Settings for this instance.".to_string()),
      });
      ready = false;
    }
    None => {
      checks.push(InstanceCheck {
        id: "java".to_string(),
        label: "Java Runtime".to_string(),
        status: "error".to_string(),
        summary: "No Java runtime could be resolved.".to_string(),
        detail: None,
      });
      diagnostics.push(InstanceDiagnostic {
        code: "java_missing".to_string(),
        severity: "error".to_string(),
        title: "Java runtime missing".to_string(),
        summary: "The launcher could not find a usable Java installation for this instance.".to_string(),
        suggested_fix: Some("Install Java and select it in Settings or configure JAVA_HOME.".to_string()),
      });
      ready = false;
    }
  }

  let version_json = expected_version_json_path(instance, &instance_dir);
  if version_json.is_file() {
    checks.push(InstanceCheck {
      id: "core_metadata".to_string(),
      label: "Core Metadata".to_string(),
      status: "ok".to_string(),
      summary: "Version metadata is installed.".to_string(),
      detail: Some(version_json.display().to_string()),
    });
  } else {
    checks.push(InstanceCheck {
      id: "core_metadata".to_string(),
      label: "Core Metadata".to_string(),
      status: "warn".to_string(),
      summary: "Core version metadata is missing and will be restored on the next repair or launch.".to_string(),
      detail: Some(version_json.display().to_string()),
    });
  }

  let required_dirs = ["libraries", "assets", "versions", "mods", "config", "logs"];
  let missing_dirs: Vec<String> = required_dirs
    .iter()
    .filter(|name| !instance_dir.join(name).exists())
    .map(|name| (*name).to_string())
    .collect();
  if missing_dirs.is_empty() {
    checks.push(InstanceCheck {
      id: "layout".to_string(),
      label: "Instance Layout".to_string(),
      status: "ok".to_string(),
      summary: "Core launcher-managed folders are present.".to_string(),
      detail: None,
    });
  } else {
    checks.push(InstanceCheck {
      id: "layout".to_string(),
      label: "Instance Layout".to_string(),
      status: "warn".to_string(),
      summary: format!("Missing folders: {}.", missing_dirs.join(", ")),
      detail: None,
    });
  }

  let mod_findings = inspect_mods(instance);
  if !mod_findings.is_empty() {
    ready = false;
  }
  diagnostics.extend(mod_findings);

  let snapshots = list_instance_snapshots(&instance_dir).unwrap_or_default();
  let snapshot_count = snapshots.len();
  checks.push(InstanceCheck {
    id: "snapshots".to_string(),
    label: "Snapshots".to_string(),
    status: if snapshot_count > 0 { "ok".to_string() } else { "info".to_string() },
    summary: if snapshot_count > 0 {
      format!("{} snapshot{} available.", snapshot_count, if snapshot_count == 1 { "" } else { "s" })
    } else {
      "No snapshots saved yet.".to_string()
    },
    detail: None,
  });

  let latest_log_excerpt = latest_log_excerpt(&instance_dir);

  InstancePreflightReport {
    ready,
    checks,
    diagnostics,
    java: JavaCompatibility {
      recommended_major,
      selected: selected_java,
      compatible: java_compatible,
    },
    repair_targets: repair_targets(),
    snapshot_count,
    latest_log_excerpt,
  }
}

pub(crate) fn create_snapshot(
  instance: &Instance,
  reason: Option<String>,
) -> Result<InstanceSnapshot, String> {
  let instance_dir = PathBuf::from(&instance.directory);
  if !instance_dir.is_dir() {
    return Err("instance directory missing".to_string());
  }
  let created_at = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let snapshot_id = format!("snapshot-{}", created_at);
  let snapshot_dir = snapshots_root(&instance_dir).join(&snapshot_id);
  fs::create_dir_all(&snapshot_dir).map_err(|err| err.to_string())?;

  let mut file_count = 0;
  for relative in snapshot_paths() {
    let source = instance_dir.join(relative);
    if !source.exists() {
      continue;
    }
    let target = snapshot_dir.join(relative);
    file_count += copy_path(&source, &target)?;
  }

  let metadata = SnapshotMetadata {
    id: snapshot_id.clone(),
    created_at_unix: created_at,
    reason: sanitize_reason(reason),
    file_count,
  };
  let payload = serde_json::to_vec_pretty(&metadata).map_err(|err| err.to_string())?;
  fs::write(snapshot_dir.join("metadata.json"), payload).map_err(|err| err.to_string())?;

  Ok(InstanceSnapshot {
    id: snapshot_id,
    created_at_unix: created_at,
    reason: metadata.reason,
    file_count,
  })
}

pub(crate) fn list_instance_snapshots(instance_dir: &Path) -> Result<Vec<InstanceSnapshot>, String> {
  let root = snapshots_root(instance_dir);
  if !root.exists() {
    return Ok(Vec::new());
  }
  let mut snapshots = Vec::new();
  for entry in fs::read_dir(root).map_err(|err| err.to_string())? {
    let entry = entry.map_err(|err| err.to_string())?;
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    let metadata_path = path.join("metadata.json");
    let data = match fs::read_to_string(&metadata_path) {
      Ok(data) => data,
      Err(_) => continue,
    };
    let metadata = match serde_json::from_str::<SnapshotMetadata>(&data) {
      Ok(metadata) => metadata,
      Err(_) => continue,
    };
    snapshots.push(InstanceSnapshot {
      id: metadata.id,
      created_at_unix: metadata.created_at_unix,
      reason: metadata.reason,
      file_count: metadata.file_count,
    });
  }
  snapshots.sort_by(|a, b| b.created_at_unix.cmp(&a.created_at_unix));
  Ok(snapshots)
}

pub(crate) fn restore_snapshot(instance: &Instance, snapshot_id: &str) -> Result<(), String> {
  let instance_dir = PathBuf::from(&instance.directory);
  let snapshot_dir = snapshots_root(&instance_dir).join(snapshot_id);
  if !snapshot_dir.is_dir() {
    return Err("snapshot not found".to_string());
  }
  for relative in snapshot_paths() {
    let target = instance_dir.join(relative);
    remove_path_if_exists(&target)?;
    let source = snapshot_dir.join(relative);
    if source.exists() {
      copy_path(&source, &target)?;
    }
  }
  Ok(())
}

pub(crate) fn delete_snapshot(instance: &Instance, snapshot_id: &str) -> Result<(), String> {
  let snapshot_dir = snapshots_root(Path::new(&instance.directory)).join(snapshot_id);
  if snapshot_dir.exists() {
    fs::remove_dir_all(snapshot_dir).map_err(|err| err.to_string())?;
  }
  Ok(())
}

pub(crate) fn repair_instance(instance: &Instance) -> Result<RepairResult, String> {
  let snapshot = create_snapshot(instance, Some("Before repair".to_string())).ok();
  let instance_dir = PathBuf::from(&instance.directory);
  let manifest_path = instance_dir.join(INSTANCE_CONFIG_FILE);
  if !manifest_path.exists() {
    return Err("instance manifest missing".to_string());
  }
  let mut manifest = load_manifest(&manifest_path).ok_or_else(|| "instance manifest missing".to_string())?;
  manifest.installed_version = None;
  manifest.installed_loader = None;
  manifest.installed_loader_version = None;
  let payload = serde_json::to_vec_pretty(&manifest).map_err(|err| err.to_string())?;
  fs::write(&manifest_path, payload).map_err(|err| err.to_string())?;

  let mut cleared = Vec::new();
  for relative in ["install.json", "versions", "libraries", "natives", "installers"] {
    let path = instance_dir.join(relative);
    if path.exists() {
      remove_path_if_exists(&path)?;
      cleared.push(relative.to_string());
    }
  }

  Ok(RepairResult {
    snapshot,
    cleared_targets: cleared,
    summary: "Launcher-managed files were cleared. The next launch will reinstall core files.".to_string(),
  })
}

pub(crate) fn classify_launch_failure(
  config: &AppConfig,
  instance: &Instance,
  error: &str,
) -> Option<InstanceDiagnostic> {
  let lower = error.to_ascii_lowercase();
  if lower.contains("java not found") || lower.contains("java executable not found") {
    return Some(InstanceDiagnostic {
      code: "java_missing".to_string(),
      severity: "error".to_string(),
      title: "Java runtime missing".to_string(),
      summary: "Launch failed before startup because Java could not be resolved.".to_string(),
      suggested_fix: Some("Install Java or choose a valid runtime for this instance.".to_string()),
    });
  }
  if let Some(runtime) = resolve_java_runtime(config, instance).ok() {
    let recommended = recommended_java_major(&instance.version);
    if runtime.major.unwrap_or(0) < recommended {
      return Some(InstanceDiagnostic {
        code: "java_incompatible".to_string(),
        severity: "error".to_string(),
        title: "Java version is incompatible".to_string(),
        summary: format!(
          "Launch used Java {}, but Minecraft {} is expected to run on Java {} or newer.",
          runtime.major.unwrap_or(0),
          instance.version,
          recommended
        ),
        suggested_fix: Some("Switch this instance to a newer Java runtime.".to_string()),
      });
    }
  }
  if lower.contains("mainclass missing") || lower.contains("version jar") {
    return Some(InstanceDiagnostic {
      code: "core_files_missing".to_string(),
      severity: "error".to_string(),
      title: "Core game files are missing".to_string(),
      summary: "Required version metadata or jars are missing from the instance.".to_string(),
      suggested_fix: Some("Run Repair Instance, then launch again.".to_string()),
    });
  }
  None
}

pub(crate) fn refresh_saved_java_runtimes(config: &mut AppConfig) {
  let detected = discover_java_runtimes(Some(config));
  config.settings.java.runtimes = detected;
  if let Some(path) = config.settings.java.runtime.path.clone() {
    if let Some(found) = config.settings.java.runtimes.iter().find(|entry| entry.path == path) {
      config.settings.java.runtime.version = found.version.clone();
    } else {
      let version = detect_java_version(&path);
      config.settings.java.runtime.version = version;
    }
  }
  for override_entry in &mut config.settings.java.overrides {
    override_entry.version = override_entry
      .path
      .as_deref()
      .and_then(detect_java_version);
  }
}

fn inspect_mods(instance: &Instance) -> Vec<InstanceDiagnostic> {
  let mut diagnostics = Vec::new();
  let mods_dir = PathBuf::from(&instance.directory).join("mods");
  let processed_mods_dir = PathBuf::from(&instance.directory).join(".fabric").join("processedMods");
  let scan_roots = [
    (mods_dir.as_path(), true),
    (processed_mods_dir.as_path(), false),
  ];

  if !scan_roots.iter().any(|(path, _)| path.is_dir()) {
    return diagnostics;
  }

  let mut loaded_ids: HashMap<String, Vec<String>> = HashMap::new();
  let mut dependency_graph: BTreeMap<String, Vec<String>> = BTreeMap::new();
  let mut ecosystems: Vec<(String, BTreeSet<String>, Option<String>)> = Vec::new();

  for (root, allow_fallback_id) in scan_roots {
    if !root.is_dir() {
      continue;
    }
    if let Ok(entries) = fs::read_dir(root) {
      for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|name| name.to_str()) {
          Some(name) => name.to_string(),
          None => continue,
        };
        if file_name.ends_with(".disabled") {
          continue;
        }
        if !file_name.to_ascii_lowercase().ends_with(".jar") {
          continue;
        }
        let inspection = inspect_mod_archive(&path);
        if inspection.ids.is_empty() && !allow_fallback_id {
          continue;
        }
        let ids = if inspection.ids.is_empty() {
          vec![normalize_mod_id(&file_name)]
        } else {
          inspection.ids.clone()
        };
        for id in &ids {
          loaded_ids.entry(id.clone()).or_default().push(file_name.clone());
          dependency_graph
            .entry(id.clone())
            .or_default()
            .extend(inspection.dependencies.iter().cloned());
        }
        ecosystems.push((file_name.clone(), inspection.ecosystems, inspection.name));
      }
    }
  }

  for (mod_id, files) in loaded_ids.iter().filter(|(_, files)| files.len() > 1) {
    diagnostics.push(InstanceDiagnostic {
      code: format!("duplicate_mod_{}", mod_id),
      severity: "error".to_string(),
      title: "Duplicate mod detected".to_string(),
      summary: format!("Multiple enabled files provide the mod id '{}': {}.", mod_id, files.join(", ")),
      suggested_fix: Some("Remove or disable duplicate mods before launching.".to_string()),
    });
  }

  let loaded_set: BTreeSet<String> = loaded_ids.keys().cloned().collect();
  for (mod_id, deps) in dependency_graph {
    let mut missing = Vec::new();
    for dep in deps {
      if builtin_dependency(&dep) || loaded_set.contains(&dep) {
        continue;
      }
      if !missing.contains(&dep) {
        missing.push(dep);
      }
    }
    if !missing.is_empty() {
      diagnostics.push(InstanceDiagnostic {
        code: format!("missing_dependency_{}", mod_id),
        severity: "error".to_string(),
        title: "Missing mod dependency".to_string(),
        summary: format!("Mod '{}' is missing required dependencies: {}.", mod_id, missing.join(", ")),
        suggested_fix: Some("Install the missing dependencies or disable the dependent mod.".to_string()),
      });
    }
  }

  for (file_name, mod_ecosystems, display_name) in ecosystems {
    if mod_ecosystems.is_empty() {
      continue;
    }
    let declares_target_loader = match instance.loader {
      Loader::Fabric => mod_ecosystems.contains("fabric"),
      Loader::Forge => mod_ecosystems.contains("forge"),
      Loader::NeoForge => mod_ecosystems.contains("neoforge"),
      Loader::Vanilla => false,
    };
    let incompatible = match instance.loader {
      Loader::Fabric => {
        !declares_target_loader
          && (mod_ecosystems.contains("forge") || mod_ecosystems.contains("neoforge"))
      }
      Loader::Forge => {
        !declares_target_loader
          && (mod_ecosystems.contains("fabric")
            || mod_ecosystems.contains("quilt")
            || mod_ecosystems.contains("neoforge"))
      }
      Loader::NeoForge => {
        !declares_target_loader
          && (mod_ecosystems.contains("fabric")
            || mod_ecosystems.contains("quilt")
            || mod_ecosystems.contains("forge"))
      }
      Loader::Vanilla => true,
    };
    if incompatible {
      let declared = mod_ecosystems.iter().cloned().collect::<Vec<_>>().join(", ");
      diagnostics.push(InstanceDiagnostic {
        code: format!("loader_mismatch_{}", normalize_mod_id(&file_name)),
        severity: "error".to_string(),
        title: "Mod loader mismatch".to_string(),
        summary: format!(
          "{} declares {} metadata but not {} metadata.",
          display_name.unwrap_or(file_name),
          declared,
          loader_name(&instance.loader)
        ),
        suggested_fix: Some("Remove the mismatched mod or switch the instance loader.".to_string()),
      });
    }
  }

  diagnostics
}

fn inspect_mod_archive(path: &Path) -> ModInspection {
  let file = match fs::File::open(path) {
    Ok(file) => file,
    Err(_) => return ModInspection::default(),
  };
  let mut zip = match ZipArchive::new(file) {
    Ok(zip) => zip,
    Err(_) => return ModInspection::default(),
  };
  let mut inspection = ModInspection::default();

  if let Some(contents) = load_zip_entry(&mut zip, "fabric.mod.json") {
    merge_mod_json(&mut inspection, &contents, "fabric");
  }
  if let Some(contents) = load_zip_entry(&mut zip, "quilt.mod.json") {
    merge_mod_json(&mut inspection, &contents, "quilt");
  }
  if let Some(contents) = load_zip_entry(&mut zip, "META-INF/mods.toml") {
    merge_mods_toml(&mut inspection, &contents, "forge");
  }
  if let Some(contents) = load_zip_entry(&mut zip, "META-INF/neoforge.mods.toml") {
    merge_mods_toml(&mut inspection, &contents, "neoforge");
  }

  inspection.ids.sort();
  inspection.ids.dedup();
  inspection.dependencies.sort();
  inspection.dependencies.dedup();
  inspection
}

fn merge_mod_json(inspection: &mut ModInspection, contents: &str, ecosystem: &str) {
  let value: serde_json::Value = match serde_json::from_str(contents) {
    Ok(value) => value,
    Err(_) => return,
  };
  inspection.ecosystems.insert(ecosystem.to_string());
  if inspection.name.is_none() {
    inspection.name = value
      .get("name")
      .and_then(|entry| entry.as_str())
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty());
  }
  if inspection.version.is_none() {
    inspection.version = value
      .get("version")
      .and_then(|entry| entry.as_str())
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty() && !value.contains("${"));
  }
  if let Some(id) = value.get("id").and_then(|entry| entry.as_str()) {
    let normalized = normalize_mod_id(id);
    if !normalized.is_empty() {
      inspection.ids.push(normalized);
    }
  }
  if let Some(depends) = value.get("depends").and_then(|entry| entry.as_object()) {
    for key in depends.keys() {
      let normalized = normalize_mod_id(key);
      if !normalized.is_empty() {
        inspection.dependencies.push(normalized);
      }
    }
  }
  if let Some(provides) = value.get("provides") {
    if let Some(items) = provides.as_array() {
      for item in items {
        if let Some(alias) = item.as_str() {
          let normalized = normalize_mod_id(alias);
          if !normalized.is_empty() {
            inspection.ids.push(normalized);
          }
        }
      }
    }
  }
}

fn merge_mods_toml(inspection: &mut ModInspection, contents: &str, ecosystem: &str) {
  let value: toml::Value = match contents.parse() {
    Ok(value) => value,
    Err(_) => return,
  };
  inspection.ecosystems.insert(ecosystem.to_string());
  if let Some(mods) = value.get("mods").and_then(|entry| entry.as_array()) {
    for entry in mods {
      let Some(table) = entry.as_table() else { continue };
      if let Some(mod_id) = table.get("modId").and_then(|value| value.as_str()) {
        let normalized = normalize_mod_id(mod_id);
        if !normalized.is_empty() {
          inspection.ids.push(normalized);
        }
      }
      if let Some(provides) = table.get("provides").and_then(|value| value.as_array()) {
        for alias in provides {
          if let Some(alias) = alias.as_str() {
            let normalized = normalize_mod_id(alias);
            if !normalized.is_empty() {
              inspection.ids.push(normalized);
            }
          }
        }
      }
      if inspection.name.is_none() {
        inspection.name = table
          .get("displayName")
          .and_then(|value| value.as_str())
          .or_else(|| table.get("modId").and_then(|value| value.as_str()))
          .map(|value| value.trim().to_string())
          .filter(|value| !value.is_empty());
      }
      if inspection.version.is_none() {
        inspection.version = table
          .get("version")
          .and_then(|value| value.as_str())
          .map(|value| value.trim().to_string())
          .filter(|value| !value.is_empty() && !value.contains("${"));
      }
    }
  }
  if let Some(dependencies) = value.get("dependencies").and_then(|entry| entry.as_table()) {
    for items in dependencies.values() {
      if let Some(array) = items.as_array() {
        for item in array {
          let Some(table) = item.as_table() else { continue };
          let dependency_type = table
            .get("type")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_ascii_lowercase());
          let mandatory = table
            .get("mandatory")
            .and_then(|value| value.as_bool())
            .unwrap_or(matches!(dependency_type.as_deref(), None | Some("required")));
          if !mandatory || !matches!(dependency_type.as_deref(), None | Some("required")) {
            continue;
          }
          if let Some(mod_id) = table.get("modId").and_then(|value| value.as_str()) {
            let normalized = normalize_mod_id(mod_id);
            if !normalized.is_empty() {
              inspection.dependencies.push(normalized);
            }
          }
        }
      }
    }
  }
}

fn load_zip_entry(zip: &mut ZipArchive<fs::File>, name: &str) -> Option<String> {
  let mut file = zip.by_name(name).ok()?;
  let mut contents = String::new();
  file.read_to_string(&mut contents).ok()?;
  Some(contents)
}

fn builtin_dependency(mod_id: &str) -> bool {
  matches!(
    mod_id.trim().to_ascii_lowercase().as_str(),
    "minecraft" | "java" | "forge" | "neoforge" | "fabricloader" | "fabric" | "quilt-loader"
  )
}

fn loader_name(loader: &Loader) -> &'static str {
  match loader {
    Loader::Vanilla => "vanilla",
    Loader::Fabric => "fabric",
    Loader::Forge => "forge",
    Loader::NeoForge => "neoforge",
  }
}

fn normalize_mod_id(value: &str) -> String {
  let base = value
    .trim_end_matches(".disabled")
    .trim_end_matches(".jar")
    .trim();
  let mut result = String::new();
  for ch in base.chars() {
    if ch.is_ascii_alphanumeric() {
      result.push(ch.to_ascii_lowercase());
    } else if ch == '_' || ch == '-' {
      if !result.ends_with('-') {
        result.push('-');
      }
    } else if !result.ends_with('-') {
      result.push('-');
    }
  }
  result.trim_matches('-').to_string()
}

fn latest_log_excerpt(instance_dir: &Path) -> Option<String> {
  let log_path = instance_dir.join("logs").join("latest.log");
  let contents = fs::read_to_string(log_path).ok()?;
  let lines: Vec<&str> = contents.lines().rev().take(12).collect();
  if lines.is_empty() {
    return None;
  }
  Some(lines.into_iter().rev().collect::<Vec<_>>().join("\n"))
}

fn recommended_java_major(game_version: &str) -> u32 {
  let core = game_version
    .split(|ch| ch == '-' || ch == ' ')
    .next()
    .unwrap_or(game_version)
    .trim();
  let mut parts = core.split('.');
  let major = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(1);
  let minor = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
  let patch = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
  if major > 1 {
    return 21;
  }
  if minor >= 21 {
    return 21;
  }
  if minor == 20 && patch >= 5 {
    return 21;
  }
  if minor >= 18 {
    return 17;
  }
  if minor == 17 {
    return 16;
  }
  8
}

fn expected_version_json_path(instance: &Instance, instance_dir: &Path) -> PathBuf {
  let version_id = match instance.loader {
    Loader::Vanilla => instance.version.clone(),
    Loader::Fabric => instance
      .loader_version
      .as_ref()
      .map(|loader| format!("fabric-loader-{}-{}", loader, instance.version))
      .unwrap_or_else(|| instance.version.clone()),
    Loader::Forge => {
      let loader = instance
        .loader_version
        .clone()
        .unwrap_or_else(|| instance.version.clone());
      let full = if loader.contains(&instance.version) && loader.contains('-') {
        loader
      } else {
        format!("{}-{}", instance.version, loader)
      };
      format!("forge-{}", full)
    }
    Loader::NeoForge => instance
      .loader_version
      .as_ref()
      .map(|loader| format!("neoforge-{}", loader))
      .unwrap_or_else(|| instance.version.clone()),
  };
  instance_dir
    .join("versions")
    .join(&version_id)
    .join(format!("{}.json", version_id))
}

fn repair_targets() -> Vec<String> {
  vec![
    "versions".to_string(),
    "libraries".to_string(),
    "natives".to_string(),
    "installers".to_string(),
  ]
}

fn snapshot_paths() -> &'static [&'static str] {
  &[
    INSTANCE_CONFIG_FILE,
    "config",
    "mods",
    "resourcepacks",
    "shaderpacks",
    "texturepacks",
    "options.txt",
  ]
}

fn snapshots_root(instance_dir: &Path) -> PathBuf {
  instance_dir.join(".monolith").join("snapshots")
}

fn sanitize_reason(reason: Option<String>) -> Option<String> {
  reason.and_then(|value| {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.to_string())
    }
  })
}

fn copy_path(source: &Path, target: &Path) -> Result<u64, String> {
  if source.is_dir() {
    fs::create_dir_all(target).map_err(|err| err.to_string())?;
    let mut count = 0;
    for entry in fs::read_dir(source).map_err(|err| err.to_string())? {
      let entry = entry.map_err(|err| err.to_string())?;
      count += copy_path(&entry.path(), &target.join(entry.file_name()))?;
    }
    return Ok(count);
  }
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  fs::copy(source, target).map_err(|err| err.to_string())?;
  Ok(1)
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
  if !path.exists() {
    return Ok(());
  }
  if path.is_dir() {
    fs::remove_dir_all(path).map_err(|err| err.to_string())?;
  } else {
    fs::remove_file(path).map_err(|err| err.to_string())?;
  }
  Ok(())
}

fn load_manifest(path: &Path) -> Option<InstanceManifest> {
  let data = fs::read_to_string(path).ok()?;
  serde_json::from_str(&data).ok()
}
