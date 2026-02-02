use serde::{Deserialize, Serialize};
use std::{
  fs,
  io,
  path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct AppConfig {
  pub config_version: u8,
  pub accounts: Vec<Account>,
  pub active_account_id: Option<String>,
  pub instance_roots: Vec<InstanceRoot>,
  pub default_instance_root_id: Option<String>,
  pub instances: Vec<Instance>,
  pub settings: Settings,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
  pub id: String,
  pub display_name: String,
  pub kind: AccountKind,
  pub last_used: Option<String>,
  #[serde(default)]
  pub access_token: Option<String>,
  #[serde(default)]
  pub refresh_token: Option<String>,
  #[serde(default)]
  pub expires_at: Option<u64>,
  #[serde(default)]
  pub uuid: Option<String>,
  #[serde(default)]
  pub owns_minecraft: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AccountKind {
  Microsoft,
  Offline,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct InstanceRoot {
  pub id: String,
  pub label: String,
  pub path: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Instance {
  pub id: String,
  pub name: String,
  pub version: String,
  pub loader: Loader,
  #[serde(default)]
  pub loader_version: Option<String>,
  pub show_snapshots: bool,
  pub root_id: Option<String>,
  pub directory: String,
  #[serde(default)]
  pub java_min_ram_gb: Option<u8>,
  #[serde(default)]
  pub java_max_ram_gb: Option<u8>,
  #[serde(default)]
  pub jvm_args: Option<String>,
}

pub const INSTANCE_CONFIG_FILE: &str = "instance.json";

#[derive(Clone, Serialize, Deserialize)]
pub struct InstanceManifest {
  pub id: String,
  pub name: String,
  pub version: String,
  pub loader: Loader,
  #[serde(default)]
  pub loader_version: Option<String>,
  #[serde(default)]
  pub show_snapshots: bool,
  #[serde(default)]
  pub created_at_unix: Option<u64>,
  #[serde(default)]
  pub directory: Option<String>,
  #[serde(default)]
  pub installed_version: Option<String>,
  #[serde(default)]
  pub installed_loader: Option<Loader>,
  #[serde(default)]
  pub installed_loader_version: Option<String>,
  #[serde(default)]
  pub java_min_ram_gb: Option<u8>,
  #[serde(default)]
  pub java_max_ram_gb: Option<u8>,
  #[serde(default)]
  pub jvm_args: Option<String>,
}

impl InstanceManifest {
  pub fn from_instance(instance: &Instance, created_at_unix: Option<u64>) -> Self {
    Self {
      id: instance.id.clone(),
      name: instance.name.clone(),
      version: instance.version.clone(),
      loader: instance.loader.clone(),
      loader_version: instance.loader_version.clone(),
      show_snapshots: instance.show_snapshots,
      created_at_unix,
      directory: Some(instance.directory.clone()),
      installed_version: None,
      installed_loader: None,
      installed_loader_version: None,
      java_min_ram_gb: instance.java_min_ram_gb,
      java_max_ram_gb: instance.java_max_ram_gb,
      jvm_args: instance.jvm_args.clone(),
    }
  }

  pub fn into_instance(self, root_id: Option<String>, directory: String) -> Instance {
    let _ = self.directory;
    Instance {
      id: self.id,
      name: self.name,
      version: self.version,
      loader: self.loader,
      loader_version: self.loader_version,
      show_snapshots: self.show_snapshots,
      root_id,
      directory,
      java_min_ram_gb: self.java_min_ram_gb,
      java_max_ram_gb: self.java_max_ram_gb,
      jvm_args: self.jvm_args,
    }
  }
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Loader {
  Vanilla,
  Fabric,
  Forge,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
  pub reference_instance_id: Option<String>,
  pub pack_sync: PackSync,
  pub apply_to_new_instances: bool,
  pub java: JavaSettings,
  #[serde(default = "default_theme")]
  pub theme: String,
  #[serde(default = "default_microsoft_client_id")]
  pub microsoft_client_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PackSync {
  pub enabled: bool,
  pub resourcepacks: bool,
  pub shaderpacks: bool,
  pub texturepacks: bool,
  pub server_list: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct JavaSettings {
  pub min_ram_gb: u8,
  pub max_ram_gb: u8,
  pub jvm_args: String,
  #[serde(default)]
  pub runtime: JavaRuntime,
  #[serde(default)]
  pub overrides: Vec<JavaOverride>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct JavaRuntime {
  pub version: Option<String>,
  pub path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct JavaOverride {
  pub instance_id: String,
  pub version: Option<String>,
  pub path: Option<String>,
}

pub struct ConfigStore {
  path: PathBuf,
  config: AppConfig,
}

impl ConfigStore {
  pub fn load(path: PathBuf) -> io::Result<Self> {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)?;
    }

    let mut config = if path.exists() {
      let data = fs::read_to_string(&path)?;
      serde_json::from_str(&data).map_err(map_json_error)?
    } else {
      let config = AppConfig::default_with_home(resolve_home_dir());
      let store = Self {
        path: path.clone(),
        config,
      };
      store.persist()?;
      store.config
    };

    ensure_instance_roots(&config);
    normalize_microsoft_client_id(&mut config);
    apply_env_overrides(&mut config);
    migrate_instance_manifests(&config);
    config.instances = load_instances_from_roots(&config);
    normalize_default_accounts(&mut config);
    normalize_reference_instance(&mut config);

    Ok(Self { path, config })
  }

  pub fn get(&self) -> AppConfig {
    let mut config = self.config.clone();
    ensure_instance_roots(&config);
    normalize_microsoft_client_id(&mut config);
    apply_env_overrides(&mut config);
    migrate_instance_manifests(&config);
    config.instances = load_instances_from_roots(&config);
    normalize_default_accounts(&mut config);
    normalize_reference_instance(&mut config);
    config
  }

  pub fn set(&mut self, config: AppConfig) -> io::Result<()> {
    let mut config = config;
    ensure_instance_roots(&config);
    normalize_microsoft_client_id(&mut config);
    apply_env_overrides(&mut config);
    migrate_instance_manifests(&config);
    config.instances = load_instances_from_roots(&config);
    normalize_default_accounts(&mut config);
    normalize_reference_instance(&mut config);
    self.config = config;
    self.persist()
  }

  fn persist(&self) -> io::Result<()> {
    let payload = serde_json::to_vec_pretty(&self.config).map_err(map_json_error)?;
    fs::write(&self.path, payload)
  }
}

impl AppConfig {
  fn default_with_home(home: Option<PathBuf>) -> Self {
    let home_dir = home.unwrap_or_else(|| PathBuf::from("."));
    let monolith_dir = home_dir.join(".monolith");
    let primary_root = monolith_dir.join("instances");
    let labs_root = monolith_dir.join("instances-labs");

    let primary_root_path = path_to_string(&primary_root);
    let labs_root_path = path_to_string(&labs_root);

    let instance_roots = vec![
      InstanceRoot {
        id: "primary".to_string(),
        label: "Primary".to_string(),
        path: primary_root_path.clone(),
      },
      InstanceRoot {
        id: "labs".to_string(),
        label: "Experimental".to_string(),
        path: labs_root_path.clone(),
      },
    ];

    let instances = Vec::new();

    let accounts = Vec::new();

    AppConfig {
      config_version: 1,
      accounts,
      active_account_id: None,
      instance_roots,
      default_instance_root_id: Some("primary".to_string()),
      instances,
      settings: Settings {
        reference_instance_id: Some("aurora".to_string()),
        pack_sync: PackSync {
          enabled: true,
          resourcepacks: true,
          shaderpacks: false,
          texturepacks: true,
          server_list: true,
        },
        apply_to_new_instances: true,
        java: JavaSettings {
          min_ram_gb: 6,
          max_ram_gb: 12,
          jvm_args: "-XX:+UseG1GC -XX:MaxGCPauseMillis=80 -Dsun.rmi.dgc.server.gcInterval=2147483646"
            .to_string(),
          runtime: JavaRuntime {
            version: Some("17".to_string()),
            path: None,
          },
          overrides: Vec::new(),
        },
        theme: "dark".to_string(),
        microsoft_client_id: default_microsoft_client_id(),
      },
    }
  }
}

fn default_theme() -> String {
  "dark".to_string()
}

fn default_microsoft_client_id() -> String {
  "f6a09c4f-4f6d-4aad-972e-e770de1ef9c8".to_string()
}

fn normalize_microsoft_client_id(config: &mut AppConfig) {
  let trimmed = config.settings.microsoft_client_id.trim();
  if trimmed.is_empty() || trimmed == "496760c7-41f3-40b4-9cdc-c553219b3fbc" {
    config.settings.microsoft_client_id = default_microsoft_client_id();
  }
}

fn apply_env_overrides(config: &mut AppConfig) {
  if let Ok(value) = std::env::var("MONOLITH_MS_CLIENT_ID") {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      config.settings.microsoft_client_id = trimmed.to_string();
    }
  }
}

fn normalize_default_accounts(config: &mut AppConfig) {
  let has_real_accounts = config.accounts.iter().any(|account| {
    account.id != "microsoft-primary" && account.id != "offline-fallback"
  });
  if has_real_accounts {
    return;
  }
  let filtered: Vec<Account> = config
    .accounts
    .iter()
    .filter(|account| account.id != "microsoft-primary" && account.id != "offline-fallback")
    .cloned()
    .collect();
  if filtered.len() != config.accounts.len() {
    config.accounts = filtered;
    config.active_account_id = None;
  }
}

fn ensure_instance_roots(config: &AppConfig) {
  for root in &config.instance_roots {
    let _ = fs::create_dir_all(&root.path);
  }
}

fn load_instances_from_roots(config: &AppConfig) -> Vec<Instance> {
  let mut instances = Vec::new();

  for root in &config.instance_roots {
    let root_path = PathBuf::from(&root.path);
    if !root_path.exists() {
      continue;
    }
    let entries = match fs::read_dir(&root_path) {
      Ok(entries) => entries,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      let path = entry.path();
      if !path.is_dir() {
        continue;
      }
      let manifest_path = path.join(INSTANCE_CONFIG_FILE);
      if !manifest_path.exists() {
        continue;
      }
      let manifest = match load_instance_manifest(&manifest_path) {
        Some(manifest) => manifest,
        None => continue,
      };

      let directory = path.to_string_lossy().to_string();
      let instance = manifest.into_instance(Some(root.id.clone()), directory);
      instances.push(instance);
    }
  }

  instances.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  instances
}

fn load_instance_manifest(path: &Path) -> Option<InstanceManifest> {
  let data = fs::read_to_string(path).ok()?;
  serde_json::from_str(&data).ok()
}

fn migrate_instance_manifests(config: &AppConfig) {
  for instance in &config.instances {
    let dir = PathBuf::from(&instance.directory);
    if !dir.exists() {
      continue;
    }
    let manifest_path = dir.join(INSTANCE_CONFIG_FILE);
    let manifest_exists = manifest_path.exists();
    let manifest_valid = manifest_exists && load_instance_manifest(&manifest_path).is_some();
    if manifest_valid {
      continue;
    }
    let payload =
      serde_json::to_vec_pretty(&InstanceManifest::from_instance(instance, None));
    if let Ok(payload) = payload {
      let _ = fs::write(&manifest_path, payload);
    }
  }
}

fn normalize_reference_instance(config: &mut AppConfig) {
  if let Some(reference_id) = config.settings.reference_instance_id.clone() {
    if !config.instances.iter().any(|instance| instance.id == reference_id) {
      config.settings.reference_instance_id = None;
    }
  }
}

fn resolve_home_dir() -> Option<PathBuf> {
  if let Ok(home) = std::env::var("HOME") {
    return Some(PathBuf::from(home));
  }
  if let Ok(home) = std::env::var("USERPROFILE") {
    return Some(PathBuf::from(home));
  }
  None
}

fn path_to_string(path: &PathBuf) -> String {
  path.to_string_lossy().to_string()
}

fn map_json_error(error: serde_json::Error) -> io::Error {
  io::Error::new(io::ErrorKind::Other, error)
}
