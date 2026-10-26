"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";
import { ShieldCheckIcon } from "@/components/ui/icons";

/// What is about to change, in the words the dialog shows: a line the caller writes itself ("New section" from "—" to "Primary").
export type StepUpChange = { field: string; fromValue: string; toValue: string };
export type StepUpProof = { type: "totp" | "recovery" | "password"; value: string };

// A fresh proof for a change to who may approve results (task 0039): the person's own password, or the code from their authenticator when two-step verification is on. The form,
// and what is typed in it, exists only while the dialog is open, so a password or a code is gone the moment it closes, whether it was confirmed, refused or cancelled.
export function StepUpModal({
  open,
  onClose,
  onConfirm,
  hasMfa,
  change,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (proof: StepUpProof) => Promise<void>;
  hasMfa: boolean;
  change: StepUpChange | null;
  saving: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Confirm it's you" description="Changing who may approve results needs your password or authenticator code again.">
      {open && change && <StepUpForm onClose={onClose} onConfirm={onConfirm} hasMfa={hasMfa} change={change} saving={saving} error={error} />}
    </Dialog>
  );
}

function StepUpForm({ onClose, onConfirm, hasMfa, change, saving, error }: Omit<Parameters<typeof StepUpModal>[0], "open" | "change"> & { change: StepUpChange }) {
  const [proof, setProof] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!proof.trim() || saving) return;
    await onConfirm({ type: hasMfa ? (useRecovery ? "recovery" : "totp") : "password", value: proof.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1 rounded-xl border border-line bg-field/30 p-3 text-xs">
        <p className="font-semibold text-fg">Proposed change</p>
        <p className="text-fg-muted">{change.field}</p>
        <p className="font-medium text-fg">
          <span className="mr-1 text-fg-muted line-through">{change.fromValue}</span>
          <span>&rarr; {change.toValue}</span>
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {hasMfa ? (
        <div className="space-y-3">
          <TextField
            label={useRecovery ? "Recovery code" : "Authenticator code"}
            name="stepUp"
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder={useRecovery ? "One of your unused recovery codes" : "6-digit code from your authenticator"}
            autoComplete="one-time-code"
            required
          />
          <button
            type="button"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setProof("");
            }}
            className="min-h-11 text-xs font-medium text-brand-fg hover:underline"
          >
            {useRecovery ? "Use the authenticator code instead" : "Can't use your authenticator? Use a recovery code"}
          </button>
        </div>
      ) : (
        <PasswordField label="Your password" name="stepUp" value={proof} onChange={(e) => setProof(e.target.value)} autoComplete="current-password" required />
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !proof.trim()}>
          <ShieldCheckIcon className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Confirm and save"}
        </Button>
      </div>
    </form>
  );
}
