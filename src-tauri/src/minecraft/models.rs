use crate::config::Loader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Clone, Serialize)]
pub struct ProgressEvent {
  pub stage: String,
  pub message: String,
  pub current: u64,
  pub total: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub detail: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct VersionSummary {
  pub id: String,
  pub kind: String,
  pub stable: bool,
  pub released: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct LoaderVersionSummary {
  pub version: String,
  pub stable: bool,
}

#[derive(Clone, Serialize)]
pub struct ForgeVersionSummary {
  pub version: String,
  pub installer_url: String,
}

#[derive(Deserialize)]
pub struct NewInstanceRequest {
  pub name: String,
  pub game_version: String,
  pub loader: Loader,
  pub loader_version: Option<String>,
  pub show_snapshots: bool,
  pub root_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MojangManifest {
  pub versions: Vec<MojangVersionRef>,
}

#[derive(Deserialize)]
pub(crate) struct MojangVersionRef {
  pub id: String,
  pub url: String,
  #[serde(rename = "type")]
  pub kind: String,
  #[serde(rename = "releaseTime")]
  pub release_time: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MojangVersionMeta {
  pub downloads: MojangDownloads,
  #[serde(rename = "assetIndex")]
  pub asset_index: MojangAssetIndex,
  #[serde(default)]
  pub libraries: Vec<MojangLibrary>,
}

#[derive(Deserialize)]
pub(crate) struct MojangDownloads {
  pub client: MojangDownload,
}

#[derive(Deserialize)]
pub(crate) struct MojangDownload {
  pub url: String,
}

#[derive(Deserialize)]
pub(crate) struct MojangAssetIndex {
  pub id: String,
  pub url: String,
}

#[derive(Deserialize)]
pub(crate) struct MojangAssetIndexFile {
  pub objects: HashMap<String, MojangAssetObject>,
}

#[derive(Deserialize)]
pub(crate) struct MojangAssetObject {
  pub hash: String,
  pub size: Option<u64>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangLibrary {
  pub name: String,
  pub downloads: Option<MojangLibraryDownloads>,
  pub rules: Option<Vec<MojangRule>>,
  pub natives: Option<HashMap<String, String>>,
  pub extract: Option<MojangExtract>,
  pub url: Option<String>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangLibraryDownloads {
  pub artifact: Option<MojangLibraryArtifact>,
  pub classifiers: Option<HashMap<String, MojangLibraryArtifact>>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangLibraryArtifact {
  pub path: Option<String>,
  pub url: Option<String>,
  pub sha1: Option<String>,
  pub size: Option<u64>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangRule {
  pub action: String,
  pub os: Option<MojangOsRule>,
  #[serde(default)]
  pub features: Option<MojangFeatureRule>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangOsRule {
  pub name: Option<String>,
}

#[derive(Deserialize, Clone, Default)]
pub(crate) struct MojangFeatureRule {
  #[serde(default)]
  pub is_demo_user: Option<bool>,
  #[serde(default)]
  pub has_custom_resolution: Option<bool>,
  #[serde(default)]
  pub has_quick_plays_support: Option<bool>,
  #[serde(default)]
  pub is_quick_play_singleplayer: Option<bool>,
  #[serde(default)]
  pub is_quick_play_multiplayer: Option<bool>,
  #[serde(default)]
  pub is_quick_play_realms: Option<bool>,
  #[serde(flatten)]
  pub extra: HashMap<String, bool>,
}

#[derive(Clone, Default)]
pub(crate) struct FeatureFlags {
  pub is_demo_user: bool,
  pub has_custom_resolution: bool,
  pub has_quick_plays_support: bool,
  pub is_quick_play_singleplayer: bool,
  pub is_quick_play_multiplayer: bool,
  pub is_quick_play_realms: bool,
}

#[derive(Deserialize, Clone)]
pub(crate) struct MojangExtract {
  pub exclude: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct FabricGameVersion {
  pub version: String,
  pub stable: bool,
}

#[derive(Deserialize)]
pub(crate) struct FabricLoaderEntry {
  pub loader: FabricLoaderVersion,
}

#[derive(Deserialize)]
pub(crate) struct FabricLoaderVersion {
  pub version: String,
  pub stable: bool,
}

#[derive(Deserialize)]
pub(crate) struct FabricProfile {
  pub id: String,
  #[serde(rename = "inheritsFrom")]
  pub inherits_from: Option<String>,
  #[serde(default)]
  pub libraries: Vec<ProfileLibrary>,
}

#[derive(Deserialize)]
pub(crate) struct ForgeProfile {
  #[serde(default)]
  pub libraries: Vec<ProfileLibrary>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct ProfileLibrary {
  pub name: String,
  pub url: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct VersionFile {
  pub id: String,
  #[serde(rename = "inheritsFrom")]
  pub inherits_from: Option<String>,
  #[serde(rename = "mainClass")]
  pub main_class: Option<String>,
  #[serde(default)]
  pub arguments: Option<VersionArguments>,
  #[serde(rename = "minecraftArguments")]
  pub minecraft_arguments: Option<String>,
  #[serde(default)]
  pub libraries: Vec<MojangLibrary>,
  #[serde(rename = "assetIndex")]
  pub asset_index: Option<MojangAssetIndex>,
  pub assets: Option<String>,
  pub jar: Option<String>,
  pub logging: Option<VersionLogging>,
}

#[derive(Default)]
pub(crate) struct ResolvedVersion {
  pub id: Option<String>,
  pub jar: Option<String>,
  pub main_class: Option<String>,
  pub asset_index: Option<MojangAssetIndex>,
  pub assets: Option<String>,
  pub logging: Option<VersionLogging>,
  pub libraries: Vec<MojangLibrary>,
  pub arguments: Option<VersionArguments>,
  pub minecraft_arguments: Option<String>,
  pub base_version_id: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct VersionArguments {
  #[serde(default)]
  pub game: Option<Vec<Argument>>,
  #[serde(default)]
  pub jvm: Option<Vec<Argument>>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum Argument {
  String(String),
  Object(ArgumentObject),
}

#[derive(Deserialize)]
pub(crate) struct ArgumentObject {
  pub rules: Option<Vec<MojangRule>>,
  pub value: ArgumentValue,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum ArgumentValue {
  String(String),
  List(Vec<String>),
}

pub(crate) struct LaunchContext {
  pub player_name: String,
  pub uuid: String,
  pub access_token: String,
  pub user_type: String,
  pub xuid: String,
  pub client_id: String,
  pub version_name: String,
  pub game_dir: String,
  pub assets_root: String,
  pub asset_index_name: String,
  pub classpath: String,
  pub natives_dir: String,
  pub launcher_name: String,
  pub launcher_version: String,
  pub version_type: String,
}

#[derive(Deserialize)]
pub(crate) struct VersionLogging {
  pub client: Option<LoggingClient>,
}

#[derive(Deserialize)]
pub(crate) struct LoggingClient {
  pub argument: Option<String>,
  pub file: Option<LoggingFile>,
}

#[derive(Deserialize)]
pub(crate) struct LoggingFile {
  pub id: String,
  pub url: String,
}

#[derive(Clone)]
pub(crate) struct DownloadJob {
  pub url: String,
  pub dest: PathBuf,
}

#[derive(Clone)]
pub(crate) struct NativeJar {
  pub path: PathBuf,
  pub excludes: Vec<String>,
}

pub(crate) struct MavenCoordinate {
  pub group: String,
  pub artifact: String,
  pub version: String,
  pub classifier: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct InstallState {
  pub version: String,
  pub loader: Loader,
  #[serde(default)]
  pub loader_version: Option<String>,
}
