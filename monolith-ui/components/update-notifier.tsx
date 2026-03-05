"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { invoke } from "@/lib/tauri";
import { useLauncher } from "@/components/launcher-provider";

type ReleaseCheckResult = {
  current_version: string;
  has_update: boolean;
  latest_tag?: string | null;
  latest_name?: string | null;
  latest_url?: string | null;
  published_at?: string | null;
};

export default function UpdateNotifier() {
  const { ready, config, saveConfig, setStatus } = useLauncher();
  const [release, setRelease] = useState<ReleaseCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [manualReveal, setManualReveal] = useState(false);
  const [skipThisVersion, setSkipThisVersion] = useState(false);
  const [savingSkip, setSavingSkip] = useState(false);
  const checkedOnceRef = useRef(false);

  const runUpdateCheck = async (manual: boolean) => {
    try {
      const result = await invoke<ReleaseCheckResult>("check_latest_release");
      setRelease(result);
      const detail = {
        hasUpdate: Boolean(result.has_update && result.latest_tag && result.latest_url),
        latestTag: result.latest_tag ?? null,
      };
      window.dispatchEvent(new CustomEvent("monolith:update-state", { detail }));
      if (manual) {
        if (detail.hasUpdate) {
          setDismissed(false);
          setManualReveal(true);
        } else {
          setStatus("No new stable release available.");
        }
      }
    } catch {
      window.dispatchEvent(
        new CustomEvent("monolith:update-state", {
          detail: {
            hasUpdate: false,
            latestTag: null,
          },
        }),
      );
      if (manual) {
        setStatus("Update check failed.", "error");
      }
    }
  };

  useEffect(() => {
    if (!ready || !config || checkedOnceRef.current) {
      return;
    }
    checkedOnceRef.current = true;
    void runUpdateCheck(false);
  }, [config, ready]);

  useEffect(() => {
    const onManualCheck = () => {
      void runUpdateCheck(true);
    };
    window.addEventListener(
      "monolith:update-check",
      onManualCheck as EventListener,
    );
    return () => {
      window.removeEventListener(
        "monolith:update-check",
        onManualCheck as EventListener,
      );
    };
  }, []);

  const latestTag = release?.latest_tag ?? null;
  const skippedTag = config?.settings?.skipped_release_tag ?? null;

  useEffect(() => {
    if (!latestTag) {
      setSkipThisVersion(false);
      return;
    }
    setSkipThisVersion(skippedTag === latestTag);
  }, [latestTag, skippedTag]);

  const hiddenBySkip = !manualReveal && latestTag === skippedTag;
  const hasVisibleUpdate = Boolean(
    !dismissed &&
      release?.has_update &&
      latestTag &&
      !hiddenBySkip &&
      release.latest_url,
  );

  if (!hasVisibleUpdate || !config || !release || !latestTag || !release.latest_url) {
    return null;
  }

  const persistSkipChoice = async (checked: boolean) => {
    const currentSkipped = config.settings.skipped_release_tag ?? null;
    const nextSkipped =
      checked
        ? latestTag
        : currentSkipped === latestTag
          ? null
          : currentSkipped;

    if (currentSkipped === nextSkipped) {
      return;
    }

    setSavingSkip(true);
    try {
      await saveConfig({
        ...config,
        settings: {
          ...config.settings,
          skipped_release_tag: nextSkipped,
        },
      });
    } finally {
      setSavingSkip(false);
    }
  };

  const handleDismiss = async () => {
    if (!savingSkip) {
      await persistSkipChoice(skipThisVersion);
    }
    setDismissed(true);
    setManualReveal(false);
  };

  return (
    <div className="pointer-events-none fixed right-6 top-14 z-40">
      <div className="pointer-events-auto w-[min(460px,calc(100vw-3rem))] rounded-lg border border-border bg-card/95 px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground/80">
            New Stable Version
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/80 text-foreground/60 outline outline-1 outline-border/50 transition hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 hover:outline-red-500/40"
            aria-label="Dismiss update notification"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-sm text-foreground/85">
          {release.latest_name?.trim() || latestTag} is available
          {release.current_version ? ` (current ${release.current_version})` : ""}.
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
            <Switch
              checked={skipThisVersion}
              disabled={savingSkip}
              onCheckedChange={(checked) => {
                setSkipThisVersion(checked);
              }}
              aria-label="Never show this version again"
            />
            <span className="text-xs text-foreground/75">
              Never show this version again
            </span>
          </div>
          <Button
            size="sm"
            className="h-8 border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            onClick={async () => {
              await invoke("open_external", { url: release.latest_url });
            }}
          >
            <ExternalLink size={14} />
            View
          </Button>
        </div>
      </div>
    </div>
  );
}
