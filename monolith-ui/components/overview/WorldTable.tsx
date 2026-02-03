import type { ReactNode } from "react";
import { Check, HardDrive, Map, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorldEntry } from "@/lib/launcher-types";

interface WorldTableProps {
  breadcrumbs: ReactNode;
  worlds: WorldEntry[];
  editingWorldId: string | null;
  worldDraft: { name: string; icon: string | null };
  onEdit: (world: WorldEntry) => void;
  onCancel: () => void;
  onSave: (worldId: string) => void;
  onDraftChange: (patch: { name?: string; icon?: string | null }) => void;
  onIconSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  resolveImageData: (icon?: string | null) => string | null;
  query: string;
  onQueryChange: (value: string) => void;
}

const formatBytes = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 10 || unit === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unit]}`;
};

export default function WorldTable({
  breadcrumbs,
  worlds,
  editingWorldId,
  worldDraft,
  onEdit,
  onCancel,
  onSave,
  onDraftChange,
  onIconSelect,
  resolveImageData,
  query,
  onQueryChange,
}: WorldTableProps) {
  const filteredWorlds = query.trim()
    ? worlds.filter((world) => {
        const term = query.trim().toLowerCase();
        return (
          world.name.toLowerCase().includes(term) ||
          world.id.toLowerCase().includes(term)
        );
      })
    : worlds;

  const displayWorlds = editingWorldId ? worlds : filteredWorlds;
  const emptyMessage = query.trim() ? "No matches." : "No worlds";

  return (
    <div className="space-y-4">
      {breadcrumbs}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search worlds..."
          className="flex-1 min-w-[220px] bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="text-left p-4 font-semibold text-sm">World</th>
              <th className="text-right p-4 font-semibold text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayWorlds.length === 0 ? (
              <tr>
                <td colSpan={2} className="p-4 text-center text-foreground/60">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayWorlds.map((world) =>
                editingWorldId === world.id ? (
                  <tr
                    key={`${world.id}-edit`}
                    className="border-b border-border"
                  >
                    <td className="p-4">
                      <div className="space-y-3">
                        <input
                          value={worldDraft.name}
                          onChange={(event) =>
                            onDraftChange({ name: event.target.value })
                          }
                          className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
                          placeholder="World name"
                          autoFocus
                        />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-center overflow-hidden">
                            {resolveImageData(worldDraft.icon) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resolveImageData(worldDraft.icon) ?? ""}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Map size={16} className="text-foreground/50" />
                            )}
                          </div>
                          <Button
                            asChild
                            size="sm"
                            className="bg-secondary text-foreground hover:bg-secondary/80"
                          >
                            <label className="cursor-pointer h-9 inline-flex items-center">
                              Upload Icon
                              <input
                                type="file"
                                accept="image/png"
                                className="hidden"
                                onChange={onIconSelect}
                              />
                            </label>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDraftChange({ icon: null })}
                          >
                            Clear
                          </Button>
                        </div>
                        <p className="text-xs text-foreground/50">
                          Folder: {world.id}
                        </p>
                        <div className="text-xs text-foreground/60 flex flex-wrap items-center gap-3">
                          <span>Mode: {world.game_mode ?? "Unknown"}</span>
                          <span className="inline-flex items-center gap-1">
                            <HardDrive size={12} aria-hidden />
                            {formatBytes(world.size_bytes)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-secondary text-foreground hover:bg-secondary/80 gap-1"
                          onClick={onCancel}
                        >
                          <X size={14} />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                          onClick={() => onSave(world.id)}
                        >
                          <Check size={14} />
                          Save
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={world.id}
                    className="border-b border-border hover:bg-secondary/10"
                  >
                    <td className="p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-center overflow-hidden">
                          {resolveImageData(world.icon) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveImageData(world.icon) ?? ""}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Map size={16} className="text-foreground/50" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{world.name}</div>
                          <div className="text-xs text-foreground/50">
                            Folder: {world.id}
                          </div>
                          <div className="text-xs text-foreground/60 flex flex-wrap items-center gap-3 mt-1">
                            <span>Mode: {world.game_mode ?? "Unknown"}</span>
                            <span className="inline-flex items-center gap-1">
                              <HardDrive size={12} aria-hidden />
                              {formatBytes(world.size_bytes)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-secondary text-foreground hover:bg-secondary/80"
                          onClick={() => onEdit(world)}
                          disabled={editingWorldId !== null}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
