"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke } from "@/lib/tauri";
import type {
  ForgeVersionSummary,
  Instance,
  LoaderKind,
  LoaderVersionSummary,
  VersionSummary,
} from "@/lib/launcher-types";
import { useLauncher } from "@/components/launcher-provider";

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (instanceId: string) => void;
}

type LoaderVersion = LoaderVersionSummary | ForgeVersionSummary;

export default function CreateInstanceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateInstanceDialogProps) {
  const { config, refreshConfig, setStatus, installing } = useLauncher();
  const [displayName, setDisplayName] = useState("");
  const [loader, setLoader] = useState<LoaderKind>("vanilla");
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [gameVersions, setGameVersions] = useState<VersionSummary[]>([]);
  const [gameVersion, setGameVersion] = useState("");
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [minRamMb, setMinRamMb] = useState(512);
  const [maxRamMb, setMaxRamMb] = useState(1024);
  const [ramUnit, setRamUnit] = useState<"mb" | "gb">("mb");
  const [jvmArgs, setJvmArgs] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || installing;
  const trimmedName = displayName.trim();
  const nameConflict = useMemo(() => {
    if (!trimmedName || !config?.instances?.length) return false;
    const normalized = trimmedName.toLowerCase();
    return config.instances.some(
      (instance) => instance.name.toLowerCase() === normalized,
    );
  }, [config?.instances, trimmedName]);

  const ramDisplayUnit = ramUnit === "gb" ? "GB" : "MB";
  const displayMinRam =
    ramUnit === "gb" ? Number((minRamMb / 1024).toFixed(2)) : minRamMb;
  const displayMaxRam =
    ramUnit === "gb" ? Number((maxRamMb / 1024).toFixed(2)) : maxRamMb;
  const ramStep = ramUnit === "gb" ? 0.25 : 64;

  useEffect(() => {
    if (!open) return;
    const defaults = config?.settings?.java;
    setMinRamMb(defaults?.min_ram_mb ?? 512);
    setMaxRamMb(defaults?.max_ram_mb ?? 1024);
    setJvmArgs(defaults?.jvm_args ?? "");
  }, [config, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const fetchGameVersions = async () => {
      try {
        const versions =
          loader === "fabric"
            ? await invoke<VersionSummary[]>("list_fabric_game_versions", {
                includeSnapshots,
              })
            : await invoke<VersionSummary[]>("list_vanilla_versions", {
                includeSnapshots,
              });
        if (cancelled) return;
        setGameVersions(versions);
        if (!versions.some((version) => version.id === gameVersion)) {
          setGameVersion(versions[0]?.id ?? "");
        }
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.toString?.() || "Failed to load versions.";
        setStatus(message, "error");
      }
    };

    fetchGameVersions();

    return () => {
      cancelled = true;
    };
  }, [open, loader, includeSnapshots, gameVersion, setStatus]);

  useEffect(() => {
    if (!open) return;
    if (loader === "vanilla") {
      setLoaderVersions([]);
      setLoaderVersion("");
      return;
    }
    if (!gameVersion) {
      setLoaderVersions([]);
      setLoaderVersion("");
      return;
    }

    let cancelled = false;

    const fetchLoaderVersions = async () => {
      try {
        const versions =
          loader === "fabric"
            ? await invoke<LoaderVersionSummary[]>(
                "list_fabric_loader_versions",
                {
                  gameVersion,
                  includeSnapshots: true,
                },
              )
            : await invoke<ForgeVersionSummary[]>("list_forge_versions", {
                gameVersion,
              });
        if (cancelled) return;
        setLoaderVersions(versions);
        if (!versions.some((entry) => entry.version === loaderVersion)) {
          setLoaderVersion(versions[0]?.version ?? "");
        }
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.toString?.() || "Failed to load loader versions.";
        setStatus(message, "error");
      }
    };

    fetchLoaderVersions();

    return () => {
      cancelled = true;
    };
  }, [open, loader, gameVersion, includeSnapshots, loaderVersion, setStatus]);

  const resetForm = () => {
    setDisplayName("");
    setLoader("vanilla");
    setIncludeSnapshots(false);
    setGameVersion("");
    setLoaderVersion("");
    setMinRamMb(config?.settings?.java?.min_ram_mb ?? 512);
    setMaxRamMb(config?.settings?.java?.max_ram_mb ?? 1024);
    setJvmArgs(config?.settings?.java?.jvm_args ?? "");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!displayName.trim()) {
      setStatus("Please enter a display name.", "error");
      return;
    }
    if (nameConflict) {
      setStatus("An instance with that name already exists.", "error");
      return;
    }
    if (!gameVersion) {
      setStatus("Select a game version.", "error");
      return;
    }
    if (loader !== "vanilla" && !loaderVersion) {
      setStatus("Select a loader version.", "error");
      return;
    }

    const request = {
      name: displayName.trim(),
      game_version: gameVersion,
      loader,
      loader_version: loader === "vanilla" ? null : loaderVersion,
      show_snapshots: includeSnapshots,
      root_id: null,
    };

    try {
      setSubmitting(true);
      const created = await invoke<Instance>("create_instance", { request });
      if (created?.id) {
        await invoke("update_instance_settings", {
          instanceId: created.id,
          minRamMb: minRamMb || null,
          maxRamMb: maxRamMb || null,
          jvmArgs: jvmArgs?.trim?.() || null,
        });
      }
      await refreshConfig();
      if (created?.id) {
        onCreated?.(created.id);
      }
      handleClose();
    } catch (err: any) {
      const message = err?.toString?.() || "Install failed.";
      setStatus(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
          <h2 className="text-xl font-bold">Create Instance</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-muted rounded transition-colors"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Vanilla Survival"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {nameConflict && (
              <p className="text-xs text-destructive mt-2">
                An instance with this name already exists.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <Select
              value={loader}
              onValueChange={(value) => setLoader(value as LoaderKind)}
            >
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring">
                <SelectValue placeholder="Select loader" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="vanilla">Vanilla</SelectItem>
                <SelectItem value="fabric">Fabric</SelectItem>
                <SelectItem value="forge">Forge</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium">
                Include Snapshots
              </label>
              <button
                onClick={() => setIncludeSnapshots(!includeSnapshots)}
                className={`relative w-10 h-6 rounded-full transition-all ${
                  includeSnapshots ? "bg-accent" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${
                    includeSnapshots ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-foreground/60">
              {includeSnapshots
                ? "Snapshot versions will be available in the list."
                : "Only stable versions will be available."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Version</label>
            <Select
              value={gameVersion || undefined}
              onValueChange={setGameVersion}
              disabled={gameVersions.length === 0}
            >
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring">
                <SelectValue
                  placeholder={
                    gameVersions.length === 0
                      ? "No versions available"
                      : "Select version"
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {gameVersions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.id}
                    {version.stable ? "" : " (snapshot)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Loader Version
            </label>
            <Select
              value={loaderVersion || undefined}
              onValueChange={setLoaderVersion}
              disabled={loader === "vanilla" || loaderVersions.length === 0}
            >
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring disabled:opacity-60">
                <SelectValue
                  placeholder={
                    loader === "vanilla"
                      ? "Not required"
                      : loaderVersions.length === 0
                        ? "No loader versions"
                        : "Select loader version"
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {loaderVersions.map((entry) => {
                  const label =
                    loader === "fabric" && "stable" in entry && !entry.stable
                      ? `${entry.version} (unstable)`
                      : entry.version;
                  return (
                    <SelectItem key={entry.version} value={entry.version}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">JVM Settings</h3>
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

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Min RAM
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
                    min={ramUnit === "gb" ? 0.25 : 128}
                    max={displayMaxRam}
                    className="w-full bg-input border border-border rounded-lg px-4 py-2 pr-12 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-foreground/60 font-mono">
                    {ramDisplayUnit}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max RAM
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
                    min={displayMinRam}
                    className="w-full bg-input border border-border rounded-lg px-4 py-2 pr-12 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-foreground/60 font-mono">
                    {ramDisplayUnit}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Optional JVM Args
              </label>
              <textarea
                value={jvmArgs}
                onChange={(e) => setJvmArgs(e.target.value)}
                placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-border bg-card">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 bg-transparent"
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || nameConflict}
          >
            {busy ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
