"use client";

import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContentDeleteDialogProps {
  open: boolean;
  label: string;
  filename: string;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ContentDeleteDialog({
  open,
  label,
  filename,
  deleting,
  onClose,
  onConfirm,
}: ContentDeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-border bg-secondary/30 p-2.5 text-foreground/70">
                <Trash2 size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  Delete Content
                </p>
                <h2 className="mt-1 text-xl font-bold text-foreground">
                  Remove {label}
                </h2>
                <p className="mt-2 text-sm text-foreground/65">
                  This removes the selected file from the instance. This action cannot be undone.
                </p>
              </div>
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
              File
            </p>
            <p className="mt-2 break-all font-mono text-sm text-foreground/75">
              {filename}
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-border bg-transparent text-foreground hover:bg-secondary/50 hover:text-foreground"
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting}
            >
              <Trash2 size={16} />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
