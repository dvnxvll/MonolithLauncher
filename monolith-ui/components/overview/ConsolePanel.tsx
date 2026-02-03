import type { ReactNode } from "react";
import { Copy, Play, SkipBack, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  memoryUsage: number | null;
  memoryHistory: number[];
  minRamMb: number;
  maxRamMb: number;
}

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
  memoryUsage,
  memoryHistory,
  minRamMb,
  maxRamMb,
}: ConsolePanelProps) {
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
        <Button
          onClick={onCopyLogs}
          className="bg-secondary text-foreground hover:bg-secondary/80 gap-2 ml-auto"
        >
          <Copy size={18} />
          Copy
        </Button>
        <Button
          onClick={onClearLogs}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
        >
          <Trash2 size={18} />
          Clear
        </Button>
      </div>
      {!hasAccounts && (
        <p className="text-xs text-foreground/50">
          Add a Microsoft account to enable Start.
        </p>
      )}

      <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-4 flex flex-col h-full">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/70 mb-3">
            Instance Log
          </p>
          <div className="bg-input rounded-lg p-4 max-h-[360px] min-h-[160px] overflow-y-auto overflow-x-auto border border-border flex-1">
            {consoleLogs.length === 0 ? (
              <p className="text-foreground/40 text-sm">No logs yet</p>
            ) : (
              consoleLogs.map((log, idx) => (
                <p
                  key={idx}
                  className="text-sm font-mono text-foreground/70 mb-1 whitespace-pre"
                >
                  {log}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full w-full xl:col-span-1 xl:justify-self-start">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/70 mb-3">
            Memory Graph
          </p>
          <div className="bg-input rounded-lg p-4 border border-border flex flex-col max-h-[360px] min-h-[160px]">
            <div className="flex items-center justify-between text-xs text-foreground/60 mb-2">
              <span>RAM (MB)</span>
              <span>
                {memoryUsage ? `${(memoryUsage / 1024).toFixed(1)} GB` : "—"}
              </span>
            </div>
            <div className="flex-1 w-full min-h-[120px]">
              {memoryHistory.length > 1 ? (
                <svg
                  viewBox="0 0 100 40"
                  className="h-full w-full"
                  preserveAspectRatio="none"
                >
                  {(() => {
                    const maxRamLine = Math.max(maxRamMb, 0);
                    const minRamLine = Math.max(minRamMb, 0);
                    const maxValue = Math.max(
                      ...memoryHistory,
                      maxRamLine || 0,
                      minRamLine || 0,
                      1,
                    );
                    const toY = (value: number) =>
                      40 - Math.min(40, Math.max(0, (value / maxValue) * 40));
                    const points = memoryHistory
                      .map((value, idx) => {
                        const x = (idx / (memoryHistory.length - 1)) * 100;
                        const y = toY(value);
                        return `${x.toFixed(2)},${y.toFixed(2)}`;
                      })
                      .join(" ");
                    const maxLineY = toY(maxRamLine);
                    const minLineY = toY(minRamLine);
                    return (
                      <>
                        <line
                          x1="0"
                          x2="100"
                          y1={maxLineY}
                          y2={maxLineY}
                          stroke="rgba(255,255,255,0.2)"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="0"
                          x2="100"
                          y1={minLineY}
                          y2={minLineY}
                          stroke="rgba(255,255,255,0.12)"
                          strokeDasharray="2 6"
                        />
                        <polyline
                          points={points}
                          fill="none"
                          stroke="rgba(255,255,255,0.75)"
                          strokeWidth="1.5"
                        />
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="h-full w-full" aria-hidden="true" />
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-foreground/50 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-foreground/70" /> Usage
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-foreground/30" /> Max
                RAM
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-foreground/20" /> Min
                RAM
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
