"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";

/// Deleting a staff record (task 0117, superadmin only: the card's menu offers it to nobody else, and the API refuses anyone else). The person's name is typed to confirm. A record with
/// history is refused by the server with the reasons, shown here, and Archive is the way for it. The sign-in account, if the record was linked to one, is never touched.
export function StaffDeleteDialog({
  person,
  onClose,
  onDone,
}: {
  /// `unplaced`: the record belongs to no branch yet (task 0101 D3), so it is deleted through the unplaced route.
  person: { id: string; name: string; unplaced?: boolean } | null;
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!person) return null;
  const matches = typed.trim().toLowerCase() === person.name.trim().toLowerCase();
  async function remove() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(person!.unplaced ? `/api/v1/staff/unplaced/${person!.id}` : `/api/v1/staff/${person!.id}`, "DELETE");
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "The record could not be deleted."));
    await onDone(`The record of ${person!.name} was deleted.`);
  }
  return (
    <Dialog
      open
      onClose={onClose}
      confirmClose
      title={`Delete the record of ${person.name}`}
      description="This permanently deletes the staff record. It only works for a record with no history: one that teaches, is a class teacher, or has other work attached is archived instead. Their sign-in, if they have one, is not touched."
    >
      <div className="mt-4 space-y-4">
        <TextField
          label={`Type ${person.name} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          data-initial-focus
        />
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!matches} onClick={() => void remove()}>
            Delete record
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
