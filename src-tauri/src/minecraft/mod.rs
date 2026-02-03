mod download;
mod install;
mod instance;
mod launch;
mod models;
mod util;
mod versions;

pub(crate) use download::download_to;
pub use instance::create_instance;
pub use launch::launch_instance;
pub use models::{
  ForgeVersionSummary, LoaderVersionSummary, NewInstanceRequest, ProgressEvent, VersionSummary,
};
pub use versions::{
  list_fabric_game_versions, list_fabric_loader_versions, list_forge_versions,
  list_vanilla_versions,
};

const MOJANG_MANIFEST_URL: &str =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_GAME_VERSIONS_URL: &str = "https://meta.fabricmc.net/v2/versions/game";
const FABRIC_LOADER_URL: &str = "https://meta.fabricmc.net/v2/versions/loader";
const FORGE_INDEX_BASE: &str = "https://files.minecraftforge.net/net/minecraftforge/forge";
const RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";
const DEFAULT_LIBRARIES_URL: &str = "https://libraries.minecraft.net/";
