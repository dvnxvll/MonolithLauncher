"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getInvoke, getListen, waitForTauri } from "@/lib/tauri";
import type { AppConfig, ProgressEvent } from "@/lib/launcher-types";
import { toast } from "@/hooks/use-toast";

type UnlistenFn = () => void;

type LogsState = {
  launcher: string[];
  game: string[];
  instances: Record<string, string[]>;
};

type LauncherContextValue = {
  ready: boolean;
  loading: boolean;
  config: AppConfig | null;
  refreshConfig: () => Promise<void>;
  saveConfig: (next: AppConfig) => Promise<void>;
  status: string | null;
  setStatus: (message: string, variant?: "info" | "error") => void;
  logs: LogsState;
  appendInstanceLog: (instanceId: string, message: string) => void;
  clearInstanceLogs: (instanceId: string) => void;
  clearLauncherLogs: () => void;
  installProgress: ProgressEvent | null;
  installing: boolean;
  installDetails: string[];
};

const LauncherContext = createContext<LauncherContextValue | null>(null);

const timestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const LauncherProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatusState] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogsState>({
    launcher: [],
    game: [],
    instances: {},
  });
  const [installProgress, setInstallProgress] = useState<ProgressEvent | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);
  const [installDetails, setInstallDetails] = useState<string[]>([]);
  const entitlementCheckInFlight = useRef(false);

  const appendLauncherLog = useCallback((message: string) => {
    if (!message) return;
    setLogs((prev) => {
      const next = [...prev.launcher, `[${timestamp()}] ${message}`];
      return {
        ...prev,
        launcher: next.length > 400 ? next.slice(-400) : next,
      };
    });
  }, []);

  const appendGameLog = useCallback((message: string) => {
    if (!message) return;
    setLogs((prev) => {
      const next = [...prev.game, `[${timestamp()}] ${message}`];
      return {
        ...prev,
        game: next.length > 400 ? next.slice(-400) : next,
      };
    });
  }, []);

  const appendInstanceLog = useCallback(
    (instanceId: string, message: string) => {
      if (!instanceId || !message) return;
      setLogs((prev) => {
        const existing = prev.instances[instanceId] || [];
        const nextLogs = [...existing, `[${timestamp()}] ${message}`];
        return {
          ...prev,
          instances: {
            ...prev.instances,
            [instanceId]:
              nextLogs.length > 400 ? nextLogs.slice(-400) : nextLogs,
          },
        };
      });
    },
    [],
  );

  const clearInstanceLogs = useCallback((instanceId: string) => {
    if (!instanceId) return;
    setLogs((prev) => ({
      ...prev,
      instances: {
        ...prev.instances,
        [instanceId]: [],
      },
    }));
  }, []);

  const clearLauncherLogs = useCallback(() => {
    setLogs((prev) => ({
      ...prev,
      launcher: [],
      game: [],
    }));
  }, []);

  const setStatus = useCallback(
    (message: string, variant: "info" | "error" = "info") => {
      setStatusState(message);
      appendLauncherLog(message);
      if (variant === "error") {
        toast({
          title: "Error",
          description: message,
        });
      } else {
        toast({
          description: message,
        });
      }
    },
    [appendLauncherLog],
  );

  const refreshConfig = useCallback(async () => {
    const invoker = getInvoke();
    if (!invoker) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextConfig = (await invoker("load_config")) as AppConfig;
      setConfig(nextConfig);
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to load config.";
      setStatus(message, "error");
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  const saveConfig = useCallback(
    async (next: AppConfig) => {
      const invoker = getInvoke();
      if (!invoker) {
        setStatus("Tauri backend not available.", "error");
        return;
      }
      try {
        await invoker("save_config", { config: next });
        await refreshConfig();
      } catch (err: any) {
        const message = err?.toString?.() || "Failed to save config.";
        setStatus(message, "error");
      }
    },
    [refreshConfig, setStatus],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const available = await waitForTauri();
      if (!active) return;
      setReady(available);
      if (!available) {
        setLoading(false);
        setStatus("Tauri backend not available.", "error");
        return;
      }
      await refreshConfig();
    })();
    return () => {
      active = false;
    };
  }, [refreshConfig, setStatus]);

  useEffect(() => {
    if (!config || entitlementCheckInFlight.current) return;
    const activeId = config.active_account_id;
    if (!activeId) return;
    const account = config.accounts.find(
      (item) => item.id === activeId && item.kind === "microsoft",
    );
    if (!account || account.owns_minecraft != null) return;
    const invoker = getInvoke();
    if (!invoker) return;
    entitlementCheckInFlight.current = true;
    (async () => {
      try {
        await invoker("check_minecraft_ownership", { accountId: activeId });
        await refreshConfig();
      } catch (err: any) {
        const message =
          err?.toString?.() || "Unable to check Minecraft ownership.";
        setStatus(message, "error");
      } finally {
        entitlementCheckInFlight.current = false;
      }
    })();
  }, [config, refreshConfig, setStatus]);

  useEffect(() => {
    const listen = getListen();
    if (!listen) {
      return;
    }

    let unlistenInstance: (() => void) | null = null;
    let unlistenInstallProgress: (() => void) | null = null;
    let unlistenInstallDone: (() => void) | null = null;
    let unlistenInstallError: (() => void) | null = null;
    let unlistenLaunchStarted: (() => void) | null = null;
    let unlistenLaunchError: (() => void) | null = null;
    let unlistenMicrosoftCode: (() => void) | null = null;
    let unlistenMicrosoftError: (() => void) | null = null;

    listen("instance:log", (event: any) => {
      const payload = event?.payload || {};
      const instanceId = payload.instance_id || payload.instanceId;
      const line = payload.line;
      const stream = payload.stream;
      if (!instanceId || !line) return;
      const prefix = stream === "stderr" ? "[stderr] " : "";
      appendInstanceLog(instanceId, `${prefix}${line}`);
      appendGameLog(`${prefix}${line}`);
    }).then((unlisten: UnlistenFn) => {
      unlistenInstance = unlisten;
    });

    listen("install:progress", (event: any) => {
      const payload = event?.payload || {};
      setInstallProgress({
        stage: payload.stage || "install",
        message: payload.message || "Working",
        current: payload.current || 0,
        total: payload.total ?? null,
        detail: payload.detail ?? null,
      });
      setInstalling(true);
      if (payload.stage === "prepare" && payload.current === 0) {
        setInstallDetails([]);
      }
      const detail = payload.detail;
      if (detail) {
        setInstallDetails((prev) => {
          const next = [...prev, detail];
          return next.length > 80 ? next.slice(-80) : next;
        });
      }
    }).then((unlisten: UnlistenFn) => {
      unlistenInstallProgress = unlisten;
    });

    listen("install:done", () => {
      setInstalling(false);
      setInstallProgress(null);
      setInstallDetails([]);
      setStatus("Instance created.");
      refreshConfig();
    }).then((unlisten: UnlistenFn) => {
      unlistenInstallDone = unlisten;
    });

    listen("install:error", (event: any) => {
      setInstalling(false);
      setInstallProgress(null);
      setInstallDetails([]);
      const message = event?.payload || "Install failed.";
      setStatus(message, "error");
    }).then((unlisten: UnlistenFn) => {
      unlistenInstallError = unlisten;
    });

    listen("launch:started", () => {
      setInstalling(false);
      setInstallProgress(null);
      setInstallDetails([]);
      setStatus("Game launched.");
    }).then((unlisten: UnlistenFn) => {
      unlistenLaunchStarted = unlisten;
    });

    listen("launch:error", () => {
      setInstalling(false);
      setInstallProgress(null);
      setInstallDetails([]);
      setStatus("Launch failed. Check logs.", "error");
    }).then((unlisten: UnlistenFn) => {
      unlistenLaunchError = unlisten;
    });

    listen("microsoft:code", async (event: any) => {
      const code = event?.payload;
      if (!code) return;
      const invoker = getInvoke();
      if (!invoker) {
        setStatus("Tauri backend not available.", "error");
        return;
      }
      try {
        setStatus("Completing Microsoft sign-in...");
        await invoker("complete_microsoft_login", { code });
        await refreshConfig();
        setStatus("Microsoft account connected.");
      } catch (err: any) {
        const message = err?.toString?.() || "Microsoft sign-in failed.";
        setStatus(message, "error");
      }
    }).then((unlisten: UnlistenFn) => {
      unlistenMicrosoftCode = unlisten;
    });

    listen("microsoft:error", (event: any) => {
      const message = event?.payload || "Microsoft sign-in failed.";
      setStatus(message, "error");
    }).then((unlisten: UnlistenFn) => {
      unlistenMicrosoftError = unlisten;
    });

    return () => {
      unlistenInstance?.();
      unlistenInstallProgress?.();
      unlistenInstallDone?.();
      unlistenInstallError?.();
      unlistenLaunchStarted?.();
      unlistenLaunchError?.();
      unlistenMicrosoftCode?.();
      unlistenMicrosoftError?.();
    };
  }, [appendGameLog, appendInstanceLog, refreshConfig, setStatus]);

  const value = useMemo<LauncherContextValue>(
    () => ({
      ready,
      loading,
      config,
      refreshConfig,
      saveConfig,
      status,
      setStatus,
      logs,
      appendInstanceLog,
      clearInstanceLogs,
      clearLauncherLogs,
      installProgress,
      installing,
      installDetails,
    }),
    [
      ready,
      loading,
      config,
      refreshConfig,
      saveConfig,
      status,
      setStatus,
      logs,
      appendInstanceLog,
      clearInstanceLogs,
      clearLauncherLogs,
      installProgress,
      installing,
      installDetails,
    ],
  );

  return (
    <LauncherContext.Provider value={value}>
      {children}
    </LauncherContext.Provider>
  );
};

export const useLauncher = () => {
  const ctx = useContext(LauncherContext);
  if (!ctx) {
    throw new Error("useLauncher must be used within LauncherProvider");
  }
  return ctx;
};
