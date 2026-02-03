"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddJavaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddJava: (payload: {
    label: string;
    path: string;
    version?: string | null;
    setDefault: boolean;
  }) => void;
}

export default function AddJavaDialog({
  open,
  onOpenChange,
  onAddJava,
}: AddJavaDialogProps) {
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [version, setVersion] = useState("");
  const [setDefault, setSetDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setPath("");
    setVersion("");
    setSetDefault(false);
  }, [open]);

  if (!open) return null;

  const handleAdd = () => {
    if (!label.trim() || !path.trim()) {
      window.alert("Please provide a label and path.");
      return;
    }
    onAddJava({
      label: label.trim(),
      path: path.trim(),
      version: version.trim() ? version.trim() : null,
      setDefault,
    });
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Add Java Runtime</h2>
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
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Temurin 17"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Path</label>
            <input
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/usr/lib/jvm/java-17/bin/java"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Version (optional)
            </label>
            <input
              type="text"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="17"
              className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <label className="flex items-center gap-3 text-sm text-foreground/70">
            <input
              type="checkbox"
              checked={setDefault}
              onChange={(event) => setSetDefault(event.target.checked)}
              className="h-4 w-4"
            />
            Set as default Java runtime
          </label>
        </div>

        <div className="flex gap-3 p-6 border-t border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Add Runtime
          </Button>
        </div>
      </div>
    </div>
  );
}
