"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateInstanceDialog from "./dialogs/create-instance-dialog";
import OverviewTabs from "./overview-tabs";
import { useLauncher } from "./launcher-provider";
import { resolveLoaderLabel } from "@/lib/launcher-utils";
import type { Instance } from "@/lib/launcher-types";
import { invoke } from "@/lib/tauri";

export default function Overview() {
  const { config, loading, refreshConfig, setStatus } = useLauncher();
  const instances = config?.instances ?? [];
  const [showDialog, setShowDialog] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [instanceQuery, setInstanceQuery] = useState("");

  const filteredInstances = useMemo(() => {
    const term = instanceQuery.trim().toLowerCase();
    const pool = term
      ? instances.filter((inst) => {
          const name = inst.name.toLowerCase();
          const version = inst.version.toLowerCase();
          const loader = resolveLoaderLabel(inst.loader).toLowerCase();
          return (
            name.includes(term) ||
            version.includes(term) ||
            loader.includes(term)
          );
        })
      : instances;
    return [...pool].sort((a, b) => {
      const pinnedA = a.pinned ? 1 : 0;
      const pinnedB = b.pinned ? 1 : 0;
      if (pinnedA !== pinnedB) {
        return pinnedB - pinnedA;
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [instances, instanceQuery]);

  useEffect(() => {
    const pool = instanceQuery.trim() ? filteredInstances : instances;
    if (!pool.length) {
      setSelectedInstanceId(null);
      return;
    }
    if (
      !selectedInstanceId ||
      !pool.some((inst) => inst.id === selectedInstanceId)
    ) {
      setSelectedInstanceId(pool[0].id);
    }
  }, [filteredInstances, instanceQuery, instances, selectedInstanceId]);

  const selectedInstance = useMemo<Instance | null>(() => {
    if (!selectedInstanceId) return filteredInstances[0] || null;
    return (
      filteredInstances.find((inst) => inst.id === selectedInstanceId) ||
      filteredInstances[0] ||
      null
    );
  }, [filteredInstances, selectedInstanceId]);

  const activeAccount = useMemo(() => {
    const activeId = config?.active_account_id;
    if (!activeId) return null;
    return config?.accounts?.find((acc) => acc.id === activeId) || null;
  }, [config]);

  const renderOwnershipBadge = () => {
    if (!activeAccount) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-muted/40 text-muted-foreground border border-border/60">
          NO ACCOUNT
        </span>
      );
    }
    if (activeAccount.kind !== "microsoft") {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-secondary/40 text-foreground/70 border border-border/60">
          OFFLINE
        </span>
      );
    }
    let label = "UNKNOWN";
    let className = "bg-muted/40 text-muted-foreground border border-border/60";
    if (activeAccount.owns_minecraft === true) {
      label = "OWNED";
      className =
        "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    } else if (activeAccount.owns_minecraft === false) {
      label = "NO LICENSE";
      className =
        "bg-destructive/15 text-destructive border border-destructive/30";
    }
    return (
      <span
        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${className}`}
      >
        {label}
      </span>
    );
  };

  const formatRamValue = (valueMb: number) => {
    if (valueMb >= 1024) {
      const gb = valueMb / 1024;
      const label = Number.isInteger(gb) ? gb.toString() : gb.toFixed(2);
      return `${label}GB`;
    }
    return `${valueMb}MB`;
  };

  const resolveRamLabel = (instance: Instance) => {
    const minRam =
      instance.java_min_ram_mb ?? config?.settings?.java?.min_ram_mb ?? null;
    const maxRam =
      instance.java_max_ram_mb ?? config?.settings?.java?.max_ram_mb ?? null;
    if (!minRam || !maxRam) {
      return "Default RAM";
    }
    return `${formatRamValue(minRam)} - ${formatRamValue(maxRam)}`;
  };

  const handleTogglePin = async (target: Instance) => {
    try {
      await invoke("set_instance_pinned", {
        instanceId: target.id,
        pinned: !target.pinned,
      });
      await refreshConfig();
      setStatus(target.pinned ? "Instance unpinned." : "Instance pinned.");
    } catch (err: any) {
      const message = err?.toString?.() || "Failed to update pin state.";
      setStatus(message, "error");
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 h-28 flex items-center border-b border-border px-8 bg-background">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-4xl font-bold">Instances</h2>
            <p className="text-foreground/60 text-sm mt-1">
              Manage and configure your game instances
            </p>
          </div>
          <Button
            onClick={() => setShowDialog(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11"
            disabled={loading}
          >
            <Plus size={20} />
            Create Instance
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Left Panel - Instance List */}
        <div className="w-80 min-h-0 border-r border-border overflow-y-auto bg-card/30">
          {instances.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center h-full">
              <p className="text-foreground/60 text-center mb-6">
                No instances yet. Create one to get started.
              </p>
              <Button
                onClick={() => setShowDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Plus size={18} />
                Create
              </Button>
            </div>
          ) : (
            <div className="flex flex-col min-h-0">
              <div className="p-4 border-b border-border">
                <input
                  value={instanceQuery}
                  onChange={(event) => setInstanceQuery(event.target.value)}
                  placeholder="Search instances..."
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="p-4 space-y-2">
                {filteredInstances.length === 0 ? (
                  <div className="text-sm text-foreground/60 text-center py-8">
                    No instances match your search.
                  </div>
                ) : (
                  filteredInstances.map((instance) => (
                    <button
                      key={instance.id}
                      onClick={() => setSelectedInstanceId(instance.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        selectedInstance?.id === instance.id
                          ? "bg-accent/20 border-accent"
                          : "border-border bg-card/50 hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-sm">{instance.name}</h3>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleTogglePin(instance);
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          aria-label={
                            instance.pinned ? "Unpin instance" : "Pin instance"
                          }
                        >
                          <Star
                            size={16}
                            fill={instance.pinned ? "currentColor" : "none"}
                            className={
                              instance.pinned
                                ? "text-amber-300"
                                : "text-foreground/40"
                            }
                          />
                        </button>
                      </div>
                      <p className="text-xs text-foreground/60 mt-1">
                        {resolveLoaderLabel(instance.loader)} {instance.version}
                      </p>
                      <div className="flex gap-1 mt-2">
                        <span className="inline-block px-2 py-1 bg-secondary/40 text-xs rounded text-foreground/70">
                          {resolveRamLabel(instance)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Instance Tabs */}
        {selectedInstance ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Instance Header Bar */}
            <div className="border-b border-border px-8 py-4 bg-card flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold">{selectedInstance.name}</h1>
              <div className="flex items-center gap-3 text-sm text-foreground/70">
                <span className="font-mono">
                  {activeAccount?.display_name ?? "No account"}
                </span>
                {renderOwnershipBadge()}
              </div>
            </div>

            {/* Tabs Component */}
            <OverviewTabs instance={selectedInstance} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/40">
              Select an instance to view details
            </p>
          </div>
        )}
      </div>

      <CreateInstanceDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onCreated={(instanceId) => {
          if (instanceId) {
            setSelectedInstanceId(instanceId);
          }
        }}
      />
    </div>
  );
}
