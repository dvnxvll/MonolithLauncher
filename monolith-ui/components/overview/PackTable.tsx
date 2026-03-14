import type { ReactNode } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { ModEntry, PackEntry } from "@/lib/launcher-types";

interface PackTableProps {
  breadcrumbs: ReactNode;
  items: Array<ModEntry | PackEntry>;
  onToggle: (entry: ModEntry | PackEntry) => void;
  onDelete: (entry: ModEntry | PackEntry) => void;
  onOpen: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  modrinthPanel?: ReactNode;
  emptyLabel?: string;
  showVersion?: boolean;
  versionLabel?: string;
}

export default function PackTable({
  breadcrumbs,
  items,
  onToggle,
  onDelete,
  onOpen,
  query,
  onQueryChange,
  modrinthPanel,
  emptyLabel = "No items",
  showVersion = true,
  versionLabel = "Version",
}: PackTableProps) {
  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const name = item.name.toLowerCase();
      const filename = "filename" in item ? item.filename.toLowerCase() : "";
      const version = item.version?.toLowerCase() ?? "";
      return (
        name.includes(term) || filename.includes(term) || version.includes(term)
      );
    });
  }, [items, query]);

  const emptyMessage = query.trim() ? "No matches." : emptyLabel;

  return (
    <div className="space-y-4">
      {breadcrumbs}
      {modrinthPanel}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search items..."
          className="flex-1 min-w-[220px] bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
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
              {showVersion ? (
                <th className="text-left p-4 font-semibold text-sm">
                  {versionLabel}
                </th>
              ) : null}
              <th className="text-left p-4 font-semibold text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={showVersion ? 3 : 2}
                  className="p-4 text-center text-foreground/60"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredItems.map((item: any) => (
                <tr
                  key={item.filename || item.name}
                  className="border-b border-border hover:bg-secondary/10"
                >
                  <td className="p-4 text-sm">{item.name}</td>
                  {showVersion ? (
                    <td className="p-4 text-sm font-mono text-foreground/70">
                      {item.version || "—"}
                    </td>
                  ) : null}
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggle(item)}
                        className={`relative h-6 w-10 rounded-lg border transition-all ${
                          item.enabled
                            ? "border-emerald-500/35 bg-emerald-500/18 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]"
                            : "border-red-500/28 bg-red-500/14 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.06)]"
                        }`}
                        aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.name}`}
                      >
                        <div
                          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-md border border-border/70 bg-foreground/95 shadow-sm transition-transform ${
                            item.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
