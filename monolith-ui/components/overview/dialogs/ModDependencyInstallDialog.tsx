"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModrinthDependencyPlanItem, ModrinthProjectHit } from "@/lib/launcher-types";
import type { ModrinthKind } from "@/components/overview/ModrinthDialog";

interface ModDependencyInstallDialogProps {
  open: boolean;
  project: ModrinthProjectHit | null;
  kind: ModrinthKind;
  dependencies: ModrinthDependencyPlanItem[];
  onClose: () => void;
  onInstallOnly: () => void;
  onInstallWithDependencies: () => void;
}

export default function ModDependencyInstallDialog({
  open,
  project,
  dependencies,
  onClose,
  onInstallOnly,
  onInstallWithDependencies,
}: ModDependencyInstallDialogProps) {
  if (!open || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                Mod Dependencies
              </p>
              <h2 className="mt-1 text-xl font-bold text-foreground">
                Install {project.title}
              </h2>
              <p className="mt-2 text-sm text-foreground/65">
                This mod has required dependencies that are not currently managed in this instance.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-foreground/60 hover:bg-secondary/50 hover:text-foreground"
            >
              <X size={16} />
            </Button>
          </div>
        </div>
        <div className="space-y-5 px-5 py-5 md:px-6 md:py-6">
          <div className="rounded-xl border border-border bg-secondary/15 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-foreground/45">
              Missing Dependencies
            </p>
            <div className="mt-3 space-y-2">
              {dependencies.map((dependency) => (
                <div
                  key={dependency.project_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/40 px-3 py-2"
                >
                  <span className="text-sm text-foreground/80">{dependency.title}</span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-foreground/45">
                    {dependency.project_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-border bg-transparent text-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={onInstallOnly}
              className="border-border bg-transparent text-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              Install Mod Only
            </Button>
            <Button
              onClick={onInstallWithDependencies}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Install With Dependencies
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
