"use client";

import React from "react";
import { Home, User, Settings as SettingsIcon } from "lucide-react";

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

export default function Sidebar({ currentPage, setCurrentPage }: SidebarProps) {
  const menuItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "account", label: "Account", icon: User },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

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
        <p>v0.1.0</p>
      </div>
    </aside>
  );
}
