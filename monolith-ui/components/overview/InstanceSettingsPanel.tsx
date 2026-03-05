import type { ReactNode } from "react";
import { AlertTriangle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InstanceSettingsPanelProps {
  breadcrumbs: ReactNode;
  instanceName: string;
  onInstanceNameChange: (value: string) => void;
  onRename: () => void;
  loaderLabel: string;
  version: string;
  ramUnit: "mb" | "gb";
  onRamUnitChange: (unit: "mb" | "gb") => void;
  displayMinRam: number;
  displayMaxRam: number;
  ramStep: number;
  ramDisplayUnit: string;
  onMinRamChange: (value: number) => void;
  onMaxRamChange: (value: number) => void;
  jvmArgs: string;
  onJvmArgsChange: (value: string) => void;
  onSaveSettings: () => void;
  onResetSettings: () => void;
  canEditLoaderVersion: boolean;
  loaderVersion: string;
  loaderVersionOptions: Array<{ version: string; recommended: boolean }>;
  onLoaderVersionChange: (value: string) => void;
  onSaveLoaderVersion: () => void;
  savingLoaderVersion: boolean;
  onRepair: () => void;
  onDelete: () => void;
}

export default function InstanceSettingsPanel({
  breadcrumbs,
  instanceName,
  onInstanceNameChange,
  onRename,
  loaderLabel,
  version,
  ramUnit,
  onRamUnitChange,
  displayMinRam,
  displayMaxRam,
  ramStep,
  ramDisplayUnit,
  onMinRamChange,
  onMaxRamChange,
  jvmArgs,
  onJvmArgsChange,
  onSaveSettings,
  onResetSettings,
  canEditLoaderVersion,
  loaderVersion,
  loaderVersionOptions,
  onLoaderVersionChange,
  onSaveLoaderVersion,
  savingLoaderVersion,
  onRepair,
  onDelete,
}: InstanceSettingsPanelProps) {
  return (
    <div className="space-y-6">
      {breadcrumbs}

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4">Instance Name</h3>
        <input
          type="text"
          value={instanceName}
          onChange={(e) => onInstanceNameChange(e.target.value)}
          onBlur={onRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onRename();
            }
          }}
          className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-foreground/50 mt-2">
          Loader: {loaderLabel} • Version: {version}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Memory Configuration</h3>
          <div className="flex items-center rounded-lg border border-border bg-secondary/30 p-1 text-xs font-semibold">
            <button
              onClick={() => onRamUnitChange("mb")}
              className={`px-3 py-1 rounded-md transition-colors ${
                ramUnit === "mb"
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              MB
            </button>
            <button
              onClick={() => onRamUnitChange("gb")}
              className={`px-3 py-1 rounded-md transition-colors ${
                ramUnit === "gb"
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              GB
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-foreground/60 uppercase tracking-widest mb-2">
              Minimum RAM
            </label>
            <div className="relative">
              <input
                type="number"
                step={ramStep}
                value={displayMinRam}
                onChange={(e) => onMinRamChange(Number(e.target.value))}
                className="w-full bg-input border border-border rounded-lg px-4 py-3 pr-14 font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="absolute right-4 top-3.5 text-foreground/60 font-mono">
                {ramDisplayUnit}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-foreground/60 uppercase tracking-widest mb-2">
              Maximum RAM
            </label>
            <div className="relative">
              <input
                type="number"
                step={ramStep}
                value={displayMaxRam}
                onChange={(e) => onMaxRamChange(Number(e.target.value))}
                className="w-full bg-input border border-border rounded-lg px-4 py-3 pr-14 font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="absolute right-4 top-3.5 text-foreground/60 font-mono">
                {ramDisplayUnit}
              </span>
            </div>
          </div>
        </div>
      </div>

      {canEditLoaderVersion ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Loader Version</h3>
          <div className="grid gap-3">
            <Select value={loaderVersion || undefined} onValueChange={onLoaderVersionChange}>
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring">
                <SelectValue placeholder="Select loader version" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {loaderVersionOptions.map((entry) => (
                  <SelectItem
                    key={entry.version}
                    value={entry.version}
                    className="group"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {entry.version}
                      {entry.recommended ? (
                        <span className="inline-flex items-center gap-1 rounded border border-yellow-300/50 bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-yellow-200 group-data-[highlighted]:border-yellow-700/60 group-data-[highlighted]:bg-yellow-300 group-data-[highlighted]:text-yellow-950">
                          <Star size={12} fill="currentColor" />
                          Recommended
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground/60">
              Changing loader version clears installed loader metadata and reapplies
              it on the next launch.
            </p>
            <div>
              <Button
                onClick={onSaveLoaderVersion}
                disabled={savingLoaderVersion || !loaderVersion}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {savingLoaderVersion ? "Saving..." : "Confirm Loader Version"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4">JVM Arguments</h3>
        <textarea
          value={jvmArgs}
          onChange={(e) => onJvmArgsChange(e.target.value)}
          className="w-full h-24 bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm resize-none"
        />
        <div className="flex gap-2 mt-4">
          <Button
            onClick={onSaveSettings}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Save Settings
          </Button>
          <Button
            variant="outline"
            onClick={onResetSettings}
            className="bg-transparent"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-2">Repair Instance</h3>
        <p className="text-sm text-foreground/60 mb-4">
          Clears core files (versions, libraries, natives) so they re-download
          on next launch.
        </p>
        <Button
          onClick={onRepair}
          className="bg-secondary text-foreground hover:bg-secondary/80"
        >
          Repair Instance
        </Button>
      </div>

      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle
            size={24}
            className="text-destructive flex-shrink-0 mt-1"
          />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-destructive mb-2">
              Delete Instance
            </h3>
            <p className="text-sm text-foreground/70 mb-4">
              This action cannot be undone. All instance data will be
              permanently deleted.
            </p>
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 font-medium"
            >
              Delete Instance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
