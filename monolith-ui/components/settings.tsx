"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BranchConnectorCard } from "@/components/branch-connector-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AddDirectoryDialog from "./dialogs/add-directory-dialog";
import AddJavaDialog from "./dialogs/add-java-dialog";
import { useLauncher } from "./launcher-provider";
import { slugify } from "@/lib/launcher-utils";
import type {
  DiscordPresenceMode,
  InstanceRoot,
  JavaRuntimeEntry,
} from "@/lib/launcher-types";

export default function Settings() {
  const { config, saveConfig, setStatus } = useLauncher();
  const roots = config?.instance_roots ?? [];

  const defaultRootId = useMemo(() => {
    if (config?.default_instance_root_id)
      return config.default_instance_root_id;
    return roots[0]?.id ?? "";
  }, [config, roots]);

  const [selectedPrimary, setSelectedPrimary] = useState("");
  const [selectedSecondary, setSelectedSecondary] = useState("");
  const [showDirectoryDialog, setShowDirectoryDialog] = useState(false);
  const [showJavaDialog, setShowJavaDialog] = useState(false);
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntimeEntry[]>([]);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState("auto");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [applyToNew, setApplyToNew] = useState(true);
  const [discordPresence, setDiscordPresence] = useState(true);
  const [discordPresenceMode, setDiscordPresenceMode] =
    useState<DiscordPresenceMode>("dynamic_minecraft");
  const [networkDiagnostics, setNetworkDiagnostics] = useState(true);
  const [smartNetworkOptimization, setSmartNetworkOptimization] = useState(true);
  const [performanceGamemode, setPerformanceGamemode] = useState(false);
  const [performanceMangohud, setPerformanceMangohud] = useState(false);
  const [performanceZink, setPerformanceZink] = useState(false);
  const [syncOptions, setSyncOptions] = useState({
    resourcepacks: true,
    texturepacks: true,
    shaderpacks: true,
    server_list: true,
    options_txt: true,
  });
  const [referenceInstance, setReferenceInstance] = useState("");
  const [jvmArgs, setJvmArgs] = useState("");
  const [minRamMb, setMinRamMb] = useState(512);
  const [maxRamMb, setMaxRamMb] = useState(1024);
  const [ramUnit, setRamUnit] = useState<"mb" | "gb">("mb");

  useEffect(() => {
    if (!config) return;
    const primary = defaultRootId;
    const secondary = roots.find((root) => root.id !== primary)?.id ?? "";
    setSelectedPrimary(primary);
    setSelectedSecondary(secondary);
    setSyncEnabled(config.settings.pack_sync.enabled);
    setApplyToNew(config.settings.apply_to_new_instances);
    setDiscordPresence(config.settings.discord_presence ?? true);
    setDiscordPresenceMode(
      config.settings.discord_presence_mode ?? "dynamic_minecraft",
    );
    setNetworkDiagnostics(config.settings.network_diagnostics ?? true);
    setSmartNetworkOptimization(config.settings.smart_network_optimization ?? true);
    setPerformanceGamemode(config.settings.performance_gamemode ?? false);
    setPerformanceMangohud(config.settings.performance_mangohud ?? false);
    setPerformanceZink(config.settings.performance_zink ?? false);
    setSyncOptions({
      resourcepacks: config.settings.pack_sync.resourcepacks,
      texturepacks: config.settings.pack_sync.texturepacks,
      shaderpacks: config.settings.pack_sync.shaderpacks,
      server_list: config.settings.pack_sync.server_list,
      options_txt: config.settings.pack_sync.options_txt ?? true,
    });
    setReferenceInstance(config.settings.reference_instance_id ?? "");
    setJvmArgs(config.settings.java.jvm_args ?? "");
    setMinRamMb(config.settings.java.min_ram_mb ?? 512);
    setMaxRamMb(config.settings.java.max_ram_mb ?? 1024);
    const runtimes = config.settings.java.runtimes ?? [];
    setJavaRuntimes(runtimes);
    const runtimePath = config.settings.java.runtime?.path ?? "";
    const match = runtimePath
      ? runtimes.find((runtime) => runtime.path === runtimePath)
      : null;
    setSelectedRuntimeId(match ? match.id : "auto");
  }, [config, defaultRootId, roots]);

  const reorderRoots = (
    allRoots: InstanceRoot[],
    primaryId: string,
    secondaryId: string,
  ) => {
    const primary = allRoots.find((root) => root.id === primaryId) || null;
    const secondary =
      secondaryId && secondaryId !== primaryId
        ? allRoots.find((root) => root.id === secondaryId) || null
        : null;
    const rest = allRoots.filter(
      (root) => root.id !== primaryId && root.id !== secondaryId,
    );
    return [primary, secondary, ...rest].filter(Boolean) as InstanceRoot[];
  };

  const persistRoots = async (
    nextRoots: InstanceRoot[],
    nextDefault: string | null,
  ) => {
    if (!config) return;
    const next = {
      ...config,
      instance_roots: nextRoots,
      default_instance_root_id: nextDefault,
    };
    await saveConfig(next);
  };

  const handlePrimaryChange = async (value: string) => {
    if (!config) return;
    if (!value) return;
    setSelectedPrimary(value);
    const nextRoots = reorderRoots(
      config.instance_roots,
      value,
      selectedSecondary,
    );
    await persistRoots(nextRoots, value || null);
    setStatus("Default instance root updated.");
  };

  const handleSecondaryChange = async (value: string) => {
    if (!config) return;
    setSelectedSecondary(value);
    const nextRoots = reorderRoots(
      config.instance_roots,
      selectedPrimary || defaultRootId,
      value,
    );
    await persistRoots(nextRoots, config.default_instance_root_id ?? null);
    setStatus("Secondary instance root updated.");
  };

  const handleAddDirectory = async (payload: {
    label: string;
    path: string;
    setDefault: boolean;
  }) => {
    if (!config) return;
    const label = payload.label.trim();
    const path = payload.path.trim();
    if (!label || !path) {
      setStatus("Directory label and path are required.", "error");
      return;
    }
    const base = slugify(label);
    let candidate = base || "root";
    let counter = 2;
    const existing = new Set(config.instance_roots.map((root) => root.id));
    while (existing.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }
    const newRoot = { id: candidate, label, path };
    let nextRoots = [...config.instance_roots, newRoot];
    let nextDefault = config.default_instance_root_id ?? null;
    if (payload.setDefault || !nextDefault) {
      nextDefault = newRoot.id;
    }
    nextRoots = reorderRoots(
      nextRoots,
      nextDefault ?? newRoot.id,
      selectedSecondary,
    );
    await persistRoots(nextRoots, nextDefault);
    setStatus("Instance root added.");
  };

  const handleRemoveDirectory = async (id: string) => {
    if (!config) return;
    if (config.instance_roots.length <= 1) {
      setStatus("At least one instance root is required.", "error");
      return;
    }
    const nextRoots = config.instance_roots.filter((root) => root.id !== id);
    const nextDefault =
      config.default_instance_root_id === id
        ? (nextRoots[0]?.id ?? null)
        : (config.default_instance_root_id ?? null);
    await persistRoots(nextRoots, nextDefault);
    setStatus("Instance root removed.");
  };

  const handleAddJavaRuntime = async (payload: {
    label: string;
    path: string;
    version?: string | null;
    setDefault: boolean;
  }) => {
    if (!config) return;
    const label = payload.label.trim();
    const path = payload.path.trim();
    if (!label || !path) {
      setStatus("Java runtime label and path are required.", "error");
      return;
    }
    if (
      config.settings.java.runtimes.some((runtime) => runtime.path === path)
    ) {
      setStatus("That Java runtime path is already saved.", "error");
      return;
    }
    const base = slugify(label);
    const baseName = base || "java";
    let candidate = baseName;
    let counter = 2;
    const existing = new Set(
      config.settings.java.runtimes.map((runtime) => runtime.id),
    );
    while (existing.has(candidate)) {
      candidate = `${baseName}-${counter}`;
      counter += 1;
    }
    const newRuntime: JavaRuntimeEntry = {
      id: candidate,
      label,
      path,
      version: payload.version ?? null,
    };
    const shouldSetDefault =
      payload.setDefault || !config.settings.java.runtime.path;
    const nextRuntime = shouldSetDefault
      ? { path, version: payload.version ?? null }
      : config.settings.java.runtime;
    const next = {
      ...config,
      settings: {
        ...config.settings,
        java: {
          ...config.settings.java,
          runtime: nextRuntime,
          runtimes: [...config.settings.java.runtimes, newRuntime],
        },
      },
    };
    await saveConfig(next);
    setStatus("Java runtime added.");
    if (shouldSetDefault) {
      setSelectedRuntimeId(candidate);
    }
  };

  const handleRuntimeSelection = async (value: string) => {
    if (!config) return;
    setSelectedRuntimeId(value);
    let nextRuntime = config.settings.java.runtime;
    if (value === "auto") {
      nextRuntime = {
        ...nextRuntime,
        path: null,
      };
    } else {
      const selected = config.settings.java.runtimes.find(
        (runtime) => runtime.id === value,
      );
      if (selected) {
        nextRuntime = {
          path: selected.path,
          version: selected.version ?? null,
        };
      }
    }
    const next = {
      ...config,
      settings: {
        ...config.settings,
        java: {
          ...config.settings.java,
          runtime: nextRuntime,
        },
      },
    };
    await saveConfig(next);
    setStatus("Java runtime updated.");
  };

  const handleRemoveJavaRuntime = async (id: string) => {
    if (!config) return;
    const runtime = config.settings.java.runtimes.find(
      (item) => item.id === id,
    );
    const nextRuntimes = config.settings.java.runtimes.filter(
      (item) => item.id !== id,
    );
    let nextRuntime = config.settings.java.runtime;
    if (runtime && config.settings.java.runtime.path === runtime.path) {
      nextRuntime = {
        ...nextRuntime,
        path: null,
      };
    }
    const next = {
      ...config,
      settings: {
        ...config.settings,
        java: {
          ...config.settings.java,
          runtime: nextRuntime,
          runtimes: nextRuntimes,
        },
      },
    };
    await saveConfig(next);
    setStatus("Java runtime removed.");
  };

  const updatePackSync = async (
    updates: Partial<typeof syncOptions> & { enabled?: boolean },
  ) => {
    if (!config) return;
    const next = {
      ...config,
      settings: {
        ...config.settings,
        apply_to_new_instances: applyToNew,
        reference_instance_id: referenceInstance || null,
        pack_sync: {
          ...config.settings.pack_sync,
          enabled: updates.enabled ?? syncEnabled,
          resourcepacks: updates.resourcepacks ?? syncOptions.resourcepacks,
          texturepacks: updates.texturepacks ?? syncOptions.texturepacks,
          shaderpacks: updates.shaderpacks ?? syncOptions.shaderpacks,
          server_list: updates.server_list ?? syncOptions.server_list,
          options_txt: updates.options_txt ?? syncOptions.options_txt,
        },
      },
    };
    await saveConfig(next);
  };

  const handleReferenceInstanceChange = async (value: string) => {
    if (!config) return;
    setReferenceInstance(value);
    const next = {
      ...config,
      settings: {
        ...config.settings,
        reference_instance_id: value || null,
      },
    };
    await saveConfig(next);
    setStatus("Reference instance updated.");
  };

  const saveJavaSettings = async () => {
    if (!config) return;
    const next = {
      ...config,
      settings: {
        ...config.settings,
        java: {
          ...config.settings.java,
          min_ram_mb: minRamMb,
          max_ram_mb: maxRamMb,
          jvm_args: jvmArgs,
        },
      },
    };
    await saveConfig(next);
    setStatus("JVM settings saved.");
  };

  const handleDiscordPresenceToggle = async (next: boolean) => {
    if (!config) return;
    setDiscordPresence(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        discord_presence: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handleDiscordPresenceModeToggle = async (enabled: boolean) => {
    if (!config) return;
    const next: DiscordPresenceMode =
      enabled ? "dynamic_monolith" : "dynamic_minecraft";
    setDiscordPresenceMode(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        discord_presence_mode: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handleNetworkDiagnosticsToggle = async (next: boolean) => {
    if (!config) return;
    setNetworkDiagnostics(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        network_diagnostics: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handleSmartNetworkOptimizationToggle = async (next: boolean) => {
    if (!config) return;
    setSmartNetworkOptimization(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        smart_network_optimization: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handlePerformanceGamemodeToggle = async (next: boolean) => {
    if (!config) return;
    setPerformanceGamemode(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        performance_gamemode: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handlePerformanceMangohudToggle = async (next: boolean) => {
    if (!config) return;
    setPerformanceMangohud(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        performance_mangohud: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const handlePerformanceZinkToggle = async (next: boolean) => {
    if (!config) return;
    setPerformanceZink(next);
    const nextConfig = {
      ...config,
      settings: {
        ...config.settings,
        performance_zink: next,
      },
    };
    await saveConfig(nextConfig);
  };

  const ramDisplayUnit = ramUnit === "gb" ? "GB" : "MB";
  const displayMinRam =
    ramUnit === "gb" ? Number((minRamMb / 1024).toFixed(2)) : minRamMb;
  const displayMaxRam =
    ramUnit === "gb" ? Number((maxRamMb / 1024).toFixed(2)) : maxRamMb;
  const ramStep = ramUnit === "gb" ? 0.25 : 64;

  const instances = config?.instances ?? [];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-background px-4 py-4 md:px-6 xl:px-8">
        <div className="flex min-h-[79px] w-full flex-col justify-center">
          <h2 className="text-3xl font-bold md:text-4xl">Settings</h2>
          <p className="text-foreground/60 text-sm mt-1">
            Configure launcher and game preferences
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1520px] space-y-6 p-4 md:p-6 xl:p-8">
          <div className="bg-card border border-border rounded-xl p-4 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  Storage
                </p>
                <h3 className="mt-2 text-xl font-bold">Instance Directories</h3>
                <p className="mt-1 text-sm text-foreground/60">
                  Manage game instance storage locations
                </p>
              </div>
              <Button
                onClick={() => setShowDirectoryDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-10"
              >
                Add Directory
              </Button>
            </div>

            <div className="mb-6 rounded-xl border border-border bg-secondary/15 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                Directory Types
              </p>
              <p className="text-sm text-foreground/70">
                <span className="font-mono bg-primary/20 px-2 py-1 rounded">
                  PRIMARY
                </span>{" "}
                - Default instance root
              </p>
              <p className="text-sm text-foreground/70">
                <span className="font-mono bg-accent/20 px-2 py-1 rounded">
                  SECONDARY
                </span>{" "}
                - Additional instance roots
              </p>
            </div>

            <div className="grid gap-4 mb-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                  Primary Directory
                </label>
                <Select
                  value={selectedPrimary}
                  onValueChange={handlePrimaryChange}
                >
                  <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-accent font-mono text-sm">
                    <SelectValue placeholder="Select primary directory" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {roots.map((dir) => (
                      <SelectItem
                        key={dir.id}
                        value={dir.id}
                        className="font-mono text-sm"
                      >
                        {dir.label} — {dir.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                  Secondary Directory
                </label>
                <Select
                  value={selectedSecondary || "none"}
                  onValueChange={(value) =>
                    handleSecondaryChange(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-accent font-mono text-sm">
                    <SelectValue placeholder="Select secondary directory" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="none" className="font-mono text-sm">
                      No secondary directory
                    </SelectItem>
                    {roots
                      .filter((dir) => dir.id !== selectedPrimary)
                      .map((dir) => (
                        <SelectItem
                          key={dir.id}
                          value={dir.id}
                          className="font-mono text-sm"
                        >
                          {dir.label} — {dir.path}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {roots.length === 0 ? (
              <p className="text-foreground/60 text-center py-8">
                No directories added yet
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {roots.map((dir) => (
                  <div
                    key={dir.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/15 p-4"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FolderOpen
                        size={20}
                        className="text-foreground/70 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm truncate">{dir.path}</p>
                        <p className="text-xs text-foreground/60 mt-1">
                          {dir.id === defaultRootId
                            ? "Primary Directory"
                            : "Secondary Directory"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {dir.id === defaultRootId ? (
                        <span className="text-xs font-mono bg-primary/20 px-2 py-1 rounded">
                          PRIMARY
                        </span>
                      ) : (
                        <span className="text-xs font-mono bg-accent/20 px-2 py-1 rounded">
                          SECONDARY
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveDirectory(dir.id)}
                        className="p-2 hover:bg-background rounded transition-colors"
                      >
                        <Trash2 size={18} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  Runtime
                </p>
                <h3 className="mt-2 text-xl font-bold">Java Selection</h3>
                <p className="mt-1 text-sm text-foreground/60">
                  Choose the default Java runtime for launching Minecraft
                </p>
              </div>
              <Button
                onClick={() => setShowJavaDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-10"
              >
                Add Java
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                  Default Runtime
                </label>
                <Select
                  value={selectedRuntimeId}
                  onValueChange={handleRuntimeSelection}
                >
                  <SelectTrigger
                    data-tip-id="settings-runtime-select"
                    className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-accent font-mono text-sm"
                  >
                    <SelectValue placeholder="Select runtime" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="auto" className="font-mono text-sm">
                      Auto (JAVA_HOME / PATH)
                    </SelectItem>
                    {javaRuntimes.map((runtime) => (
                      <SelectItem
                        key={runtime.id}
                        value={runtime.id}
                        className="font-mono text-sm"
                      >
                        {runtime.label}
                        {runtime.version
                          ? ` (Java ${runtime.version})`
                          : ""}{" "}
                        - {runtime.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {javaRuntimes.length === 0 ? (
                <p className="text-foreground/60 text-center py-6">
                  No custom Java runtimes added yet
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {javaRuntimes.map((runtime) => (
                    <div
                      key={runtime.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-secondary/15 p-4"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FolderOpen
                          size={20}
                          className="text-foreground/70 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm truncate">
                            {runtime.path}
                          </p>
                          <p className="text-xs text-foreground/60 mt-1">
                            {runtime.label}
                            {runtime.version
                              ? ` - Java ${runtime.version}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {selectedRuntimeId === runtime.id && (
                          <span className="text-xs font-mono bg-primary/20 px-2 py-1 rounded">
                            DEFAULT
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveJavaRuntime(runtime.id)}
                          className="p-2 hover:bg-background rounded transition-colors"
                        >
                          <Trash2 size={18} className="text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 md:p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  Integration
                </p>
                <h3 className="mt-2 text-xl font-bold">Presence & Network</h3>
                <p className="mt-1 text-sm text-foreground/60">
                  Configure Discord presence behavior and network diagnostics tools.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-secondary/15 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Discord Rich Presence</p>
                  <p className="mt-1 text-sm text-foreground/60">
                    Show launcher activity and running instance presence in Discord.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/70">
                    {discordPresence ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={discordPresence}
                    onCheckedChange={handleDiscordPresenceToggle}
                    className="flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            <div className={`ml-3 mt-4 pl-4 ${discordPresence ? "" : "opacity-55"}`}>
              <BranchConnectorCard position="last" className="bg-secondary/15">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Use Dynamic Monolith RPC</p>
                    <p className="mt-1 text-sm text-foreground/60">
                      Enabled: Monolith RPC stays active and reports runtime state. Disabled:
                      handoff to Minecraft RPC while playing.
                    </p>
                  </div>
                  <Switch
                    checked={discordPresenceMode === "dynamic_monolith"}
                    onCheckedChange={handleDiscordPresenceModeToggle}
                    className="flex-shrink-0"
                    disabled={!discordPresence}
                  />
                </div>
              </BranchConnectorCard>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-secondary/15 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Network Diagnostics</p>
                  <p className="mt-1 text-sm text-foreground/60">
                    Enables server latency analysis and smart ping diagnostics in the Servers tab.
                  </p>
                </div>
                <Switch
                  checked={networkDiagnostics}
                  onCheckedChange={handleNetworkDiagnosticsToggle}
                  className="flex-shrink-0"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-secondary/15 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Smart Network Optimization</p>
                  <p className="mt-1 text-sm text-foreground/60">
                    Adds stable Java network defaults for launch sessions to reduce join issues on mixed IPv4/IPv6 networks.
                  </p>
                </div>
                <Switch
                  checked={smartNetworkOptimization}
                  onCheckedChange={handleSmartNetworkOptimizationToggle}
                  className="flex-shrink-0"
                />
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-secondary/15 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Linux Performance Hooks</p>
                  <p className="mt-1 text-sm text-foreground/60">
                    Optional launch wrappers and renderer overrides for Linux users.
                  </p>
                </div>
              </div>

              <div className="ml-3 mt-4 space-y-3 pl-4">
                <BranchConnectorCard position="first" className="bg-secondary/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Use GameMode (`gamemoderun`)</p>
                      <p className="mt-1 text-sm text-foreground/60">
                        Requests CPU governor and scheduler tuning during game runtime.
                      </p>
                    </div>
                    <Switch
                      checked={performanceGamemode}
                      onCheckedChange={handlePerformanceGamemodeToggle}
                      className="flex-shrink-0"
                    />
                  </div>
                </BranchConnectorCard>

                <BranchConnectorCard position="middle" className="bg-secondary/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Use MangoHud Overlay</p>
                      <p className="mt-1 text-sm text-foreground/60">
                        Adds performance overlay for FPS, frame-time, and hardware telemetry.
                      </p>
                    </div>
                    <Switch
                      checked={performanceMangohud}
                      onCheckedChange={handlePerformanceMangohudToggle}
                      className="flex-shrink-0"
                    />
                  </div>
                </BranchConnectorCard>

                <BranchConnectorCard position="last" className="bg-secondary/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Force Zink OpenGL Layer</p>
                      <p className="mt-1 text-sm text-foreground/60">
                        Forces Mesa Zink (OpenGL-on-Vulkan). Keep disabled unless your driver stack benefits from it.
                      </p>
                    </div>
                    <Switch
                      checked={performanceZink}
                      onCheckedChange={handlePerformanceZinkToggle}
                      className="flex-shrink-0"
                    />
                  </div>
                </BranchConnectorCard>
              </div>
            </div>
          </div>

          <div
            data-tip-id="settings-sync-pack"
            className="bg-card border border-border rounded-xl p-4 md:p-6"
          >
            <div className="mb-8 flex items-start justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  Shared Content
                </p>
                <h3 className="mt-2 text-xl font-bold">Sync Pack</h3>
                <p className="mt-1 text-sm text-foreground/60">
                  Synchronize game packs across instances
                </p>
              </div>
              <Switch
                checked={syncEnabled}
                onCheckedChange={async (checked) => {
                  setSyncEnabled(checked);
                  await updatePackSync({ enabled: checked });
                }}
                className="flex-shrink-0"
              />
            </div>

            <div
              data-tip-id="settings-sync-options"
              className="space-y-4 border-t border-border pt-6"
            >
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-foreground/70">
                  Sync Options
                </p>
                {!syncEnabled ? (
                  <p className="mt-2 text-sm text-foreground/60">
                    Enable Sync Pack to configure shared resources and reference
                    instance behavior.
                  </p>
                ) : null}
              </div>
              {syncEnabled ? (
                <>
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                    {[
                      { key: "resourcepacks", label: "Sync Resourcepacks" },
                      { key: "texturepacks", label: "Sync Texturepacks" },
                      { key: "shaderpacks", label: "Sync Shaderpacks" },
                      { key: "server_list", label: "Sync Server List" },
                      { key: "options_txt", label: "Sync Options.txt" },
                    ].map((option) => (
                      <div
                        key={option.key}
                        className="flex items-center justify-between rounded-xl border border-border bg-secondary/15 p-4"
                      >
                        <label className="text-sm font-medium">
                          {option.label}
                        </label>
                        <Switch
                          checked={
                            syncOptions[
                              option.key as keyof typeof syncOptions
                            ]
                          }
                          onCheckedChange={async (checked) => {
                            setSyncOptions((prev) => ({
                              ...prev,
                              [option.key]: checked,
                            }));
                            await updatePackSync({ [option.key]: checked } as any);
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border pt-6 space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/15 p-4">
                      <label className="text-sm font-medium">
                        Apply to new instances
                      </label>
                      <Switch
                        checked={applyToNew}
                        onCheckedChange={async (checked) => {
                          setApplyToNew(checked);
                          if (!config) return;
                          const nextConfig = {
                            ...config,
                            settings: {
                              ...config.settings,
                              apply_to_new_instances: checked,
                            },
                          };
                          await saveConfig(nextConfig);
                        }}
                      />
                    </div>

                    <div>
                      <label className="mb-3 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                        Reference Instance
                      </label>
                      <Select
                        value={referenceInstance || "none"}
                        onValueChange={(value) =>
                          handleReferenceInstanceChange(
                            value === "none" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-accent font-mono text-sm">
                          <SelectValue placeholder="Select reference instance" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-foreground">
                          <SelectItem value="none" className="font-mono text-sm">
                            No reference instance
                          </SelectItem>
                          {instances.map((inst) => (
                            <SelectItem
                              key={inst.id}
                              value={inst.id}
                              className="font-mono text-sm"
                            >
                              {inst.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div
            data-tip-id="settings-jvm-settings"
            className="bg-card border border-border rounded-xl p-4 md:p-6"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
              Advanced Runtime
            </p>
            <h3 className="mt-2 text-xl font-bold mb-1">JVM Settings</h3>
            <p className="text-sm text-foreground/60 mb-8">
              Configure Java Virtual Machine options
            </p>

            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                  JVM Arguments
                </label>
                <textarea
                  value={jvmArgs}
                  onChange={(e) => setJvmArgs(e.target.value)}
                  onBlur={saveJavaSettings}
                  placeholder="-XX:+UseG1GC -Xmx8G"
                  className="w-full h-24 bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                    Memory Configuration
                  </label>
                  <div className="flex items-center rounded-lg border border-border bg-secondary/30 p-1 text-xs font-semibold">
                    <button
                      onClick={() => setRamUnit("mb")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        ramUnit === "mb"
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                      type="button"
                    >
                      MB
                    </button>
                    <button
                      onClick={() => setRamUnit("gb")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        ramUnit === "gb"
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                      type="button"
                    >
                      GB
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-secondary/15 p-4">
                    <label className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                      Minimum RAM
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step={ramStep}
                        value={displayMinRam}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next =
                            ramUnit === "gb"
                              ? Math.round(value * 1024)
                              : Math.round(value);
                          setMinRamMb(Number.isFinite(next) ? next : 0);
                        }}
                        onBlur={saveJavaSettings}
                        min={ramUnit === "gb" ? 0.25 : 128}
                        max={displayMaxRam}
                        className="w-full bg-input border border-border rounded-lg px-4 py-3 pr-14 font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span className="absolute right-4 top-3.5 text-foreground/60 font-mono">
                        {ramDisplayUnit}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/15 p-4">
                    <label className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                      Maximum RAM
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step={ramStep}
                        value={displayMaxRam}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next =
                            ramUnit === "gb"
                              ? Math.round(value * 1024)
                              : Math.round(value);
                          setMaxRamMb(Number.isFinite(next) ? next : 0);
                        }}
                        onBlur={saveJavaSettings}
                        min={displayMinRam}
                        className="w-full bg-input border border-border rounded-lg px-4 py-3 pr-14 font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span className="absolute right-4 top-3.5 text-foreground/60 font-mono">
                        {ramDisplayUnit}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddDirectoryDialog
        open={showDirectoryDialog}
        onOpenChange={setShowDirectoryDialog}
        onAddDirectory={handleAddDirectory}
      />
      <AddJavaDialog
        open={showJavaDialog}
        onOpenChange={setShowJavaDialog}
        onAddJava={handleAddJavaRuntime}
      />
    </div>
  );
}
