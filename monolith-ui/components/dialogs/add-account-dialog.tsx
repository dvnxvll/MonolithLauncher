"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddOffline: (accountName: string) => void;
  onAddMicrosoft: () => void;
  canAddOffline: boolean;
}

export default function AddAccountDialog({
  open,
  onOpenChange,
  onAddOffline,
  onAddMicrosoft,
  canAddOffline,
}: AddAccountDialogProps) {
  const [step, setStep] = useState(1);
  const [accountName, setAccountName] = useState("");

  const handleClose = () => {
    setStep(1);
    setAccountName("");
    onOpenChange(false);
  };

  const handleAddOffline = () => {
    if (!accountName.trim()) {
      return;
    }
    if (!canAddOffline) {
      return;
    }
    onAddOffline(accountName.trim());
    handleClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">
            {step === 1 ? "Add Account" : "Offline Account"}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-foreground/70 mb-4">Choose One</p>
              <Button
                onClick={() => {
                  onAddMicrosoft();
                  handleClose();
                }}
                className="w-full bg-input border border-border text-foreground hover:bg-muted h-12"
              >
                Microsoft Account
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!canAddOffline}
                className="w-full bg-input border border-border text-foreground hover:bg-muted h-12"
              >
                Offline Account
              </Button>
              {!canAddOffline && (
                <p className="text-xs text-foreground/60">
                  Add a Microsoft account first to enable offline profiles.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Account Name
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Steve"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="flex gap-3 p-6 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleAddOffline}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="p-6 border-t border-border">
            <Button
              variant="outline"
              onClick={handleClose}
              className="w-full bg-transparent"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
