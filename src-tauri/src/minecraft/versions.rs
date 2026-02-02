use crate::minecraft::download::{fetch_json, fetch_text};
use crate::minecraft::models::{
  FabricGameVersion, FabricLoaderEntry, ForgeVersionSummary, LoaderVersionSummary, MojangManifest,
  VersionSummary,
};
use crate::minecraft::{
  FABRIC_GAME_VERSIONS_URL, FABRIC_LOADER_URL, FORGE_INDEX_BASE, MOJANG_MANIFEST_URL,
};
use regex::Regex;
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

  Ok(results)
}
