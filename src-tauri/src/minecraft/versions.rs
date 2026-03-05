use crate::minecraft::download::{fetch_json, fetch_text};
use crate::minecraft::models::{
  FabricGameVersion, FabricLoaderEntry, ForgeVersionSummary, LoaderVersionSummary, MojangManifest,
  VersionSummary,
};
use crate::minecraft::{
  FABRIC_GAME_VERSIONS_URL, FABRIC_LOADER_URL, FORGE_INDEX_BASE, MOJANG_MANIFEST_URL,
  NEOFORGE_MAVEN_BASE, NEOFORGE_MAVEN_METADATA_URL,
};
use regex::Regex;
use std::cmp::Ordering;
use std::collections::HashSet;

pub fn list_vanilla_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  let manifest: MojangManifest = fetch_json(MOJANG_MANIFEST_URL)?;
  let mut results = Vec::new();

  for entry in manifest.versions {
    let stable = entry.kind == "release";
    if !include_snapshots && !stable {
      continue;
    }
    results.push(VersionSummary {
      id: entry.id,
      kind: entry.kind,
      stable,
      released: entry.release_time,
    });
  }

  Ok(results)
}

pub fn list_fabric_game_versions(include_snapshots: bool) -> Result<Vec<VersionSummary>, String> {
  let versions: Vec<FabricGameVersion> = fetch_json(FABRIC_GAME_VERSIONS_URL)?;
  let mut results = Vec::new();

  for entry in versions {
    if !include_snapshots && !entry.stable {
      continue;
    }
    results.push(VersionSummary {
      id: entry.version,
      kind: "game".to_string(),
      stable: entry.stable,
      released: None,
    });
  }

  Ok(results)
}

pub fn list_fabric_loader_versions(
  game_version: &str,
  include_snapshots: bool,
) -> Result<Vec<LoaderVersionSummary>, String> {
  let url = format!("{}/{}", FABRIC_LOADER_URL, urlencoding::encode(game_version));
  let entries: Vec<FabricLoaderEntry> = fetch_json(&url)?;
  let mut results = Vec::new();

  for entry in entries {
    if !include_snapshots && !entry.loader.stable {
      continue;
    }
    results.push(LoaderVersionSummary {
      version: entry.loader.version,
      stable: entry.loader.stable,
    });
  }

  Ok(results)
}

pub fn list_forge_versions(game_version: &str) -> Result<Vec<ForgeVersionSummary>, String> {
  let url = format!("{}/index_{}.html", FORGE_INDEX_BASE, game_version);
  let html = fetch_text(&url)?;
  let re = Regex::new(
    r#"/net/minecraftforge/forge/([^/]+)/forge-[^/]+-installer\.jar"#,
  )
  .map_err(|err| err.to_string())?;

  let mut seen = HashSet::new();
  let mut results = Vec::new();

  for capture in re.captures_iter(&html) {
    let version = capture.get(1).map(|m| m.as_str()).unwrap_or_default();
    if version.is_empty() || !seen.insert(version.to_string()) {
      continue;
    }
    let installer_path = capture.get(0).map(|m| m.as_str()).unwrap_or_default();
    let installer_url = format!("https://maven.minecraftforge.net{}", installer_path);
    results.push(ForgeVersionSummary {
      version: version.to_string(),
      installer_url,
    });
  }

  results.sort_by(|a, b| compare_versions_desc(&a.version, &b.version));
  Ok(results)
}

pub fn list_neoforge_versions(game_version: &str) -> Result<Vec<ForgeVersionSummary>, String> {
  let channel = game_version.strip_prefix("1.").unwrap_or(game_version);
  let metadata = fetch_text(NEOFORGE_MAVEN_METADATA_URL)?;
  let re = Regex::new(r"<version>([^<]+)</version>").map_err(|err| err.to_string())?;

  let mut seen = HashSet::new();
  let mut results = Vec::new();

  for capture in re.captures_iter(&metadata) {
    let version = capture.get(1).map(|m| m.as_str().trim()).unwrap_or_default();
    if version.is_empty() || !version.starts_with(channel) || !seen.insert(version.to_string()) {
      continue;
    }
    let installer_url = format!(
      "{}/{}/neoforge-{}-installer.jar",
      NEOFORGE_MAVEN_BASE,
      version,
      version
    );
    results.push(ForgeVersionSummary {
      version: version.to_string(),
      installer_url,
    });
  }

  results.sort_by(|a, b| compare_versions_desc(&a.version, &b.version));
  Ok(results)
}

fn compare_versions_desc(a: &str, b: &str) -> Ordering {
  let extract_numbers = |value: &str| {
    value
      .split(|ch: char| !ch.is_ascii_digit())
      .filter(|chunk| !chunk.is_empty())
      .filter_map(|chunk| chunk.parse::<u32>().ok())
      .collect::<Vec<_>>()
  };

  let a_numbers = extract_numbers(a);
  let b_numbers = extract_numbers(b);
  let max_len = a_numbers.len().max(b_numbers.len());

  for idx in 0..max_len {
    let av = *a_numbers.get(idx).unwrap_or(&0);
    let bv = *b_numbers.get(idx).unwrap_or(&0);
    match av.cmp(&bv) {
      Ordering::Less => return Ordering::Greater,
      Ordering::Greater => return Ordering::Less,
      Ordering::Equal => {}
    }
  }

  b.cmp(a)
}
