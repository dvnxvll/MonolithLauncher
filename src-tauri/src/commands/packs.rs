use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::commands::system::open_target;
use crate::config::ConfigStore;
use crate::resolve_instance_dir;
use zip::ZipArchive;

#[derive(Default)]
struct ModMetadata {
  name: Option<String>,
  version: Option<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct ModEntry {
  name: String,
  filename: String,
  version: Option<String>,
  enabled: bool,
}

#[derive(serde::Serialize)]
pub(crate) struct PackEntry {
  name: String,
  filename: String,
  version: Option<String>,
  enabled: bool,
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

fn parse_pack_format(contents: &str) -> Option<String> {
  let value: serde_json::Value = serde_json::from_str(contents).ok()?;
  let pack = value.get("pack")?;
  let format = pack.get("pack_format")?;
  if let Some(number) = format.as_i64() {
    return Some(number.to_string());
  }
  if let Some(text) = format.as_str() {
    let trimmed = text.trim();
    if !trimmed.is_empty() {
      return Some(trimmed.to_string());
    }
  }
  None
}

fn read_zip_string<R: Read>(mut file: R) -> Option<String> {
  let mut contents = String::new();
  file.read_to_string(&mut contents).ok()?;
  Some(contents)
}

fn load_zip_entry(zip: &mut ZipArchive<fs::File>, name: &str) -> Option<String> {
  let file = zip.by_name(name).ok()?;
  read_zip_string(file)
}

fn read_pack_format(path: &Path) -> Option<String> {
  if path.is_dir() {
    let mcmeta = fs::read_to_string(path.join("pack.mcmeta")).ok()?;
    return parse_pack_format(&mcmeta);
  }
  let file = fs::File::open(path).ok()?;
  let mut zip = ZipArchive::new(file).ok()?;
  let contents = load_zip_entry(&mut zip, "pack.mcmeta")?;
  parse_pack_format(&contents)
}

fn parse_mod_json(contents: &str) -> ModMetadata {
  let mut meta = ModMetadata::default();
  if let Ok(value) = serde_json::from_str::<serde_json::Value>(contents) {
    if let Some(name) = value.get("name").and_then(|v| v.as_str()) {
      let trimmed = name.trim();
      if !trimmed.is_empty() {
        meta.name = Some(trimmed.to_string());
      }
    }
    if let Some(version) = value.get("version").and_then(|v| v.as_str()) {
      let trimmed = version.trim();
      if !trimmed.is_empty() {
        meta.version = Some(trimmed.to_string());
      }
    }
  }
  meta
}

fn parse_mods_toml(contents: &str) -> ModMetadata {
  let mut meta = ModMetadata::default();
  let value: toml::Value = match contents.parse() {
    Ok(value) => value,
    Err(_) => return meta,
  };
  let mods = value.get("mods").and_then(|value| value.as_array());
  if let Some(first) = mods.and_then(|mods| mods.first()) {
    if let Some(table) = first.as_table() {
      if let Some(name) = table
        .get("displayName")
        .and_then(|value| value.as_str())
        .or_else(|| table.get("modId").and_then(|value| value.as_str()))
      {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
          meta.name = Some(trimmed.to_string());
        }
      }
      if let Some(version) = table.get("version").and_then(|value| value.as_str()) {
        let trimmed = version.trim();
        if !trimmed.is_empty() && !trimmed.contains("${") {
          meta.version = Some(trimmed.to_string());
        }
      }
    }
  }
  meta
}

fn parse_manifest(contents: &str) -> ModMetadata {
  let mut meta = ModMetadata::default();
  for line in contents.lines() {
    let (key, value) = match line.split_once(": ") {
      Some(pair) => pair,
      None => continue,
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
      continue;
    }
    match key {
      "Implementation-Title" | "Specification-Title" | "ModName" => {
        if meta.name.is_none() {
          meta.name = Some(trimmed.to_string());
        }
      }
      "Implementation-Version" | "Specification-Version" | "Mod-Version" => {
        if meta.version.is_none() && !trimmed.contains("${") {
          meta.version = Some(trimmed.to_string());
        }
      }
      _ => {}
    }
  }
  meta
}

fn parse_pom_properties(contents: &str) -> ModMetadata {
  let mut meta = ModMetadata::default();
  for line in contents.lines() {
    let (key, value) = match line.split_once('=') {
      Some(pair) => pair,
      None => continue,
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
      continue;
    }
    match key {
      "name" | "artifactId" => {
        if meta.name.is_none() {
          meta.name = Some(trimmed.to_string());
        }
      }
      "version" => {
        if meta.version.is_none() && !trimmed.contains("${") {
          meta.version = Some(trimmed.to_string());
        }
      }
      _ => {}
    }
  }
  meta
}

fn find_pom_properties(zip: &mut ZipArchive<fs::File>) -> Option<String> {
  for idx in 0..zip.len() {
    let mut file = zip.by_index(idx).ok()?;
    let name = file.name().to_string();
    if name.ends_with("pom.properties") {
      return read_zip_string(&mut file);
    }
  }
  None
}

fn merge_metadata(base: &mut ModMetadata, incoming: ModMetadata) {
  if base.name.is_none() {
    base.name = incoming.name;
  }
  if base.version.is_none() {
    base.version = incoming.version;
  }
}

fn read_mod_metadata(path: &Path) -> ModMetadata {
  let file = match fs::File::open(path) {
    Ok(file) => file,
    Err(_) => return ModMetadata::default(),
  };
  let mut zip = match ZipArchive::new(file) {
    Ok(zip) => zip,
    Err(_) => return ModMetadata::default(),
  };

  let mut meta = ModMetadata::default();
  if let Some(contents) = load_zip_entry(&mut zip, "fabric.mod.json")
    .or_else(|| load_zip_entry(&mut zip, "quilt.mod.json"))
  {
    merge_metadata(&mut meta, parse_mod_json(&contents));
  }

  if meta.name.is_none() || meta.version.is_none() {
    if let Some(contents) = load_zip_entry(&mut zip, "META-INF/mods.toml") {
      merge_metadata(&mut meta, parse_mods_toml(&contents));
    }
  }

  if meta.name.is_none() || meta.version.is_none() {
    if let Some(contents) = load_zip_entry(&mut zip, "META-INF/MANIFEST.MF") {
      merge_metadata(&mut meta, parse_manifest(&contents));
    }
  }

  if meta.name.is_none() || meta.version.is_none() {
    if let Some(contents) = find_pom_properties(&mut zip) {
      merge_metadata(&mut meta, parse_pom_properties(&contents));
    }
  }

  meta
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

fn resolve_datapack_dir(instance_dir: &Path, world_id: &str) -> PathBuf {
  instance_dir.join("saves").join(world_id).join("datapacks")
}

#[tauri::command]
pub(crate) fn list_instance_mods(
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
    let metadata = read_mod_metadata(&path);
    let name = metadata
      .name
      .unwrap_or_else(|| strip_known_suffixes(&filename));
    let version = metadata.version.or_else(|| parse_version_from_name(&filename));
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
pub(crate) fn toggle_mod(
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
  } else if filename.ends_with(".disabled") {
    return Ok(());
  } else {
    mods_dir.join(format!("{}.disabled", filename))
  };
  fs::rename(source, target).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub(crate) fn list_instance_packs(
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
    let version = if kind == "shaderpacks" {
      None
    } else if kind == "resourcepacks" || kind == "texturepacks" {
      read_pack_format(&path).or_else(|| parse_version_from_name(&filename))
    } else {
      parse_version_from_name(&filename)
    };
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
pub(crate) fn toggle_instance_pack(
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
pub(crate) fn list_instance_datapacks(
  instance_id: String,
  world_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Vec<PackEntry>, String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let datapack_dir = resolve_datapack_dir(&instance_dir, &world_id);
  if !datapack_dir.exists() {
    return Ok(Vec::new());
  }
  let entries = fs::read_dir(&datapack_dir).map_err(|err| err.to_string())?;
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
pub(crate) fn toggle_instance_datapack(
  instance_id: String,
  world_id: String,
  filename: String,
  enabled: bool,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let datapack_dir = resolve_datapack_dir(&instance_dir, &world_id);
  let source = datapack_dir.join(&filename);
  if !source.exists() {
    return Err("datapack not found".to_string());
  }
  let target = if enabled {
    if filename.ends_with(".disabled") {
      datapack_dir.join(filename.trim_end_matches(".disabled"))
    } else {
      return Ok(());
    }
  } else if filename.ends_with(".disabled") {
    return Ok(());
  } else {
    datapack_dir.join(format!("{}.disabled", filename))
  };
  fs::rename(source, target).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
pub(crate) fn open_instance_datapacks(
  instance_id: String,
  world_id: String,
  state: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let instance_dir = resolve_instance_dir(&instance_id, &state)?;
  let datapack_dir = resolve_datapack_dir(&instance_dir, &world_id);
  if !datapack_dir.exists() {
    return Err("datapacks folder missing".to_string());
  }
  open_target(&datapack_dir.to_string_lossy())
}
