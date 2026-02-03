export type LoaderKind = "vanilla" | "fabric" | "forge";

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

export interface Settings {
  reference_instance_id?: string | null;
  pack_sync: PackSync;
  apply_to_new_instances: boolean;
  java: JavaSettings;
  theme: string;
  microsoft_client_id: string;
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

export interface InstanceMetrics {
  rss_mb: number;
}

export interface ProgressEvent {
  stage: string;
  message: string;
  current: number;
  total?: number | null;
  detail?: string | null;
}
