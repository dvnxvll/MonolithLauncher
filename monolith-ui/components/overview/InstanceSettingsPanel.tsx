import type { ReactNode } from "react";
import { AlertTriangle, Copy, RefreshCw, RotateCcw, ShieldAlert, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  InstanceDiagnostic,
  InstancePreflightReport,
  InstanceSnapshot,
  JavaRuntimeEntry,
} from "@/lib/launcher-types";

interface InstanceSettingsPanelProps {
  breadcrumbs: ReactNode;
  instanceName: string;
  onInstanceNameChange: (value: string) => void;
  onRename: () => void;
  loaderLabel: string;
  version: string;
  javaOverrideId: string;
  javaOptions: JavaRuntimeEntry[];
  onJavaOverrideChange: (value: string) => void;
  savingJavaOverride: boolean;
  onScanJavaRuntimes: () => void;
  scanningJavaRuntimes: boolean;
  preflight: InstancePreflightReport | null;
  loadingPreflight: boolean;
  onRefreshPreflight: () => void;
  onCopyRecentLog: () => void;
  snapshots: InstanceSnapshot[];
  loadingSnapshots: boolean;
  creatingSnapshot: boolean;
  restoringSnapshotId: string | null;
  deletingSnapshotId: string | null;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
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
  repairing: boolean;
  onDelete: () => void;
}

const statusClass = (status: string) => {
  switch (status) {
    case "ok":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
    case "warn":
      return "border-amber-400/20 bg-amber-500/10 text-amber-200";
    case "error":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    default:
      return "border-border bg-secondary/30 text-foreground/70";
  }
};

const severityClass = (severity: InstanceDiagnostic["severity"]) => {
  switch (severity) {
    case "error":
      return "border-red-500/30 bg-red-500/10";
    case "warn":
      return "border-amber-500/30 bg-amber-500/10";
    default:
      return "border-border bg-secondary/20";
  }
};

const formatSnapshotTime = (value: number) => {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
};

export default function InstanceSettingsPanel({
  breadcrumbs,
  instanceName,
  onInstanceNameChange,
  onRename,
  loaderLabel,
  version,
  javaOverrideId,
  javaOptions,
  onJavaOverrideChange,
  savingJavaOverride,
  onScanJavaRuntimes,
  scanningJavaRuntimes,
  preflight,
  loadingPreflight,
  onRefreshPreflight,
  onCopyRecentLog,
  snapshots,
  loadingSnapshots,
  creatingSnapshot,
  restoringSnapshotId,
  deletingSnapshotId,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
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
  repairing,
  onDelete,
}: InstanceSettingsPanelProps) {
  const diagnostics = preflight?.diagnostics ?? [];
  const selectedJava = preflight?.java.selected;
  const healthStatus = preflight
    ? preflight.ready
      ? "Ready"
      : "Needs attention"
    : "Checking";

  return (
    <div className="space-y-6">
      {breadcrumbs}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="min-w-0 bg-card border border-border rounded-xl p-4 md:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                Instance Health
              </p>
              <h3 className="mt-2 text-xl font-bold">{healthStatus}</h3>
              <p className="mt-1 text-sm text-foreground/60">
                Java {preflight?.java.recommended_major ?? "-"} recommended for {version}.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={onRefreshPreflight}
              disabled={loadingPreflight}
              className="bg-transparent gap-2"
            >
              <RefreshCw size={16} className={loadingPreflight ? "animate-spin" : ""} />
              {loadingPreflight ? "Checking" : "Refresh Checks"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {(preflight?.checks ?? []).map((check) => (
              <div
                key={check.id}
                className="min-w-0 rounded-lg border border-border bg-secondary/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-foreground/45">
                    {check.label}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(check.status)}`}
                  >
                    {check.status}
                  </span>
                </div>
                <p className="mt-3 break-words text-sm text-foreground">{check.summary}</p>
                {check.detail ? (
                  <p className="mt-2 font-mono text-[11px] text-foreground/50 break-all">
                    {check.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {preflight?.latest_log_excerpt ? (
            <div className="rounded-lg border border-border bg-input p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.22em] text-foreground/45">
                  Recent Log Signal
                </p>
                <button
                  type="button"
                  onClick={onCopyRecentLog}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-secondary/20 text-foreground/60 transition hover:bg-secondary/40 hover:text-foreground"
                  aria-label="Copy recent log signal"
                  title="Copy recent log signal"
                >
                  <Copy size={14} />
                </button>
              </div>
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words pr-2 font-mono text-[11px] text-foreground/72">
                {preflight.latest_log_excerpt}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 bg-card border border-border rounded-xl p-4 md:p-6 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
              Runtime
            </p>
            <h3 className="mt-2 text-xl font-bold">Java Selection</h3>
          </div>
          <div className="space-y-3">
            <Select value={javaOverrideId} onValueChange={onJavaOverrideChange}>
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring">
                <SelectValue placeholder="Select Java runtime" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="default">Use launcher default</SelectItem>
                {javaOptions.map((runtime) => (
                  <SelectItem key={runtime.id} value={runtime.id}>
                    {runtime.label}
                    {runtime.version ? ` (Java ${runtime.version})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onScanJavaRuntimes}
                disabled={scanningJavaRuntimes}
                className="bg-transparent gap-2"
              >
                <RefreshCw size={16} className={scanningJavaRuntimes ? "animate-spin" : ""} />
                {scanningJavaRuntimes ? "Scanning" : "Rescan"}
              </Button>
              {savingJavaOverride ? (
                <span className="self-center text-xs text-foreground/55">
                  Saving override...
                </span>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm text-foreground/70">
              <p className="font-medium text-foreground">{selectedJava?.label ?? "No Java selected"}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-foreground/50">
                {selectedJava?.path ?? "Launcher default / JAVA_HOME / PATH"}
              </p>
              <p className="mt-2 text-xs text-foreground/55">
                {selectedJava?.major
                  ? `Resolved Java ${selectedJava.major}`
                  : "Version not detected"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 bg-card border border-border rounded-xl p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                Diagnostics
              </p>
              <h3 className="mt-2 text-xl font-bold">Launch blockers and warnings</h3>
            </div>
            <ShieldAlert className="text-foreground/45" size={18} />
          </div>

          {diagnostics.length === 0 ? (
            <p className="mt-5 text-sm text-foreground/60">
              No current diagnostics. This instance passed the current preflight checks.
            </p>
          ) : (
            <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-2">
              {diagnostics.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.code}-${index}`}
                  className={`rounded-lg border p-4 ${severityClass(diagnostic.severity)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{diagnostic.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                      {diagnostic.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/75">{diagnostic.summary}</p>
                  {diagnostic.suggested_fix ? (
                    <p className="mt-3 text-xs text-foreground/55">
                      Suggested fix: {diagnostic.suggested_fix}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card border border-border rounded-xl p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                Recovery
              </p>
              <h3 className="mt-2 text-xl font-bold">Snapshots</h3>
            </div>
            <Button
              onClick={onCreateSnapshot}
              disabled={creatingSnapshot}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {creatingSnapshot ? "Saving..." : "Create Snapshot"}
            </Button>
          </div>
          {loadingSnapshots ? (
            <p className="mt-5 text-sm text-foreground/60">Loading snapshots...</p>
          ) : snapshots.length === 0 ? (
            <p className="mt-5 text-sm text-foreground/60">
              No snapshots yet. Create one before making risky loader or mod changes.
            </p>
          ) : (
            <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-2">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="rounded-lg border border-border bg-secondary/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {snapshot.reason || "Manual snapshot"}
                      </p>
                      <p className="mt-1 text-xs text-foreground/55">
                        {formatSnapshotTime(snapshot.created_at_unix)}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-foreground/45">
                        {snapshot.file_count} file{snapshot.file_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => onRestoreSnapshot(snapshot.id)}
                        disabled={restoringSnapshotId === snapshot.id}
                        className="bg-transparent gap-2"
                      >
                        <RotateCcw size={14} />
                        {restoringSnapshotId === snapshot.id ? "Restoring" : "Restore"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onDeleteSnapshot(snapshot.id)}
                        disabled={deletingSnapshotId === snapshot.id}
                        className="bg-transparent text-destructive hover:text-destructive"
                      >
                        {deletingSnapshotId === snapshot.id ? "Deleting" : "Delete"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
              Identity
            </p>
            <h3 className="mt-2 text-lg font-bold">Instance Name</h3>
          </div>
          <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/45">
              Profile
            </p>
            <p className="mt-1 text-xs text-foreground/65">
              {loaderLabel} • {version}
            </p>
          </div>
        </div>
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
          Press Enter or leave the field to rename this instance.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
              Runtime Limits
            </p>
            <h3 className="mt-2 text-lg font-bold">Memory Configuration</h3>
          </div>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-secondary/15 p-4">
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
          <div className="rounded-xl border border-border bg-secondary/15 p-4">
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
        <p className="mt-4 text-xs text-foreground/50">
          Keep maximum RAM high enough for modded instances, but leave headroom for the system.
        </p>
      </div>

      {canEditLoaderVersion ? (
        <div className="bg-card border border-border rounded-xl p-4 md:p-6">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
              Compatibility
            </p>
            <h3 className="mt-2 text-lg font-bold">Loader Version</h3>
          </div>
          <div className="grid gap-3">
            <Select value={loaderVersion || undefined} onValueChange={onLoaderVersionChange}>
              <SelectTrigger className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-ring">
                <SelectValue placeholder="Select loader version" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {loaderVersionOptions.map((entry) => (
                  <SelectItem key={entry.version} value={entry.version} className="group">
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
              Changing loader version clears installed loader metadata and reapplies it on the next launch.
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-xs text-foreground/45">
                Use the recommended channel unless you are targeting a specific modpack build.
              </div>
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

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
            Advanced Runtime
          </p>
          <h3 className="mt-2 text-lg font-bold">JVM Arguments</h3>
        </div>
        <textarea
          value={jvmArgs}
          onChange={(e) => onJvmArgsChange(e.target.value)}
          className="w-full h-24 bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm resize-none"
        />
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-foreground/50">
            Add only arguments you understand. Instance-specific flags override the launcher default stack.
          </p>
          <div className="flex gap-2">
          <Button
            onClick={onSaveSettings}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Save Settings
          </Button>
          <Button variant="outline" onClick={onResetSettings} className="bg-transparent">
            Reset
          </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
            Recovery Action
          </p>
          <h3 className="mt-2 text-lg font-bold mb-2">Repair Instance</h3>
          <p className="text-sm text-foreground/60">
            Clears launcher-managed core files and preserves a snapshot first when possible.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/15 p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/45">
            Repair Targets
          </p>
          <p className="mt-2 text-sm text-foreground/70">
            {(preflight?.repair_targets ?? []).join(", ") || "versions, libraries, natives, installers"}
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-foreground/50">
            Use this after broken updates, corrupted libraries, or mismatched launcher-managed files.
          </p>
          <Button
            onClick={onRepair}
            disabled={repairing}
            className="bg-secondary text-foreground hover:bg-secondary/80"
          >
            {repairing ? "Repairing..." : "Repair Instance"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/28 bg-destructive/8 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-destructive/20 bg-destructive/12 p-3 text-destructive">
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.28em] text-destructive/70">
                Danger Zone
              </p>
              <h3 className="mt-2 text-lg font-bold text-foreground">Delete Instance</h3>
              <p className="mt-2 text-sm text-foreground/70">
                Permanently removes the instance directory, installed content, and launcher-managed metadata.
              </p>
            </div>
          </div>
          <Button variant="destructive" onClick={onDelete} className="md:self-center">
            Delete Instance
          </Button>
        </div>
        <div className="mt-4 rounded-xl border border-destructive/18 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-destructive/70">
            Destructive Action
          </p>
          <p className="mt-2 text-sm text-foreground/68">
            A typed-name confirmation is required before deletion can proceed.
          </p>
        </div>
      </div>
    </div>
  );
}
