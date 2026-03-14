"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Clock3,
  KeyRound,
  Play,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AddAccountDialog from "./dialogs/add-account-dialog";
import { useLauncher } from "./launcher-provider";
import { invoke } from "@/lib/tauri";
import { slugify } from "@/lib/launcher-utils";
import type { Account } from "@/lib/launcher-types";

const formatTimestamp = (value?: string | null) => {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function Account() {
  const { config, saveConfig, setStatus } = useLauncher();
  const accounts = config?.accounts ?? [];
  const activeAccountId = config?.active_account_id ?? null;
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId(null);
      return;
    }
    if (!selectedAccountId || !accounts.some((acc) => acc.id === selectedAccountId)) {
      const fallback = accounts.find((acc) => acc.id === activeAccountId) || accounts[0];
      setSelectedAccountId(fallback?.id ?? null);
    }
  }, [accounts, activeAccountId, selectedAccountId]);

  const selectedAccount = useMemo<Account | null>(() => {
    if (!selectedAccountId) return null;
    return accounts.find((acc) => acc.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  const handleSetActive = async (id: string) => {
    if (!config) return;
    const next = { ...config, active_account_id: id };
    await saveConfig(next);
    setStatus("Active account updated.");
  };

  const handleRemoveAccount = async (id: string) => {
    if (!config) return;
    const remaining = (config.accounts || []).filter((acc) => acc.id !== id);
    const nextActive =
      config.active_account_id === id ? (remaining[0]?.id ?? null) : config.active_account_id;
    const next = {
      ...config,
      accounts: remaining,
      active_account_id: nextActive,
    };
    await saveConfig(next);
    setStatus("Account removed.");
  };

  const openDeleteModal = (account: Account) => {
    setDeleteTarget(account);
    setDeleteConfirmName("");
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteConfirmName("");
    setDeleteTarget(null);
  };

  const handleAddOffline = async (accountName: string) => {
    if (!config) return;
    const trimmed = accountName.trim();
    if (!trimmed) {
      setStatus("Enter a display name.", "error");
      return;
    }
    const hasMicrosoft = config.accounts.some((account) => account.kind === "microsoft");
    if (!hasMicrosoft) {
      setStatus("Add a Microsoft account before creating offline profiles.", "error");
      return;
    }
    const base = slugify(trimmed);
    let candidate = `offline-${base}`;
    let counter = 2;
    const existing = new Set(config.accounts.map((acc) => acc.id));
    while (existing.has(candidate)) {
      candidate = `offline-${base}-${counter}`;
      counter += 1;
    }
    const offlineAccount: Account = {
      id: candidate,
      display_name: trimmed,
      kind: "offline",
      last_used: null,
    };
    const next = {
      ...config,
      accounts: [...config.accounts, offlineAccount],
      active_account_id: config.active_account_id ?? null,
    };
    await saveConfig(next);
    setStatus("Offline account added.");
  };

  const handleMicrosoftLogin = async () => {
    if (!config) return;
    const clientId = config.settings?.microsoft_client_id?.trim?.() || "";
    if (!clientId) {
      setStatus("Microsoft login requires a client ID.", "error");
      return;
    }
    try {
      const authorizeUrl = await invoke<string>("start_microsoft_login", { clientId });
      await invoke("open_external", { url: authorizeUrl });
      setStatus("Opening Microsoft sign-in in your browser.");
    } catch (err: any) {
      const message = err?.toString?.() || "Unable to open browser for sign-in.";
      setStatus(message, "error");
    }
  };

  const hasMicrosoftAccount = accounts.some((account) => account.kind === "microsoft");

  const MicrosoftIcon = ({
    size = 16,
    className = "",
  }: {
    size?: number;
    className?: string;
  }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );

  const renderOwnershipBadge = (account: Account, variant: "badge" | "chip" = "badge") => {
    if (account.kind !== "microsoft") return null;
    let label = "CHECK PENDING";
    let className = "border border-border/60 bg-muted/40 text-muted-foreground";
    if (account.owns_minecraft === true) {
      label = "OWNED";
      className = "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
    } else if (account.owns_minecraft === false) {
      label = "NO LICENSE";
      className = "border border-destructive/30 bg-destructive/15 text-destructive";
    }

    const sizeClass =
      variant === "chip"
        ? "min-h-6 rounded-lg px-3 py-2 text-xs font-medium leading-none"
        : "rounded px-2 py-1 text-[12px] font-bold leading-none";

    return (
      <span className={`inline-flex items-center uppercase ${sizeClass} ${className}`}>
        {label}
      </span>
    );
  };

  const accountStateLabel = (account: Account) => {
    if (account.kind === "offline") return "Offline profile";
    if (account.owns_minecraft === true) return "Licensed profile";
    if (account.owns_minecraft === false) return "Unlicensed profile";
    return "Microsoft profile";
  };

  const profileStats = selectedAccount
    ? [
        {
          label: "Account Type",
          value: selectedAccount.kind === "microsoft" ? "Microsoft" : "Offline",
          icon: BadgeCheck,
        },
        {
          label: "Last Used",
          value: formatTimestamp(selectedAccount.last_used),
          icon: Clock3,
        },
        {
          label: "Profile ID",
          value: selectedAccount.uuid || "Unavailable",
          icon: KeyRound,
        },
      ]
    : [];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-background px-4 py-4 md:px-6 xl:px-8">
        <div className="flex min-h-[79px] flex-col justify-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold md:text-4xl">Accounts</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Manage Minecraft identities, active profile selection, and account health.
            </p>
          </div>
          <Button
            onClick={() => setShowDialog(true)}
            data-tip-id="account-add-account"
            className="h-11 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Add Account
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
        <div className="w-full border-b border-border bg-card/30 xl:w-80 xl:border-b-0 xl:border-r">
          {accounts.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center p-8">
              <p className="mb-6 text-center text-foreground/60">
                No accounts yet. Add one to get started.
              </p>
              <Button
                onClick={() => setShowDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Add Account
              </Button>
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto p-3 sm:p-4 xl:max-h-none xl:min-h-0">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      selectedAccountId === account.id
                        ? "border-accent bg-accent/18"
                        : "border-border bg-card/50 hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/40">
                        {account.kind === "microsoft" ? (
                          <MicrosoftIcon size={18} className="text-accent" />
                        ) : (
                          <UserIcon size={18} className="text-foreground/70" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-bold">{account.display_name}</h3>
                          {account.id === activeAccountId ? (
                            <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                              Active
                            </span>
                          ) : null}
                          {renderOwnershipBadge(account, "badge")}
                        </div>
                        <p className="mt-1 text-xs text-foreground/60">
                          {accountStateLabel(account)}
                        </p>
                        <p className="mt-2 text-[11px] text-foreground/45">
                          {formatTimestamp(account.last_used)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedAccount ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-secondary/30">
                      {selectedAccount.kind === "microsoft" ? (
                        <MicrosoftIcon size={40} className="text-accent" />
                      ) : (
                        <UserIcon size={40} className="text-foreground/70" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-3xl font-bold md:text-4xl">
                          {selectedAccount.display_name}
                        </h1>
                        {selectedAccount.id === activeAccountId ? (
                          <span className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent">
                            Selected Profile
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 max-w-2xl text-sm text-foreground/60">
                        {accountStateLabel(selectedAccount)}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {renderOwnershipBadge(selectedAccount, "chip")}
                        <div className="inline-flex items-center rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs leading-none text-foreground/70">
                          {selectedAccount.kind === "microsoft" ? "Microsoft identity" : "Offline identity"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                    Actions
                  </p>
                  <div className="mt-4 space-y-3">
                    <Button
                      onClick={() => handleSetActive(selectedAccount.id)}
                      disabled={selectedAccount.id === activeAccountId}
                      className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Play size={16} />
                      {selectedAccount.id === activeAccountId ? "Currently Active" : "Set Active"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openDeleteModal(selectedAccount)}
                      className="w-full border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={16} />
                      Remove Account
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {profileStats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                        <Icon size={14} />
                        {item.label}
                      </div>
                      <p className="mt-4 break-all font-mono text-sm text-foreground/80">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-foreground/45">
                  <ShieldCheck size={14} />
                  User Profile
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-foreground/45">
                      Display Name
                    </p>
                    <p className="mt-3 text-lg font-semibold text-foreground">
                      {selectedAccount.display_name}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-foreground/45">
                      Entitlement State
                    </p>
                    <p className="mt-3 text-lg font-semibold text-foreground">
                      {selectedAccount.owns_minecraft === true
                        ? "Owned"
                        : selectedAccount.owns_minecraft === false
                          ? "No license"
                          : "Pending"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.22em] text-foreground/45">
                      Internal Account ID
                    </p>
                    <p className="mt-3 break-all font-mono text-sm text-foreground/70">
                      {selectedAccount.id}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-foreground/40">Select an account to view details.</p>
          </div>
        )}
      </div>

      <AddAccountDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onAddOffline={handleAddOffline}
        onAddMicrosoft={handleMicrosoftLogin}
        canAddOffline={hasMicrosoftAccount}
      />

      {showDeleteModal && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-6">
              <h2 className="text-xl font-bold">Confirm Delete</h2>
              <button onClick={closeDeleteModal} className="rounded p-1 transition-colors hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-foreground/70">
                Type <span className="font-semibold">{deleteTarget.display_name}</span> to confirm deletion.
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                placeholder={deleteTarget.display_name}
                className="w-full rounded-lg border border-border bg-input px-4 py-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>
            <div className="flex gap-3 border-t border-border p-6">
              <Button variant="outline" onClick={closeDeleteModal} className="flex-1 bg-transparent">
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await handleRemoveAccount(deleteTarget.id);
                  closeDeleteModal();
                }}
                disabled={deleteConfirmName.trim() !== deleteTarget.display_name}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
