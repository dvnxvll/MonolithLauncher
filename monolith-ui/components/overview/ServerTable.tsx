import type { ReactNode } from "react";
import { Check, Globe, Plus, X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerEntry } from "@/lib/launcher-types";

interface ServerTableProps {
  breadcrumbs: ReactNode;
  servers: ServerEntry[];
  editingIndex: number | null;
  serverDraft: ServerEntry;
  saving: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: (index: number) => void;
  onIconSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDraftChange: (patch: Partial<ServerEntry>) => void;
  onOpen: () => void;
  resolveImageData: (icon?: string | null) => string | null;
  query: string;
  onQueryChange: (value: string) => void;
}

export default function ServerTable({
  breadcrumbs,
  servers,
  editingIndex,
  serverDraft,
  saving,
  onAdd,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onIconSelect,
  onDraftChange,
  onOpen,
  resolveImageData,
  query,
  onQueryChange,
}: ServerTableProps) {
  const filteredServers = query.trim()
    ? servers.filter((server) => {
        const term = query.trim().toLowerCase();
        return (
          server.name.toLowerCase().includes(term) ||
          server.ip.toLowerCase().includes(term)
        );
      })
    : servers;

  const displayServers = editingIndex !== null ? servers : filteredServers;
  const emptyMessage = query.trim() ? "No matches." : "No servers";

  return (
    <div className="space-y-4">
      {breadcrumbs}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="bg-secondary text-foreground hover:bg-secondary/80 gap-2"
          onClick={onAdd}
          disabled={editingIndex !== null || saving}
        >
          <Plus size={18} />
          Add Server
        </Button>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search servers..."
          className="flex-1 min-w-[220px] bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 ml-auto"
          onClick={onOpen}
        >
          <FolderOpen size={18} />
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="text-left p-4 font-semibold text-sm">Name</th>
              <th className="text-left p-4 font-semibold text-sm">Address</th>
              <th className="text-right p-4 font-semibold text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayServers.length === 0 && editingIndex === null ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-foreground/60">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayServers.map((server, index) =>
                editingIndex === index ? (
                  <tr
                    key={`${server.name}-${server.ip}-edit`}
                    className="border-b border-border"
                  >
                    <td className="p-4 align-top">
                      <div className="space-y-3">
                        <input
                          value={serverDraft.name}
                          onChange={(event) =>
                            onDraftChange({ name: event.target.value })
                          }
                          className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
                          placeholder="Server name"
                          autoFocus
                        />
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-center overflow-hidden">
                            {resolveImageData(serverDraft.icon) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resolveImageData(serverDraft.icon) ?? ""}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Globe size={16} className="text-foreground/50" />
                            )}
                          </div>
                          <Button
                            asChild
                            size="sm"
                            className="bg-secondary text-foreground hover:bg-secondary/80"
                            disabled={saving}
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
                            disabled={saving}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <input
                        value={serverDraft.ip}
                        onChange={(event) =>
                          onDraftChange({ ip: event.target.value })
                        }
                        className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono"
                        placeholder="play.example.com"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-secondary text-foreground hover:bg-secondary/80 gap-1"
                          onClick={onCancel}
                          disabled={saving}
                        >
                          <X size={14} />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                          onClick={onSave}
                          disabled={saving}
                        >
                          <Check size={14} />
                          Save
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`${server.name}-${server.ip}`}
                    className="border-b border-border hover:bg-secondary/10"
                  >
                    <td className="p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-center overflow-hidden">
                          {resolveImageData(server.icon) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveImageData(server.icon) ?? ""}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Globe size={16} className="text-foreground/50" />
                          )}
                        </div>
                        <span>{server.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-mono text-foreground/70">
                      {server.ip}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-secondary text-foreground hover:bg-secondary/80"
                          onClick={() => onEdit(index)}
                          disabled={saving || editingIndex !== null}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDelete(index)}
                          disabled={saving || editingIndex !== null}
                        >
                          Delete
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
