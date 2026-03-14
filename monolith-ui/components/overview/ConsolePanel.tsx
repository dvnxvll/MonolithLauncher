import { useState, type MouseEvent, type ReactNode } from "react";
import { Copy, Play, SkipBack, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InstanceMetrics } from "@/lib/launcher-types";

interface ConsolePanelProps {
  breadcrumbs: ReactNode;
  isRunning: boolean;
  hasAccounts: boolean;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
  consoleLogs: string[];
  memoryUsageMb: number | null;
  cpuLoadPct: number | null;
  gpuLoadPct: number | null;
  maxRamMb: number;
  metricHistory: InstanceMetrics[];
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const formatMemory = (valueMb: number | null) => {
  if (valueMb === null) return "—";
  if (valueMb >= 1024) return `${(valueMb / 1024).toFixed(1)} GB`;
  return `${valueMb.toFixed(1)} MB`;
};

const buildPolylinePoints = (values: number[]) => {
  if (values.length < 2) return "";
  return values
    .map((value, idx) => {
      const x = (idx / (values.length - 1)) * 100;
      const y = 40 - (clampPercent(value) / 100) * 40;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

const resolveLogColorClass = (line: string) => {
  const lower = line.toLowerCase();
  if (
    lower.includes("[stderr]") ||
    lower.includes("/error]") ||
    lower.includes(" error:")
  ) {
    return "text-red-300/95";
  }
  if (lower.includes("/warn]") || lower.includes(" warn")) {
    return "text-amber-300/95";
  }
  if (lower.includes("[launcher]")) {
    return "text-cyan-300/90";
  }
  if (lower.includes("[latest.log]")) {
    return "text-emerald-300/90";
  }
  return "text-foreground/72";
};

export default function ConsolePanel({
  breadcrumbs,
  isRunning,
  hasAccounts,
  onStart,
  onStop,
  onKill,
  onCopyLogs,
  onClearLogs,
  consoleLogs,
  memoryUsageMb,
  cpuLoadPct,
  gpuLoadPct,
  maxRamMb,
  metricHistory,
}: ConsolePanelProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const displayCpuLoadPct = cpuLoadPct !== null ? clampPercent(cpuLoadPct) : null;
  const displayGpuLoadPct = gpuLoadPct !== null ? clampPercent(gpuLoadPct) : null;
  const ramSeries = metricHistory.map((sample) => {
    if (maxRamMb <= 0) return 0;
    return (sample.rss_mb / maxRamMb) * 100;
  });
  const cpuSeries = metricHistory.map((sample) => clampPercent(sample.cpu_load_pct ?? 0));
  const gpuSeries = metricHistory.map((sample) => clampPercent(sample.gpu_load_pct ?? 0));

  const ramPoints = buildPolylinePoints(ramSeries);
  const cpuPoints = buildPolylinePoints(cpuSeries);
  const gpuPoints = buildPolylinePoints(gpuSeries);
  const hoverSample = hoverIndex !== null ? metricHistory[hoverIndex] ?? null : null;
  const hoverPct =
    hoverIndex !== null && metricHistory.length > 1
      ? (hoverIndex / (metricHistory.length - 1)) * 100
      : 0;
  const hoverRamY =
    hoverIndex !== null ? 40 - (clampPercent(ramSeries[hoverIndex] ?? 0) / 100) * 40 : null;
  const hoverCpuY =
    hoverIndex !== null ? 40 - (clampPercent(cpuSeries[hoverIndex] ?? 0) / 100) * 40 : null;
  const hoverGpuY =
    hoverIndex !== null ? 40 - (clampPercent(gpuSeries[hoverIndex] ?? 0) / 100) * 40 : null;

  const handleGraphHover = (event: MouseEvent<SVGSVGElement>) => {
    if (metricHistory.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const ratio = localX / rect.width;
    const nextIndex = Math.round(ratio * (metricHistory.length - 1));
    setHoverIndex(nextIndex);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4">
      {breadcrumbs}
      <div className="flex gap-2">
        <Button
          onClick={isRunning ? onStop : onStart}
          className={`gap-2 ${
            isRunning
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-accent text-accent-foreground hover:bg-accent/90"
          }`}
          disabled={!hasAccounts && !isRunning}
        >
          {isRunning ? (
            <>
              <Square size={18} />
              Stop
            </>
          ) : (
            <>
              <Play size={18} />
              Start
            </>
          )}
        </Button>
        <Button
          onClick={onKill}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
        >
          <SkipBack size={18} />
          Kill
        </Button>
      </div>
      {!hasAccounts && (
        <p className="text-xs text-foreground/50">
          Add a Microsoft account to enable Start.
        </p>
      )}

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-[430px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/70">
              Instance Log
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCopyLogs}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-secondary/20 text-foreground/60 transition hover:bg-secondary/40 hover:text-foreground"
                aria-label="Copy instance log"
                title="Copy instance log"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={onClearLogs}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-secondary/20 text-foreground/60 transition hover:bg-destructive/15 hover:text-destructive"
                aria-label="Clear instance log"
                title="Clear instance log"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="bg-input rounded-lg p-4 h-[370px] overflow-y-auto overflow-x-hidden border border-border">
            {consoleLogs.length === 0 ? (
              <p className="text-foreground/40 text-sm">No logs yet</p>
            ) : (
              consoleLogs.map((log, idx) => (
                <p
                  key={idx}
                  className={`font-mono text-[11px] leading-[1.25] mb-1 whitespace-pre-wrap break-words pr-2 ${resolveLogColorClass(log)}`}
                >
                  {log}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex flex-col min-h-[240px]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/70 mb-3">
            Resource Graph
          </p>
          <div className="bg-input rounded-lg p-4 border border-border flex flex-col h-full min-h-[180px]">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-widest text-foreground/70">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#7dd3fc" }} />
                RAM {formatMemory(memoryUsageMb)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.8)" }} />
                CPU {displayCpuLoadPct !== null ? `${displayCpuLoadPct.toFixed(0)}%` : "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f87171" }} />
                GPU {displayGpuLoadPct !== null ? `${displayGpuLoadPct.toFixed(0)}%` : "—"}
              </span>
            </div>
            <div className="relative flex-1 w-full min-h-[120px]">
              {metricHistory.length > 1 ? (
                <>
                  <svg
                    viewBox="0 0 100 40"
                    className="h-full w-full"
                    preserveAspectRatio="none"
                    onMouseMove={handleGraphHover}
                    onMouseLeave={() => setHoverIndex(null)}
                  >
                    <rect x="0" y="0" width="100" height="13.333" fill="rgba(255,255,255,0.025)" />
                    <rect x="0" y="13.333" width="100" height="13.333" fill="rgba(255,255,255,0.015)" />
                    <rect x="0" y="26.666" width="100" height="13.334" fill="rgba(255,255,255,0.025)" />
                    <line
                      x1="0"
                      x2="100"
                      y1="13.333"
                      y2="13.333"
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1="0"
                      x2="100"
                      y1="26.666"
                      y2="26.666"
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {ramPoints ? (
                      <polyline
                        points={ramPoints}
                        fill="none"
                        stroke="#7dd3fc"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {cpuPoints ? (
                      <polyline
                        points={cpuPoints}
                        fill="none"
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {gpuPoints ? (
                      <polyline
                        points={gpuPoints}
                        fill="none"
                        stroke="#f87171"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {hoverSample ? (
                      <line
                        x1={hoverPct}
                        x2={hoverPct}
                        y1="0"
                        y2="40"
                        stroke="rgba(255,255,255,0.75)"
                        strokeWidth="0.65"
                        strokeDasharray="1.6 2.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {hoverSample && hoverRamY !== null ? (
                      <circle
                        cx={hoverPct}
                        cy={hoverRamY}
                        r="1.05"
                        fill="#7dd3fc"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth="0.35"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {hoverSample && hoverCpuY !== null ? (
                      <circle
                        cx={hoverPct}
                        cy={hoverCpuY}
                        r="1.05"
                        fill="rgba(255,255,255,0.86)"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth="0.35"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {hoverSample && hoverGpuY !== null ? (
                      <circle
                        cx={hoverPct}
                        cy={hoverGpuY}
                        r="1.05"
                        fill="#f87171"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth="0.35"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                  </svg>
                  {hoverSample ? (
                    <div
                      className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground/85"
                      style={{
                        left: `clamp(90px, ${hoverPct}%, calc(100% - 90px))`,
                      }}
                    >
                      <span className="mr-2">RAM {formatMemory(hoverSample.rss_mb)}</span>
                      <span className="mr-2">
                        CPU {clampPercent(hoverSample.cpu_load_pct ?? 0).toFixed(1)}%
                      </span>
                      <span>GPU {clampPercent(hoverSample.gpu_load_pct ?? 0).toFixed(1)}%</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="h-full w-full" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
