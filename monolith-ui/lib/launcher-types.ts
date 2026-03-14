export type LoaderKind = "vanilla" | "fabric" | "forge" | "neoforge";

export interface Account {
  id: string;
  display_name: string;
  kind: "microsoft" | "offline";
  last_used?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  uuid?: string | null;
  owns_minecraft?: boolean | null;
}

export interface InstanceRoot {
  id: string;
  label: string;
  path: string;
}

export interface Instance {
  id: string;
  name: string;
  version: string;
  loader: LoaderKind;
  loader_version?: string | null;
  show_snapshots: boolean;
  pinned?: boolean;
  root_id?: string | null;
  directory: string;
  java_min_ram_mb?: number | null;
  java_max_ram_mb?: number | null;
  jvm_args?: string | null;
}

export interface PackSync {
  enabled: boolean;
  resourcepacks: boolean;
  shaderpacks: boolean;
  texturepacks: boolean;
  server_list: boolean;
  options_txt: boolean;
}

export interface JavaRuntime {
  version?: string | null;
  path?: string | null;
}

export interface JavaRuntimeEntry {
  id: string;
  label: string;
  path: string;
  version?: string | null;
}

export interface JavaOverride {
  instance_id: string;
  version?: string | null;
  path?: string | null;
}

export interface JavaSettings {
  min_ram_mb: number;
  max_ram_mb: number;
  jvm_args: string;
  runtime: JavaRuntime;
  overrides: JavaOverride[];
  runtimes: JavaRuntimeEntry[];
}

export type DiscordPresenceMode = "dynamic_minecraft" | "dynamic_monolith";

export interface Settings {
  reference_instance_id?: string | null;
  pack_sync: PackSync;
  apply_to_new_instances: boolean;
  java: JavaSettings;
  theme: string;
  discord_presence: boolean;
  discord_presence_mode: DiscordPresenceMode;
  network_diagnostics: boolean;
  smart_network_optimization: boolean;
  performance_gamemode: boolean;
  performance_mangohud: boolean;
  performance_zink: boolean;
  microsoft_client_id: string;
  skipped_release_tag?: string | null;
}

export interface AppConfig {
  config_version: number;
  accounts: Account[];
  active_account_id?: string | null;
  instance_roots: InstanceRoot[];
  default_instance_root_id?: string | null;
  instances: Instance[];
  settings: Settings;
}

export interface VersionSummary {
  id: string;
  kind: string;
  stable: boolean;
  released?: string | null;
}

export interface LoaderVersionSummary {
  version: string;
  stable: boolean;
}

export interface ForgeVersionSummary {
  version: string;
  installer_url: string;
}

export interface ModEntry {
  name: string;
  filename: string;
  version?: string | null;
  enabled: boolean;
}

export interface PackEntry {
  name: string;
  filename: string;
  version?: string | null;
  enabled: boolean;
}

export interface SimpleEntry {
  name: string;
  version?: string | null;
  info?: string | null;
}

export interface ServerEntry {
  name: string;
  ip: string;
  accept_textures?: boolean | null;
  icon?: string | null;
}

export interface ServerLatencyReport {
  address: string;
  host: string;
  port: number;
  probes: number;
  success_count: number;
  failure_count: number;
  loss_pct: number;
  median_ms?: number | null;
  average_ms?: number | null;
  jitter_ms?: number | null;
}

export interface WorldEntry {
  id: string;
  name: string;
  icon?: string | null;
  game_mode?: string | null;
  size_bytes?: number | null;
}

export interface ModrinthProjectHit {
  project_id: string;
  title: string;
  description: string;
  downloads: number;
  author: string;
  slug: string;
  icon_url?: string | null;
}

export interface ModrinthDependencyPlanItem {
  project_id: string;
  title: string;
  project_type: string;
}

export interface ModrinthDependencyPlan {
  dependencies: ModrinthDependencyPlanItem[];
}

export interface InstanceMetrics {
  rss_mb: number;
  cpu_load_pct: number;
  gpu_load_pct?: number | null;
}

export interface ProgressEvent {
  stage: string;
  message: string;
  current: number;
  total?: number | null;
  detail?: string | null;
}

export interface ResolvedJavaRuntime {
  path: string;
  version?: string | null;
  major?: number | null;
  source: string;
  label: string;
}

export interface InstanceCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "error" | "info";
  summary: string;
  detail?: string | null;
}

export interface InstanceDiagnostic {
  code: string;
  severity: "error" | "warn" | "info";
  title: string;
  summary: string;
  suggested_fix?: string | null;
}

export interface InstanceSnapshot {
  id: string;
  created_at_unix: number;
  reason?: string | null;
  file_count: number;
}

export interface RepairResult {
  snapshot?: InstanceSnapshot | null;
  cleared_targets: string[];
  summary: string;
}

export interface JavaCompatibility {
  recommended_major: number;
  selected?: ResolvedJavaRuntime | null;
  compatible: boolean;
}

export interface InstancePreflightReport {
  ready: boolean;
  checks: InstanceCheck[];
  diagnostics: InstanceDiagnostic[];
  java: JavaCompatibility;
  repair_targets: string[];
  snapshot_count: number;
  latest_log_excerpt?: string | null;
}
