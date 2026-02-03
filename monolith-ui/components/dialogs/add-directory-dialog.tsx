"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDirectory: (payload: {
    label: string;
    path: string;
    setDefault: boolean;
  }) => void;
}

export default function AddDirectoryDialog({
  open,
  onOpenChange,
  onAddDirectory,
}: AddDirectoryDialogProps) {
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setPath("");
  }, [open]);

  if (!open) return null;

  const handleAdd = (setDefault: boolean) => {
    if (!label.trim() || !path.trim()) {
      window.alert("Please provide a label and path.");
      return;
    }
    onAddDirectory({
      label,
      path,
      setDefault,
    });
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Add Directory</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Primary"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Path</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/home/user/.monolith/instances"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          <div className="bg-secondary/20 rounded-lg p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/70 mb-2">
              Choose Directory Type
            </p>
            <p className="text-sm text-foreground/70">
              Primary directories become the default instance root. Secondary
              directories are additional roots.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => handleAdd(true)}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base"
            >
              Primary Directory
            </Button>
            <Button
              onClick={() => handleAdd(false)}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-12 text-base"
            >
              Secondary Directory
            </Button>
          </div>
        </div>

        <div className="p-6 border-t border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full bg-transparent"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
