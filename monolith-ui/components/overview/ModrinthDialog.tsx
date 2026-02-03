"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Filter,
  Layers,
  Package,
  Palette,
  User,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModrinthProjectHit } from "@/lib/launcher-types";

export type ModrinthKind = "mods" | "resources" | "shaders" | "datapacks";
export type ModrinthSort =
  | "relevance"
  | "downloads"
  | "follows"
  | "newest"
  | "updated";

export interface ModrinthFilters {
  categories: string[];
  loaders: string[];
  showAllVersions: boolean;
  environments: {
    client: boolean;
    server: boolean;
  };
  openSourceOnly: boolean;
  hideInstalled: boolean;
}

export interface ModrinthState {
  query: string;
  results: ModrinthProjectHit[];
  loading: boolean;
  error: string | null;
  sort: ModrinthSort;
  filters: ModrinthFilters;
}

interface ModrinthDialogProps {
  open: boolean;
  kind: ModrinthKind;
  state: ModrinthState;
  instanceVersion: string;
  loaderLabel: string;
  installedProjects: Set<string>;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSortChange: (value: ModrinthSort) => void;
  onToggleHideInstalled: () => void;
  onToggleCategory: (value: string) => void;
  onToggleLoader: (value: string) => void;
  onToggleEnvironment: (side: "client" | "server") => void;
  onToggleOpenSource: () => void;
  onToggleShowAllVersions: () => void;
  onInstall: (project: ModrinthProjectHit) => void;
  onUninstall: (project: ModrinthProjectHit) => void;
  isInstalling: (projectId: string) => boolean;
  isUninstalling: (projectId: string) => boolean;
}

const kindLabels: Record<ModrinthKind, { label: string; icon: any }> = {
  mods: { label: "Mods", icon: Package },
  resources: { label: "Resource Packs", icon: Palette },
  shaders: { label: "Shaders", icon: Wand2 },
  datapacks: { label: "Datapacks", icon: Layers },
};

const sortLabels: Record<ModrinthSort, string> = {
  relevance: "Relevance",
  downloads: "Downloads",
  follows: "Follows",
  newest: "Newest",
  updated: "Updated",
};

const modCategories = [
  "adventure",
  "cursed",
  "decoration",
  "economy",
  "equipment",
  "food",
  "game-mechanics",
  "library",
  "magic",
  "management",
  "minigame",
  "mobs",
  "optimization",
  "social",
  "storage",
  "technology",
  "transportation",
  "utility",
  "worldgen",
];

const loaderOptions = ["fabric", "quilt", "forge", "neoforge"];

const formatLabel = (value: string) =>
  value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatDownloads = (value: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return value.toLocaleString();
  }
};

export default function ModrinthDialog({
  open,
  kind,
  state,
  instanceVersion,
  loaderLabel,
  installedProjects,
  onClose,
  onQueryChange,
  onSearch,
  onSortChange,
  onToggleHideInstalled,
  onToggleCategory,
  onToggleLoader,
  onToggleEnvironment,
  onToggleOpenSource,
  onToggleShowAllVersions,
  onInstall,
  onUninstall,
  isInstalling,
  isUninstalling,
}: ModrinthDialogProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const meta = kindLabels[kind];
  const Icon = meta.icon;
  const errorMessage =
    state.error && state.error.includes("status code 504")
      ? "Modrinth is timing out right now. Try again or reduce filters."
      : state.error;
  const results = useMemo(() => {
    if (!state.filters.hideInstalled) return state.results;
    return state.results.filter(
      (item) => !installedProjects.has(item.project_id),
    );
  }, [installedProjects, state.filters.hideInstalled, state.results]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-foreground/50">
              Modrinth {meta.label}
            </p>
            <h2 className="text-lg font-semibold">
              {state.query.trim()
                ? `Search ${meta.label.toLowerCase()}`
                : `Popular ${meta.label.toLowerCase()}`}
            </h2>
            <p className="text-xs text-foreground/60 mt-1">
              Minecraft {instanceVersion} • {loaderLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-foreground/60 hover:text-foreground"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-4 border-b border-border space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className="gap-2"
            >
              <Filter size={16} />
              Filter options
            </Button>
            <input
              value={state.query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSearch();
                }
              }}
              placeholder={`Search ${meta.label.toLowerCase()}...`}
              className="flex-1 min-w-[220px] bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <Button
              onClick={onSearch}
              className="bg-secondary text-foreground hover:bg-secondary/80"
              disabled={state.loading}
            >
              {state.loading ? "Searching..." : "Search"}
            </Button>
          </div>
          {filtersOpen ? (
            <div className="grid gap-4 text-xs text-foreground/70 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              {kind === "mods" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-secondary/10 p-3">
                    <p className="text-[11px] uppercase tracking-widest text-foreground/50 mb-2">
                      Categories
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                      {modCategories.map((category) => (
                        <label
                          key={category}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={state.filters.categories.includes(category)}
                            onChange={() => onToggleCategory(category)}
                          />
                          {formatLabel(category)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Sort by</span>
                  <Select
                    value={state.sort}
                    onValueChange={(value) =>
                      onSortChange(value as ModrinthSort)
                    }
                  >
                    <SelectTrigger className="bg-input border border-border rounded-md px-2 py-1 text-xs h-8">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      {Object.entries(sortLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {kind === "mods" ? (
                  <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                    <p className="text-[11px] uppercase tracking-widest text-foreground/50">
                      Loaders
                    </p>
                    <div className="space-y-2">
                      {loaderOptions.map((loader) => (
                        <label
                          key={loader}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={state.filters.loaders.includes(loader)}
                            onChange={() => onToggleLoader(loader)}
                          />
                          {formatLabel(loader)}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-widest text-foreground/50">
                    Versions
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.filters.showAllVersions}
                      onChange={onToggleShowAllVersions}
                    />
                    Show all versions
                  </label>
                  <Select
                    value={instanceVersion}
                    disabled={state.filters.showAllVersions}
                  >
                    <SelectTrigger className="w-full bg-input border border-border rounded-md px-2 py-1 text-xs h-8">
                      <SelectValue placeholder={instanceVersion} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      <SelectItem value={instanceVersion}>
                        {instanceVersion}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-widest text-foreground/50">
                    Environments
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.filters.environments.client}
                      onChange={() => onToggleEnvironment("client")}
                    />
                    Client
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.filters.environments.server}
                      onChange={() => onToggleEnvironment("server")}
                    />
                    Server
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.filters.hideInstalled}
                      onChange={onToggleHideInstalled}
                    />
                    Hide installed items
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.filters.openSourceOnly}
                      onChange={onToggleOpenSource}
                    />
                    Open source only
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorMessage ? (
            <div className="text-sm text-destructive">{errorMessage}</div>
          ) : null}
          {!state.loading && results.length === 0 ? (
            <div className="text-sm text-foreground/60">No results found.</div>
          ) : null}
          {results.length > 0 ? (
            <div className="space-y-3">
              {results.map((project) => {
                const installed = installedProjects.has(project.project_id);
                const installing = isInstalling(project.project_id);
                const uninstalling = isUninstalling(project.project_id);
                const busy = installing || uninstalling;
                return (
                  <div
                    key={project.project_id}
                    className="flex gap-3 border border-border/60 rounded-lg p-3 bg-secondary/10"
                  >
                    <div className="h-10 w-10 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-center overflow-hidden">
                      {project.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={project.icon_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon size={16} className="text-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">
                          {project.title}
                          {installed ? (
                            <span className="ml-2 text-[10px] uppercase tracking-widest text-emerald-300">
                              Installed
                            </span>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          className={
                            installed
                              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }
                          onClick={() =>
                            installed ? onUninstall(project) : onInstall(project)
                          }
                          disabled={busy}
                        >
                          {busy
                            ? installed
                              ? "Removing..."
                              : "Installing..."
                            : installed
                              ? "Uninstall"
                              : "Install"}
                        </Button>
                      </div>
                      <p className="text-xs text-foreground/60 mt-1">
                        {project.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-foreground/50 uppercase tracking-widest mt-2">
                        <span className="inline-flex items-center gap-1">
                          <User size={12} aria-hidden />
                          {project.author}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Download size={12} aria-hidden />
                          {formatDownloads(project.downloads)} downloads
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-3 border-t border-border flex items-center justify-between text-xs text-foreground/60">
          <span>{results.length} results</span>
          <span>Powered by Modrinth</span>
        </div>
      </div>
    </div>
  );
}
