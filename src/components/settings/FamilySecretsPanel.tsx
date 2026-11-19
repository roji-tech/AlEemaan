"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { getJson, sendJson } from "@/components/auth/postJson";

// Task 0113 (task 0094 D7): per branch, whether families may still sign in with the date of birth (pupil) or the guardian's whole phone number or e-mail, besides the access codes.
// On until the branch's codes are out (Students > a pupil's Access code, or Print access slips for a class); then turn it off, and only the codes work.
type Row = { id: string; name: string; legacyPortalSecrets: boolean };

export function FamilySecretsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getJson("/api/v1/settings/family-secrets").then((reply) => {
      if (!live) return;
      if (reply.ok) setRows(reply.data!.branches as Row[]);
      else setError("Couldn't load the branches.");
    });
    return () => {
      live = false;
    };
  }, []);
  async function toggle(row: Row, on: boolean) {
    setBusy(row.id);
    setError(null);
    const reply = await sendJson("/api/v1/settings/family-secrets", "PATCH", { branchId: row.id, legacyPortalSecrets: on });
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? "That didn't work.");
    setRows((all) => (all ?? []).map((r) => (r.id === row.id ? { ...r, legacyPortalSecrets: on } : r)));
  }
  if (rows !== null && rows.length === 0) return null;
  return (
    <section aria-labelledby="family-secrets-heading" className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div>
        <h2 id="family-secrets-heading" className="text-base font-semibold text-fg">
          Date of birth and phone sign-in
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Besides their access codes, families may sign in with the pupil&apos;s date of birth or the guardian&apos;s whole phone number or
          e-mail. Those are easier to guess: once a branch&apos;s codes are handed out, turn this off and only the codes work.
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {rows === null ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="py-1">
              <CheckboxField
                label={`${row.name}: date of birth and phone sign-in allowed`}
                checked={row.legacyPortalSecrets}
                disabled={busy === row.id}
                onChange={(e) => void toggle(row, e.target.checked)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
