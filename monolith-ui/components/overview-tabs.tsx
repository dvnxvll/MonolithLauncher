"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Terminal,
  Package,
  Palette,
  Wand2,
  Globe,
  Map,
  Layers,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getListen, invoke } from "@/lib/tauri";
import type {
  Instance,
  InstanceMetrics,
  ModEntry,
  ModrinthProjectHit,
  PackEntry,
  ServerEntry,
  WorldEntry,
} from "@/lib/launcher-types";
import { useLauncher } from "@/components/launcher-provider";
import { resolveLoaderLabel } from "@/lib/launcher-utils";
import ConsolePanel from "@/components/overview/ConsolePanel";
import PackTable from "@/components/overview/PackTable";
import DatapackTable from "@/components/overview/DatapackTable";
import ServerTable from "@/components/overview/ServerTable";
import WorldTable from "@/components/overview/WorldTable";
import InstanceSettingsPanel from "@/components/overview/InstanceSettingsPanel";
import ModrinthDialog, {
  ModrinthKind,
  ModrinthSort,
  ModrinthFilters,
  ModrinthState,
} from "@/components/overview/ModrinthDialog";

type TabType =
  | "console"
  | "mods"
  | "resources"
  | "textures"
  | "shaders"
  | "datapacks"
  | "servers"
  | "worlds"
  | "settings";

type TableKind = "mods" | "resourcepacks" | "texturepacks" | "shaderpacks";
type FilterKey =
  | "mods"
  | "resources"
  | "textures"
  | "shaders"
  | "datapacks"
  | "servers"
  | "worlds";

export default function OverviewTabs({ instance }: { instance: Instance }) {
  const {
    config,
    logs,
    appendInstanceLog,
    clearInstanceLogs,
    refreshConfig,
    setStatus,
  } = useLauncher();
  const modrinthLoader =
    instance.loader === "fabric"
      ? "fabric"
      : instance.loader === "forge"
        ? "forge"
        : null;
  const buildDefaultFilters = (kind: ModrinthKind): ModrinthFilters => ({
    categories: [],
    loaders: kind === "mods" && modrinthLoader ? [modrinthLoader] : [],
    showAllVersions: false,
    environments: {
      client: false,
      server: false,
    },
    openSourceOnly: false,
    hideInstalled: false,
  });
  const [activeTab, setActiveTab] = useState<TabType>("console");
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [resourcepacks, setResourcepacks] = useState<PackEntry[]>([]);
  const [texturepacks, setTexturepacks] = useState<PackEntry[]>([]);
  const [shaders, setShaders] = useState<PackEntry[]>([]);
  const [datapacks, setDatapacks] = useState<PackEntry[]>([]);
  const [datapackWorldId, setDatapackWorldId] = useState("");
  const [modrinthState, setModrinthState] = useState<
    Record<ModrinthKind, ModrinthState>
  >({
    mods: {
      query: "",
      results: [],
      loading: false,
      error: null,
      sort: "downloads",
      filters: buildDefaultFilters("mods"),
    },
    resources: {
      query: "",
      results: [],
      loading: false,
      error: null,
      sort: "downloads",
      filters: buildDefaultFilters("resources"),
    },
    shaders: {
      query: "",
      results: [],
      loading: false,
      error: null,
      sort: "downloads",
      filters: buildDefaultFilters("shaders"),
    },
    datapacks: {
      query: "",
      results: [],
      loading: false,
      error: null,
      sort: "downloads",
      filters: buildDefaultFilters("datapacks"),
    },
  });
  const [modrinthDialogKind, setModrinthDialogKind] =
    useState<ModrinthKind | null>(null);
  const [modrinthInstalled, setModrinthInstalled] = useState<
    Record<ModrinthKind, string[]>
  >({
    mods: [],
    resources: [],
    shaders: [],
    datapacks: [],
  });
  const [modrinthBusy, setModrinthBusy] = useState<
    Record<string, "install" | "uninstall">
  >({});
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [editingServerIndex, setEditingServerIndex] = useState<number | null>(
    null,
  );
  const [serverDraft, setServerDraft] = useState<ServerEntry>({
    name: "",
    ip: "",
    accept_textures: null,
    icon: null,
  });
  const [savingServers, setSavingServers] = useState(false);
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null);
  const [worldDraft, setWorldDraft] = useState<{
    name: string;
    icon: string | null;
  }>({
    name: "",
    icon: null,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [instanceNameState, setInstanceNameState] = useState(instance.name);
  const [minRamMb, setMinRamMb] = useState(512);
  const [maxRamMb, setMaxRamMb] = useState(1024);
  const [ramUnit, setRamUnit] = useState<"mb" | "gb">("mb");
  const [jvmArgs, setJvmArgs] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [tableFilters, setTableFilters] = useState<Record<FilterKey, string>>({
    mods: "",
    resources: "",
    textures: "",
    shaders: "",
    datapacks: "",
    servers: "",
    worlds: "",
  });

  const instanceId = instance.id;

  const consoleLogs = logs.instances[instanceId] || [];
  const hasAccounts = (config?.accounts?.length ?? 0) > 0;

  const resolveImageData = (icon?: string | null) => {
    if (!icon) return null;
    if (icon.startsWith("data:")) return icon;
    return `data:image/png;base64,${icon}`;
  };

  const defaults = useMemo(() => {
    return {
      minRam: config?.settings?.java?.min_ram_mb ?? 512,
      maxRam: config?.settings?.java?.max_ram_mb ?? 1024,
      jvmArgs: config?.settings?.java?.jvm_args ?? "",
    };
  }, [config]);

  const datapackWorldName = useMemo(() => {
    if (!datapackWorldId) return null;
    return worlds.find((world) => world.id === datapackWorldId)?.name ?? null;
  }, [datapackWorldId, worlds]);

  const getFilter = (key: FilterKey) => tableFilters[key] ?? "";
  const setFilter = (key: FilterKey, value: string) => {
    setTableFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateModrinthState = (
    kind: ModrinthKind,
    patch: Partial<ModrinthState>,
  ) => {
    setModrinthState((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        ...patch,
      },
    }));
  };

  const resolveInstalledSet = (kind: ModrinthKind) =>
    new Set(modrinthInstalled[kind] ?? []);

  const isModrinthInstalling = (kind: ModrinthKind, projectId: string) =>
    modrinthBusy[`${kind}:${projectId}`] === "install";

  const isModrinthUninstalling = (kind: ModrinthKind, projectId: string) =>
    modrinthBusy[`${kind}:${projectId}`] === "uninstall";

  useEffect(() => {
    setInstanceNameState(instance.name);
    setMinRamMb(instance.java_min_ram_mb ?? defaults.minRam);
    setMaxRamMb(instance.java_max_ram_mb ?? defaults.maxRam);
    setJvmArgs(instance.jvm_args ?? defaults.jvmArgs);
    setIsRunning(false);
    setMemoryUsage(null);
    setMemoryHistory([]);
    setDeleteConfirmName("");
    setShowDeleteModal(false);
    setEditingServerIndex(null);
    setServerDraft({
      name: "",
      ip: "",
      accept_textures: null,
      icon: null,
    });
    setEditingWorldId(null);
    setWorldDraft({
      name: "",
      icon: null,
    });
    setModrinthDialogKind(null);
    setModrinthBusy({});
    setModrinthInstalled({
      mods: [],
      resources: [],
      shaders: [],
      datapacks: [],
    });
    setModrinthState({
      mods: {
        query: "",
        results: [],
        loading: false,
        error: null,
        sort: "downloads",
        filters: buildDefaultFilters("mods"),
      },
      resources: {
        query: "",
        results: [],
        loading: false,
        error: null,
        sort: "downloads",
        filters: buildDefaultFilters("resources"),
      },
      shaders: {
        query: "",
        results: [],
        loading: false,
        error: null,
        sort: "downloads",
        filters: buildDefaultFilters("shaders"),
      },
      datapacks: {
        query: "",
        results: [],
        loading: false,
        error: null,
        sort: "downloads",
        filters: buildDefaultFilters("datapacks"),
      },
    });
  }, [instance, defaults]);

  useEffect(() => {
    setActiveTab("console");
  }, [instanceId]);

  useEffect(() => {
    if (activeTab !== "console") return;
    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const metrics = await invoke<InstanceMetrics | null>(
          "get_instance_metrics",
          {
            instanceId,
          },
        );
        if (!active) return;
        if (metrics && typeof metrics.rss_mb === "number") {
          setMemoryUsage(metrics.rss_mb);
          setIsRunning(true);
          setMemoryHistory((prev) => {
            const next = [...prev, metrics.rss_mb];
            return next.length > 80 ? next.slice(-80) : next;
          });
        } else {
          setMemoryUsage(null);
          setIsRunning(false);
        }
      } catch {
        if (!active) return;
        setMemoryUsage(null);
      }
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeTab, instanceId]);

  useEffect(() => {
    const listen = getListen();
    if (!listen) return;
    let unlisten: (() => void) | null = null;
    listen("launch:ended", (event: any) => {
      const payload = event?.payload || {};
      const endedId = payload.instance_id || payload.instanceId;
      if (endedId !== instanceId) return;
      setIsRunning(false);
      setMemoryUsage(null);
      setMemoryHistory([]);
      appendInstanceLog(instanceId, "Instance closed.");
      setStatus("Instance closed.");
    }).then((stop: () => void) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, [appendInstanceLog, instanceId, setStatus]);

  useEffect(() => {
    if (!instanceId) return;
    const loadTab = async () => {
      try {
        switch (activeTab) {
          case "mods": {
            const data = await invoke<ModEntry[]>("list_instance_mods", {
              instanceId,
            });
            setMods(data || []);
            break;
          }
          case "resources": {
            const data = await invoke<PackEntry[]>("list_instance_packs", {
              instanceId,
              kind: "resourcepacks",
            });
            setResourcepacks(data || []);
            break;
          }
          case "textures": {
            const data = await invoke<PackEntry[]>("list_instance_packs", {
              instanceId,
              kind: "texturepacks",
            });
            setTexturepacks(data || []);
            break;
          }
          case "shaders": {
            const data = await invoke<PackEntry[]>("list_instance_packs", {
              instanceId,
              kind: "shaderpacks",
            });
            setShaders(data || []);
            break;
          }
          case "servers": {
            const data = await invoke<ServerEntry[]>("list_instance_servers", {
              instanceId,
            });
            setServers(data || []);
            setEditingServerIndex(null);
            break;
          }
          case "worlds": {
            const data = await invoke<WorldEntry[]>("list_instance_worlds", {
              instanceId,
            });
            setWorlds(data || []);
            setEditingWorldId(null);
            break;
          }
          case "datapacks": {
            const data = await invoke<WorldEntry[]>("list_instance_worlds", {
              instanceId,
            });
            const nextWorlds = data || [];
            setWorlds(nextWorlds);
            if (nextWorlds.length === 0) {
              setDatapackWorldId("");
              setDatapacks([]);
            } else if (
              !nextWorlds.some((world) => world.id === datapackWorldId)
            ) {
              setDatapackWorldId(nextWorlds[0].id);
            }
            break;
          }
          default:
            break;
        }
      } catch (err: any) {
        const message = err?.toString?.() || "Failed to load instance data.";
        setStatus(message, "error");
      }
    };

    loadTab();
  }, [activeTab, datapackWorldId, instanceId, setStatus]);

  useEffect(() => {
    if (activeTab !== "datapacks") return;
    if (!datapackWorldId) {
      setDatapacks([]);
      return;
    }
    const load = async () => {
      await loadDatapacks(datapackWorldId);
    };
    load();
  }, [activeTab, datapackWorldId, instanceId]);

  useEffect(() => {
    if (modrinthDialogKind !== "datapacks") return;
    if (!datapackWorldId) return;
    loadModrinthInstalls("datapacks", datapackWorldId);
  }, [datapackWorldId, modrinthDialogKind]);

  const resolvePlayerName = () => {
    const activeId = config?.active_account_id;
    if (activeId && config?.accounts) {
      const account = config.accounts.find((item) => item.id === activeId);
      if (account?.display_name) {
        return account.display_name;
      }
    }
    return "Player";
  };

  const openPath = async (kind: string) => {
    try {
      if (kind === "root") {
        await invoke("open_instance_folder", { instanceId });
        return;
      }
      await invoke("open_instance_path", { instanceId, kind });
    } catch (err: any) {
      const message = err?.toString?.() || "Unable to open path.";
      setStatus(message, "error");
    }
  };

  const openDatapacksPath = async (worldId: string) => {
    if (!worldId) return;
    try {
      await invoke("open_instance_datapacks", { instanceId, worldId });
    } catch (err: any) {
      const message = err?.toString?.() || "Unable to open datapacks folder.";
      setStatus(message, "error");
    }
  };

  const loadDatapacks = async (worldId: string) => {
    if (!worldId) {
      setDatapacks([]);
      return;
    }
    try {
      const data = await invoke<PackEntry[]>("list_instance_datapacks", {
        instanceId,
        worldId,
      });
      setDatapacks(data || []);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to load datapacks.";
      setStatus(message, "error");
    }
  };

  const resolveModrinthProjectType = (kind: ModrinthKind) => {
    if (kind === "mods") return "mod";
    if (kind === "resources") return "resourcepack";
    if (kind === "datapacks") return "datapack";
    return "shader";
  };

  const toggleFilterValue = (values: string[], value: string) => {
    if (values.includes(value)) {
      return values.filter((item) => item !== value);
    }
    return [...values, value];
  };

  const buildModrinthFacets = (
    kind: ModrinthKind,
    filters: ModrinthFilters,
  ) => {
    const facets: string[][] = [];
    if (filters.categories.length > 0) {
      facets.push(filters.categories.map((item) => `categories:${item}`));
    }
    if (kind === "mods" && filters.loaders.length > 0) {
      facets.push(filters.loaders.map((item) => `categories:${item}`));
    }
    if (filters.environments.client) {
      facets.push(["client_side:required", "client_side:optional"]);
    }
    if (filters.environments.server) {
      facets.push(["server_side:required", "server_side:optional"]);
    }
    if (filters.openSourceOnly) {
      facets.push(["open_source:true"]);
    }
    return facets;
  };

  const handleModrinthSearch = async (
    kind: ModrinthKind,
    options?: { query?: string; sort?: ModrinthSort; filters?: ModrinthFilters },
  ) => {
    const query = (options?.query ?? modrinthState[kind].query).trim();
    const sort = options?.sort ?? modrinthState[kind].sort;
    const filters = options?.filters ?? modrinthState[kind].filters;
    const limit = query.length === 0 ? 10 : 16;
    const loader = null;
    const gameVersion = filters.showAllVersions ? "" : instance.version;
    const extraFacets = buildModrinthFacets(kind, filters);
    updateModrinthState(kind, { loading: true, error: null, query });
    try {
      const results = await invoke<ModrinthProjectHit[]>(
        "search_modrinth_projects",
        {
          query,
          projectType: resolveModrinthProjectType(kind),
          gameVersion,
          loader,
          limit,
          sort,
          extraFacets,
        },
      );
      updateModrinthState(kind, { results: results || [], loading: false });
    } catch (err: any) {
      const message = err?.toString?.() || "Modrinth search failed.";
      updateModrinthState(kind, { error: message, loading: false });
    }
  };

  const loadModrinthInstalls = async (
    kind: ModrinthKind,
    worldIdOverride?: string,
  ) => {
    try {
      const worldId =
        kind === "datapacks" ? worldIdOverride ?? datapackWorldId : undefined;
      const installed = await invoke<string[]>("list_modrinth_installs", {
        instanceId,
        projectType: resolveModrinthProjectType(kind),
        worldId,
      });
      setModrinthInstalled((prev) => ({
        ...prev,
        [kind]: installed || [],
      }));
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to load Modrinth installs.";
      setStatus(message, "error");
    }
  };

  const openModrinthDialog = async (kind: ModrinthKind) => {
    if (kind === "datapacks" && !datapackWorldId) {
      setStatus("Select a world before browsing datapacks.", "error");
      return;
    }
    setModrinthDialogKind(kind);
    await loadModrinthInstalls(kind);
    await handleModrinthSearch(kind, {
      query: modrinthState[kind].query,
      sort: modrinthState[kind].sort,
      filters: modrinthState[kind].filters,
    });
  };

  const handleModrinthSortChange = (kind: ModrinthKind, value: ModrinthSort) => {
    updateModrinthState(kind, { sort: value });
    handleModrinthSearch(kind, { sort: value });
  };

  const handleModrinthCategoryToggle = (kind: ModrinthKind, value: string) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      categories: toggleFilterValue(modrinthState[kind].filters.categories, value),
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthLoaderToggle = (kind: ModrinthKind, value: string) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      loaders: toggleFilterValue(modrinthState[kind].filters.loaders, value),
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthEnvironmentToggle = (
    kind: ModrinthKind,
    side: "client" | "server",
  ) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      environments: {
        ...modrinthState[kind].filters.environments,
        [side]: !modrinthState[kind].filters.environments[side],
      },
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthOpenSourceToggle = (kind: ModrinthKind) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      openSourceOnly: !modrinthState[kind].filters.openSourceOnly,
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthShowAllVersionsToggle = (kind: ModrinthKind) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      showAllVersions: !modrinthState[kind].filters.showAllVersions,
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthHideInstalledToggle = (kind: ModrinthKind) => {
    const nextFilters: ModrinthFilters = {
      ...modrinthState[kind].filters,
      hideInstalled: !modrinthState[kind].filters.hideInstalled,
    };
    updateModrinthState(kind, { filters: nextFilters });
    handleModrinthSearch(kind, { filters: nextFilters });
  };

  const handleModrinthInstall = async (
    kind: ModrinthKind,
    project: ModrinthProjectHit,
  ) => {
    const key = `${kind}:${project.project_id}`;
    if (modrinthBusy[key]) return;
    setModrinthBusy((prev) => ({ ...prev, [key]: "install" }));
    try {
      const loaderOverride =
        kind === "mods" ? modrinthState[kind].filters.loaders : [];
      const installLoader =
        kind === "mods" && loaderOverride.length === 1
          ? loaderOverride[0]
          : modrinthLoader;
      await invoke("install_modrinth_project", {
        instanceId,
        projectId: project.project_id,
        projectType: resolveModrinthProjectType(kind),
        gameVersion: instance.version,
        loader: kind === "mods" ? installLoader : null,
        worldId: kind === "datapacks" ? datapackWorldId : null,
      });
      if (kind === "mods") {
        const data = await invoke<ModEntry[]>("list_instance_mods", {
          instanceId,
        });
        setMods(data || []);
      } else {
        if (kind === "datapacks") {
          if (datapackWorldId) {
            await loadDatapacks(datapackWorldId);
          }
        } else {
          const packKind =
            kind === "resources" ? "resourcepacks" : "shaderpacks";
          const data = await invoke<PackEntry[]>("list_instance_packs", {
            instanceId,
            kind: packKind,
          });
          if (kind === "resources") setResourcepacks(data || []);
          if (kind === "shaders") setShaders(data || []);
        }
      }
      await loadModrinthInstalls(kind);
      setStatus(`${project.title} installed.`);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to install from Modrinth.";
      setStatus(message, "error");
    } finally {
      setModrinthBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleModrinthUninstall = async (
    kind: ModrinthKind,
    project: ModrinthProjectHit,
  ) => {
    const key = `${kind}:${project.project_id}`;
    if (modrinthBusy[key]) return;
    setModrinthBusy((prev) => ({ ...prev, [key]: "uninstall" }));
    try {
      await invoke("uninstall_modrinth_project", {
        instanceId,
        projectId: project.project_id,
        projectType: resolveModrinthProjectType(kind),
        worldId: kind === "datapacks" ? datapackWorldId : null,
      });
      if (kind === "mods") {
        const data = await invoke<ModEntry[]>("list_instance_mods", {
          instanceId,
        });
        setMods(data || []);
      } else {
        if (kind === "datapacks") {
          if (datapackWorldId) {
            await loadDatapacks(datapackWorldId);
          }
        } else {
          const packKind =
            kind === "resources" ? "resourcepacks" : "shaderpacks";
          const data = await invoke<PackEntry[]>("list_instance_packs", {
            instanceId,
            kind: packKind,
          });
          if (kind === "resources") setResourcepacks(data || []);
          if (kind === "shaders") setShaders(data || []);
        }
      }
      await loadModrinthInstalls(kind);
      setStatus(`${project.title} removed.`);
    } catch (err: any) {
      const message =
        err?.toString?.() || "Failed to uninstall Modrinth content.";
      setStatus(message, "error");
    } finally {
      setModrinthBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleStart = async () => {
    try {
      await invoke("launch_instance", {
        instanceId,
        playerName: resolvePlayerName(),
      });
      setIsRunning(true);
      appendInstanceLog(instanceId, "Launching instance.");
      setStatus("Launching instance.");
    } catch (err: any) {
      const message = err?.toString?.() || "Launch failed.";
      setStatus(message, "error");
    }
  };

  const handleStop = async () => {
    try {
      await invoke("stop_instance", { instanceId });
      setIsRunning(false);
      setMemoryUsage(null);
      setMemoryHistory([]);
      appendInstanceLog(instanceId, "Stop signal sent.");
      setStatus("Stop signal sent.");
    } catch (err: any) {
      const message = err?.toString?.() || "Stop failed.";
      setStatus(message, "error");
    }
  };

  const handleKill = async () => {
    try {
      await invoke("kill_instance", { instanceId });
      setIsRunning(false);
      setMemoryUsage(null);
      setMemoryHistory([]);
      appendInstanceLog(instanceId, "Kill signal sent.");
      setStatus("Kill signal sent.");
    } catch (err: any) {
      const message = err?.toString?.() || "Kill failed.";
      setStatus(message, "error");
    }
  };

  const handleCopyLogs = async () => {
    const text = consoleLogs.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Logs copied.");
    } catch {
      setStatus("Failed to copy logs.", "error");
    }
  };

  const handleClearLogs = () => {
    clearInstanceLogs(instanceId);
    setStatus("Logs cleared.");
  };

  const handleServerIconSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png") {
      setStatus("Server icon must be a PNG file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setServerDraft((prev) => ({ ...prev, icon: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleWorldIconSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png") {
      setStatus("World icon must be a PNG file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setWorldDraft((prev) => ({ ...prev, icon: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const persistServers = async (next: ServerEntry[]) => {
    setSavingServers(true);
    try {
      await invoke("save_instance_servers", { instanceId, servers: next });
      setServers(next);
      setStatus("Servers updated.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to save servers.";
      setStatus(message, "error");
    } finally {
      setSavingServers(false);
    }
  };

  const startEditServer = (index: number) => {
    const target = servers[index];
    if (!target) return;
    setEditingServerIndex(index);
    setServerDraft({
      name: target.name,
      ip: target.ip,
      accept_textures: target.accept_textures ?? null,
      icon: target.icon ?? null,
    });
  };

  const handleAddServer = () => {
    setEditingServerIndex(servers.length);
    setServerDraft({
      name: "",
      ip: "",
      accept_textures: null,
      icon: null,
    });
  };

  const handleCancelEditServer = () => {
    setEditingServerIndex(null);
    setServerDraft({
      name: "",
      ip: "",
      accept_textures: null,
      icon: null,
    });
  };

  const handleSaveServer = async () => {
    if (editingServerIndex === null) return;
    const name = serverDraft.name.trim();
    const ip = serverDraft.ip.trim();
    if (!name || !ip) {
      setStatus("Server name and address are required.", "error");
      return;
    }
    const nextEntry: ServerEntry = {
      ...serverDraft,
      name,
      ip,
    };
    const next = [...servers];
    if (editingServerIndex >= servers.length) {
      next.push(nextEntry);
    } else {
      next[editingServerIndex] = nextEntry;
    }
    await persistServers(next);
    setEditingServerIndex(null);
  };

  const handleDeleteServer = async (index: number) => {
    const next = servers.filter((_, idx) => idx !== index);
    await persistServers(next);
  };

  const ramDisplayUnit = ramUnit === "gb" ? "GB" : "MB";
  const displayMinRam =
    ramUnit === "gb" ? Number((minRamMb / 1024).toFixed(2)) : minRamMb;
  const displayMaxRam =
    ramUnit === "gb" ? Number((maxRamMb / 1024).toFixed(2)) : maxRamMb;
  const ramStep = ramUnit === "gb" ? 0.25 : 64;

  const startEditWorld = (world: WorldEntry) => {
    setEditingWorldId(world.id);
    setWorldDraft({
      name: world.name,
      icon: world.icon ?? null,
    });
  };

  const cancelEditWorld = () => {
    setEditingWorldId(null);
    setWorldDraft({
      name: "",
      icon: null,
    });
  };

  const handleSaveWorld = async (worldId: string) => {
    const name = worldDraft.name.trim();
    if (!name) {
      setStatus("World name is required.", "error");
      return;
    }
    try {
      await invoke("update_instance_world", {
        instanceId,
        worldId,
        name,
        icon: worldDraft.icon,
      });
      setWorlds((prev) =>
        prev.map((world) =>
          world.id === worldId
            ? { ...world, name, icon: worldDraft.icon }
            : world,
        ),
      );
      setStatus("World updated.");
      setEditingWorldId(null);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to update world.";
      setStatus(message, "error");
    }
  };

  const handleToggleMod = async (entry: ModEntry) => {
    try {
      await invoke("toggle_mod", {
        instanceId,
        filename: entry.filename,
        enabled: !entry.enabled,
      });
      const data = await invoke<ModEntry[]>("list_instance_mods", {
        instanceId,
      });
      setMods(data || []);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to update mod.";
      setStatus(message, "error");
    }
  };

  const handleTogglePack = async (entry: PackEntry, kind: TableKind) => {
    try {
      await invoke("toggle_instance_pack", {
        instanceId,
        kind,
        filename: entry.filename,
        enabled: !entry.enabled,
      });
      const data = await invoke<PackEntry[]>("list_instance_packs", {
        instanceId,
        kind,
      });
      if (kind === "resourcepacks") setResourcepacks(data || []);
      if (kind === "texturepacks") setTexturepacks(data || []);
      if (kind === "shaderpacks") setShaders(data || []);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to update pack.";
      setStatus(message, "error");
    }
  };

  const handleToggleDatapack = async (entry: PackEntry) => {
    if (!datapackWorldId) return;
    try {
      await invoke("toggle_instance_datapack", {
        instanceId,
        worldId: datapackWorldId,
        filename: entry.filename,
        enabled: !entry.enabled,
      });
      await loadDatapacks(datapackWorldId);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to update datapack.";
      setStatus(message, "error");
    }
  };

  const handleRename = async () => {
    const nextName = instanceNameState.trim();
    if (!nextName || nextName === instance.name) return;
    try {
      await invoke("rename_instance", {
        instanceId,
        newName: nextName,
      });
      await refreshConfig();
      setStatus("Instance renamed.");
    } catch (err: any) {
      const message = err?.toString?.() || "Rename failed.";
      setStatus(message, "error");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await invoke("update_instance_settings", {
        instanceId,
        minRamMb: minRamMb > 0 ? minRamMb : null,
        maxRamMb: maxRamMb > 0 ? maxRamMb : null,
        jvmArgs: jvmArgs?.trim?.() || null,
      });
      await refreshConfig();
      setStatus("Instance settings saved.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to save settings.";
      setStatus(message, "error");
    }
  };

  const handleResetSettings = async () => {
    try {
      await invoke("update_instance_settings", {
        instanceId,
        minRamMb: null,
        maxRamMb: null,
        jvmArgs: null,
      });
      await refreshConfig();
      setMinRamMb(defaults.minRam);
      setMaxRamMb(defaults.maxRam);
      setJvmArgs(defaults.jvmArgs);
      setStatus("Instance settings reset.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to reset settings.";
      setStatus(message, "error");
    }
  };

  const handleDeleteInstance = async () => {
    try {
      await invoke("remove_instance", { instanceId });
      await refreshConfig();
      setStatus("Instance removed.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to remove instance.";
      setStatus(message, "error");
    }
  };

  const handleRepairInstance = async () => {
    try {
      await invoke("repair_instance", { instanceId });
      setStatus("Instance marked for repair. Launch to re-download files.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to repair instance.";
      setStatus(message, "error");
    }
  };

  const tabs: Array<{ id: TabType; label: string; icon: any }> = [
    { id: "console", label: "Console", icon: Terminal },
    { id: "mods", label: "Mods", icon: Package },
    { id: "resources", label: "Resources", icon: Palette },
    { id: "textures", label: "Textures", icon: Palette },
    { id: "shaders", label: "Shaders", icon: Wand2 },
    { id: "datapacks", label: "Datapacks", icon: Layers },
    { id: "servers", label: "Servers", icon: Globe },
    { id: "worlds", label: "Worlds", icon: Map },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const renderBreadcrumbs = () => (
    <div className="flex items-center gap-2 text-sm text-foreground/60 mb-6">
      <span>{instance.name}</span>
      <span>/</span>
      <span className="text-foreground">
        {tabs.find((t) => t.id === activeTab)?.label}
      </span>
    </div>
  );

  const renderModrinthLauncher = (
    kind: ModrinthKind,
    label: string,
    description: string,
    disabled = false,
  ) => (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-foreground/50">
          Modrinth {label}
        </p>
        <p className="text-sm text-foreground/70">{description}</p>
      </div>
      <Button
        className="bg-secondary text-foreground hover:bg-secondary/80"
        onClick={() => openModrinthDialog(kind)}
        disabled={disabled}
      >
        Browse Modrinth
      </Button>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-card/30">
      <div className="border-b border-border bg-card">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-4 border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <IconComponent size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        <div className="max-w-6xl flex-1 min-h-0 flex flex-col">
          {activeTab === "console" && (
            <ConsolePanel
              breadcrumbs={renderBreadcrumbs()}
              isRunning={isRunning}
              hasAccounts={hasAccounts}
              onStart={handleStart}
              onStop={handleStop}
              onKill={handleKill}
              onCopyLogs={handleCopyLogs}
              onClearLogs={handleClearLogs}
              consoleLogs={consoleLogs}
              memoryUsage={memoryUsage}
              memoryHistory={memoryHistory}
              minRamMb={minRamMb}
              maxRamMb={maxRamMb}
            />
          )}
          {activeTab === "mods" && (
            <PackTable
              breadcrumbs={renderBreadcrumbs()}
              items={mods}
              onToggle={handleToggleMod}
              onOpen={() => openPath("mods")}
              query={getFilter("mods")}
              onQueryChange={(value) => setFilter("mods", value)}
              showVersion
              modrinthPanel={
                renderModrinthLauncher(
                  "mods",
                  "Mods",
                  `Discover ${resolveLoaderLabel(instance.loader)} mods for ${instance.version}.`,
                )
              }
            />
          )}
          {activeTab === "resources" && (
            <PackTable
              breadcrumbs={renderBreadcrumbs()}
              items={resourcepacks}
              onToggle={(entry) => handleTogglePack(entry, "resourcepacks")}
              onOpen={() => openPath("resourcepacks")}
              query={getFilter("resources")}
              onQueryChange={(value) => setFilter("resources", value)}
              showVersion
              versionLabel="Pack format"
              modrinthPanel={
                renderModrinthLauncher(
                  "resources",
                  "Resource Packs",
                  `Discover resource packs for ${instance.version}.`,
                )
              }
            />
          )}
          {activeTab === "textures" && (
            <PackTable
              breadcrumbs={renderBreadcrumbs()}
              items={texturepacks}
              onToggle={(entry) => handleTogglePack(entry, "texturepacks")}
              onOpen={() => openPath("texturepacks")}
              query={getFilter("textures")}
              onQueryChange={(value) => setFilter("textures", value)}
              showVersion
              versionLabel="Pack format"
            />
          )}
          {activeTab === "shaders" && (
            <PackTable
              breadcrumbs={renderBreadcrumbs()}
              items={shaders}
              onToggle={(entry) => handleTogglePack(entry, "shaderpacks")}
              onOpen={() => openPath("shaderpacks")}
              query={getFilter("shaders")}
              onQueryChange={(value) => setFilter("shaders", value)}
              showVersion={false}
              modrinthPanel={
                renderModrinthLauncher(
                  "shaders",
                  "Shaders",
                  `Discover shader packs for ${instance.version}.`,
                )
              }
            />
          )}
          {activeTab === "datapacks" && (
            <DatapackTable
              breadcrumbs={renderBreadcrumbs()}
              modrinthPanel={renderModrinthLauncher(
                "datapacks",
                "Datapacks",
                datapackWorldName
                  ? `Discover datapacks for ${datapackWorldName}.`
                  : "Discover datapacks for this world.",
                !datapackWorldId,
              )}
              worlds={worlds}
              worldId={datapackWorldId}
              onWorldChange={setDatapackWorldId}
              onOpen={() => openDatapacksPath(datapackWorldId)}
              items={datapacks}
              onToggle={handleToggleDatapack}
              query={getFilter("datapacks")}
              onQueryChange={(value) => setFilter("datapacks", value)}
            />
          )}
          {activeTab === "servers" && (
            <ServerTable
              breadcrumbs={renderBreadcrumbs()}
              servers={servers}
              editingIndex={editingServerIndex}
              serverDraft={serverDraft}
              saving={savingServers}
              onAdd={handleAddServer}
              onEdit={startEditServer}
              onCancel={handleCancelEditServer}
              onSave={handleSaveServer}
              onDelete={handleDeleteServer}
              onIconSelect={handleServerIconSelect}
              onDraftChange={(patch) =>
                setServerDraft((prev) => ({ ...prev, ...patch }))
              }
              onOpen={() => openPath("servers")}
              resolveImageData={resolveImageData}
              query={getFilter("servers")}
              onQueryChange={(value) => setFilter("servers", value)}
            />
          )}
          {activeTab === "worlds" && (
            <WorldTable
              breadcrumbs={renderBreadcrumbs()}
              worlds={worlds}
              editingWorldId={editingWorldId}
              worldDraft={worldDraft}
              onEdit={startEditWorld}
              onCancel={cancelEditWorld}
              onSave={handleSaveWorld}
              onDraftChange={(patch) =>
                setWorldDraft((prev) => ({ ...prev, ...patch }))
              }
              onIconSelect={handleWorldIconSelect}
              resolveImageData={resolveImageData}
              query={getFilter("worlds")}
              onQueryChange={(value) => setFilter("worlds", value)}
            />
          )}
          {activeTab === "settings" && (
            <InstanceSettingsPanel
              breadcrumbs={renderBreadcrumbs()}
              instanceName={instanceNameState}
              onInstanceNameChange={setInstanceNameState}
              onRename={handleRename}
              loaderLabel={resolveLoaderLabel(instance.loader)}
              version={instance.version}
              ramUnit={ramUnit}
              onRamUnitChange={setRamUnit}
              displayMinRam={displayMinRam}
              displayMaxRam={displayMaxRam}
              ramStep={ramStep}
              ramDisplayUnit={ramDisplayUnit}
              onMinRamChange={(value) => {
                const next =
                  ramUnit === "gb"
                    ? Math.round(value * 1024)
                    : Math.round(value);
                setMinRamMb(Number.isFinite(next) ? next : 0);
              }}
              onMaxRamChange={(value) => {
                const next =
                  ramUnit === "gb"
                    ? Math.round(value * 1024)
                    : Math.round(value);
                setMaxRamMb(Number.isFinite(next) ? next : 0);
              }}
              jvmArgs={jvmArgs}
              onJvmArgsChange={setJvmArgs}
              onSaveSettings={handleSaveSettings}
              onResetSettings={handleResetSettings}
              onRepair={handleRepairInstance}
              onDelete={() => setShowDeleteModal(true)}
            />
          )}
        </div>
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-xl font-bold">Confirm Delete</h2>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmName("");
                  }}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-foreground/70">
                  Type '<span className="font-semibold">{instance.name}</span>'
                  to confirm deletion.
                </p>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(event) => setDeleteConfirmName(event.target.value)}
                  placeholder={instance.name}
                  className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-destructive font-mono"
                />
              </div>
              <div className="flex gap-3 p-6 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmName("");
                  }}
                  className="flex-1 bg-transparent"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await handleDeleteInstance();
                    setShowDeleteModal(false);
                    setDeleteConfirmName("");
                  }}
                  disabled={deleteConfirmName.trim() !== instance.name}
                  className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
        {modrinthDialogKind ? (
          <ModrinthDialog
            key={modrinthDialogKind}
            open
            kind={modrinthDialogKind}
            state={modrinthState[modrinthDialogKind]}
            instanceVersion={instance.version}
            loaderLabel={
              modrinthDialogKind === "mods"
                ? resolveLoaderLabel(instance.loader)
                : "Minecraft"
            }
            installedProjects={resolveInstalledSet(modrinthDialogKind)}
            onClose={() => setModrinthDialogKind(null)}
            onQueryChange={(value) =>
              updateModrinthState(modrinthDialogKind, { query: value })
            }
            onSearch={() => handleModrinthSearch(modrinthDialogKind)}
            onSortChange={(value) =>
              handleModrinthSortChange(modrinthDialogKind, value)
            }
            onToggleHideInstalled={() =>
              handleModrinthHideInstalledToggle(modrinthDialogKind)
            }
            onToggleCategory={(value) =>
              handleModrinthCategoryToggle(modrinthDialogKind, value)
            }
            onToggleLoader={(value) =>
              handleModrinthLoaderToggle(modrinthDialogKind, value)
            }
            onToggleEnvironment={(side) =>
              handleModrinthEnvironmentToggle(modrinthDialogKind, side)
            }
            onToggleOpenSource={() =>
              handleModrinthOpenSourceToggle(modrinthDialogKind)
            }
            onToggleShowAllVersions={() =>
              handleModrinthShowAllVersionsToggle(modrinthDialogKind)
            }
            onInstall={(project) =>
              handleModrinthInstall(modrinthDialogKind, project)
            }
            onUninstall={(project) =>
              handleModrinthUninstall(modrinthDialogKind, project)
            }
            isInstalling={(projectId) =>
              isModrinthInstalling(modrinthDialogKind, projectId)
            }
            isUninstalling={(projectId) =>
              isModrinthUninstalling(modrinthDialogKind, projectId)
            }
          />
        ) : null}
      </div>
    </div>
  );
}
