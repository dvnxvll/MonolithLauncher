"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpCircle, Home, Settings as SettingsIcon, User } from "lucide-react";

interface SidebarProps {
  currentPage: "overview" | "account" | "settings";
  setCurrentPage: (page: "overview" | "account" | "settings") => void;
}

export default function Sidebar({ currentPage, setCurrentPage }: SidebarProps) {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ hasUpdate?: boolean }>;
      setHasUpdate(Boolean(custom.detail?.hasUpdate));
    };
    window.addEventListener("monolith:update-state", listener as EventListener);
    return () => {
      window.removeEventListener("monolith:update-state", listener as EventListener);
    };
  }, []);

  const menuItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "account", label: "Account", icon: User },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ] as const;

  return (
    <aside className="w-64 shrink-0 min-h-0 h-full self-stretch bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
      {/* Header */}
      <div className="h-28 flex flex-col justify-center px-6 border-b border-sidebar-border">
        <h1 className="text-2xl font-bold tracking-tight">MONOLITH</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-2 tracking-widest uppercase">
          Launcher
        </p>
      </div>

      {/* Menu */}
      <nav className="flex-1 min-h-0 overflow-y-hidden p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              data-tip-id={`nav-${item.id}`}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/20"
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/60">
        <div className="flex items-center justify-between">
          <p>v0.2.1</p>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("monolith:update-check"));
            }}
            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
              hasUpdate
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                : "border-emerald-400/35 bg-emerald-500/10 text-emerald-300/80 hover:bg-emerald-500/20"
            }`}
            title="Check updates"
            aria-label="Check updates"
          >
            <ArrowUpCircle size={14} />
            {hasUpdate ? (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
            ) : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
