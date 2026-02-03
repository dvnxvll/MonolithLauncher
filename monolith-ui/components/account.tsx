"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Trash2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddAccountDialog from "./dialogs/add-account-dialog";
import { useLauncher } from "./launcher-provider";
import { invoke } from "@/lib/tauri";
import { slugify } from "@/lib/launcher-utils";
import type { Account } from "@/lib/launcher-types";

export default function Account() {
  const { config, saveConfig, setStatus } = useLauncher();
  const accounts = config?.accounts ?? [];
  const activeAccountId = config?.active_account_id ?? null;
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId(null);
      return;
    }
    if (
      !selectedAccountId ||
      !accounts.some((acc) => acc.id === selectedAccountId)
    ) {
      const fallback =
        accounts.find((acc) => acc.id === activeAccountId) || accounts[0];
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
      config.active_account_id === id
        ? (remaining[0]?.id ?? null)
        : config.active_account_id;
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
    const hasMicrosoft = config.accounts.some(
      (account) => account.kind === "microsoft",
    );
    if (!hasMicrosoft) {
      setStatus(
        "Add a Microsoft account before creating offline profiles.",
        "error",
      );
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
      const authorizeUrl = await invoke<string>("start_microsoft_login", {
        clientId,
      });
      await invoke("open_external", { url: authorizeUrl });
      setStatus("Opening Microsoft sign-in in your browser.");
    } catch (err: any) {
      const message =
        err?.toString?.() || "Unable to open browser for sign-in.";
      setStatus(message, "error");
    }
  };

  const hasMicrosoftAccount = accounts.some(
    (account) => account.kind === "microsoft",
  );

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

  const renderOwnershipBadge = (account: Account) => {
    if (account.kind !== "microsoft") return null;
    let label = "UNKNOWN";
    let className = "bg-muted/40 text-muted-foreground border border-border/60";
    if (account.owns_minecraft === true) {
      label = "OWNED";
      className =
        "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    } else if (account.owns_minecraft === false) {
      label = "NO LICENSE";
      className =
        "bg-destructive/15 text-destructive border border-destructive/30";
    }
    return (
      <span
        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${className}`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="sticky top-0 z-20 h-28 flex items-center border-b border-border px-8 bg-background">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-4xl font-bold">Accounts</h2>
            <p className="text-foreground/60 text-sm mt-1">
              Manage your Minecraft profiles
            </p>
          </div>
          <Button
            onClick={() => setShowDialog(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11"
          >
            Add Account
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="w-80 min-h-0 border-r border-border overflow-y-auto bg-card/30">
          {accounts.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center h-full">
              <p className="text-foreground/60 text-center mb-6">
                No accounts yet. Add one to get started.
              </p>
              <Button
                onClick={() => setShowDialog(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                Add
              </Button>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedAccountId === account.id
                      ? "bg-accent/20 border-accent"
                      : "border-border bg-card/50 hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-secondary/40 rounded flex items-center justify-center flex-shrink-0">
                      {account.kind === "microsoft" ? (
                        <MicrosoftIcon size={16} className="text-accent" />
                      ) : (
                        <UserIcon size={16} className="text-foreground/70" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm truncate">
                          {account.display_name}
                        </h3>
                        {account.id === activeAccountId && (
                          <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs font-bold rounded">
                            ACTIVE
                          </span>
                        )}
                        {renderOwnershipBadge(account)}
                      </div>
                      <p className="text-xs text-foreground/60">
                        {account.kind === "microsoft" ? "Microsoft" : "Offline"}
                      </p>
                    </div>
                    {account.id !== activeAccountId && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSetActive(account.id);
                          }}
                          className="p-2 hover:bg-background rounded transition-colors"
                          aria-label={`Set ${account.display_name} active`}
                        >
                          <Play size={16} className="text-accent fill-accent" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteModal(account);
                          }}
                          className="p-2 hover:bg-background rounded transition-colors"
                          aria-label={`Remove ${account.display_name}`}
                        >
                          <Trash2 size={16} className="text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedAccount ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center">
            <div className="w-full max-w-3xl p-8">
              <div className="mb-8">
                <div className="flex items-start gap-6 mb-8">
                  <div className="w-24 h-24 bg-secondary/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    {selectedAccount.kind === "microsoft" ? (
                      <MicrosoftIcon size={48} className="text-accent" />
                    ) : (
                      <UserIcon size={48} className="text-foreground/70" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h1 className="text-5xl font-bold mb-2">
                      {selectedAccount.display_name}
                    </h1>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="px-3 py-1 bg-secondary/40 rounded-lg">
                        <p className="text-sm font-mono">
                          {selectedAccount.kind === "microsoft"
                            ? "Microsoft Account"
                            : "Offline Account"}
                        </p>
                      </div>
                      {renderOwnershipBadge(selectedAccount)}
                    </div>
                    <p className="text-foreground/60 text-sm">
                      {selectedAccount.owns_minecraft === true
                        ? "Minecraft owned"
                        : selectedAccount.owns_minecraft === false
                          ? "Minecraft not owned"
                          : "Ownership unknown"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-6 tracking-tight">
                    Account Information
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-foreground/60 uppercase tracking-widest mb-2">
                        Username
                      </label>
                      <input
                        type="text"
                        value={selectedAccount.display_name}
                        readOnly
                        className="w-full bg-input border border-border rounded-lg px-4 py-3 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-foreground/60 uppercase tracking-widest mb-2">
                        Account Type
                      </label>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-input border border-border rounded-lg px-4 py-3">
                          <p className="font-mono text-sm">
                            {selectedAccount.kind === "microsoft"
                              ? "Microsoft Account"
                              : "Offline"}
                          </p>
                        </div>
                        <div className="px-4 py-3 bg-secondary/30 rounded-lg flex items-center gap-2">
                          <span className="text-xs font-mono">
                            {selectedAccount.kind === "microsoft"
                              ? "Microsoft Account"
                              : "Offline Account"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-6 tracking-tight">
                    Actions
                  </h3>
                  <Button
                    onClick={() => openDeleteModal(selectedAccount)}
                    variant="destructive"
                    className="w-full"
                  >
                    Remove Account
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/40">
              Select an account to view details
            </p>
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

      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold">Confirm Delete</h2>
              <button
                onClick={closeDeleteModal}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-foreground/70">
                Type '
                <span className="font-semibold">
                  {deleteTarget.display_name}
                </span>
                ' to confirm deletion.
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(event) => setDeleteConfirmName(event.target.value)}
                placeholder={deleteTarget.display_name}
                className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-destructive font-mono"
              />
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <Button
                variant="outline"
                onClick={closeDeleteModal}
                className="flex-1 bg-transparent"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await handleRemoveAccount(deleteTarget.id);
                  closeDeleteModal();
                }}
                disabled={
                  deleteConfirmName.trim() !== deleteTarget.display_name
                }
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
