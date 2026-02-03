"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLauncher } from "@/components/launcher-provider";

const formatProgress = (
  message: string,
  current: number,
  total: number | null,
) => {
  if (!total || total <= 0) {
    return message || "Working...";
  }
  return `${message} (${current}/${total})`;
};

export default function InstallOverlay() {
  const { installing, installProgress, installDetails } = useLauncher();
  const [minimized, setMinimized] = useState(false);
  const active = installing || !!installProgress;

  useEffect(() => {
    if (!active) {
      setMinimized(false);
    }
  }, [active]);

  if (!active) {
    return null;
  }

  const message = installProgress?.message || "Preparing launch";
  const current = installProgress?.current ?? 0;
  const total = installProgress?.total ?? null;
  const percent =
    total && total > 0
      ? Math.min(100, Math.round((current / total) * 100))
      : null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed right-6 top-24 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-5 py-2.5 text-sm font-semibold text-foreground shadow-md backdrop-blur hover:bg-card"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_rgba(255,255,255,0.35)]" />
        {percent === null ? "Downloading…" : `Downloading ${percent}%`}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card/90 p-6 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-lg font-semibold">Preparing instance</h3>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-md border border-border bg-background/60 p-1 text-foreground/70 hover:text-foreground"
            aria-label="Hide download status"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-foreground/70 mb-4">
          {formatProgress(message, current, total)}
        </p>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
          {percent === null ? (
            <div className="progress-indeterminate h-full w-1/3 bg-primary" />
          ) : (
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs uppercase tracking-widest text-foreground/60">
            Details
          </summary>
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-background/40 p-3 text-xs font-mono text-foreground/70">
            {installDetails.length === 0 ? (
              <p className="text-foreground/50">
                Waiting for download details…
              </p>
            ) : (
              installDetails
                .slice(-40)
                .reverse()
                .map((line, index) => (
                  <p key={`${line}-${index}`} className="mb-1">
                    {line}
                  </p>
                ))
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
