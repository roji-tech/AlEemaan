"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { GENERIC_ERROR, sendJson } from "@/components/auth/postJson";

// New or Returning for many pupils at once (task 0125), from Students: an administrator of the branch's (the API refuses anyone else). It says how many pupils it reaches and how many
// would change before it does anything. Pupils whose setting was made by hand are left alone unless the box is cleared.

type Count = { inScope: number; willChange: number; changed: number; dryRun: boolean };
const WORD: Record<string, string> = { NEW: "new", RETURNING: "returning", "": "worked out automatically" };

export function BulkAdmissionDialog({
  open,
  branchId,
  classes,
  onClose,
  onChanged,
}: {
  open: boolean;
  branchId: string;
  classes: { id: string; name: string }[];
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [admission, setAdmission] = useState("RETURNING");
  const [classGroupId, setClassGroupId] = useState("");
  const [onlyUnset, setOnlyUnset] = useState(true);
  const [result, setResult] = useState<{ key: string; count?: Count; error?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/v1/finance/admission-status?branchId=${encodeURIComponent(branchId)}`;
  const body = (dryRun: boolean) => ({ admission: admission || null, classGroupId: classGroupId || null, onlyUnset, dryRun });
  // The count belongs to the choices it was made for; until the answer for the current choices arrives there is no count.
  const key = `${base}|${admission}|${classGroupId}|${onlyUnset}`;
  const here = result?.key === key ? result : null;
  const count = here?.count ?? null;
  const error = saveError ?? here?.error ?? null;

  useEffect(() => {
    if (!open) return;
    let current = true;
    void sendJson(base, "POST", { admission: admission || null, classGroupId: classGroupId || null, onlyUnset, dryRun: true }).then(
      (reply) => {
        if (!current) return;
        setResult(reply.ok ? { key, count: reply.data as Count } : { key, error: reply.message ?? GENERIC_ERROR });
      },
    );
    return () => {
      current = false;
    };
  }, [open, base, key, admission, classGroupId, onlyUnset]);

  async function apply() {
    setBusy(true);
    setSaveError(null);
    const reply = await sendJson(base, "POST", body(false));
    setBusy(false);
    if (!reply.ok || !reply.data) return setSaveError(reply.message ?? GENERIC_ERROR);
    const done = reply.data as Count;
    onChanged(
      done.changed === 0
        ? "No pupil needed changing."
        : `${done.changed} pupil${done.changed === 1 ? " is" : "s are"} now counted as ${WORD[admission]}.`,
    );
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New or returning, for many pupils">
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Fee lines for new pupils (the uniform, the cardigan) are charged by this. Pupils already at the school have no earlier year in the
          app, so mark them Returning before the first invoices are made; it does not change invoices already made.
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Count them as"
            value={admission}
            onChange={(e) => setAdmission(e.target.value)}
            options={[
              { value: "RETURNING", label: "Returning" },
              { value: "NEW", label: "New" },
              { value: "", label: "Worked out automatically" },
            ]}
          />
          <SelectField
            label="Class"
            value={classGroupId}
            onChange={(e) => setClassGroupId(e.target.value)}
            options={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <CheckboxField
          label="Only pupils nobody has set yet (leaves a pupil you set by hand alone)"
          checked={onlyUnset}
          onChange={(e) => setOnlyUnset(e.target.checked)}
        />
        <p className="text-sm text-fg-2" role="status" aria-live="polite">
          {count === null
            ? error
              ? ""
              : "Counting..."
            : `${count.inScope} pupil${count.inScope === 1 ? "" : "s"} in this choice; ${count.willChange} would change.`}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || count === null || count.willChange === 0} onClick={() => void apply()}>
            {busy ? "Saving..." : count && count.willChange > 0 ? `Change ${count.willChange}` : "Nothing to change"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
