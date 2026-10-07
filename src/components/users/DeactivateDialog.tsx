"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, sendJson } from "@/components/auth/postJson";
import { displayName, type Member } from "./model";

/// The one destructive-feeling action gets a confirmation that says what it does and what it does not: access ends on their next request;
/// nothing they did is deleted; it can be undone.
export function DeactivateDialog({
  member,
  onClose,
  onDone,
}: {
  member: Member | null;
  onClose: () => void;
  onDone: (member: Member, signedOut: boolean) => void;
}) {
  return (
    <Dialog open={member !== null} onClose={onClose} title={member ? `Deactivate ${displayName(member)}?` : "Deactivate"}>
      {member && <DeactivateBody key={member.id} member={member} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function DeactivateBody({
  member,
  onClose,
  onDone,
}: {
  member: Member;
  onClose: () => void;
  onDone: (member: Member, signedOut: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    const reply = await sendJson(`/api/v1/members/${member.id}/deactivate`, "POST", {});
    setPending(false);
    if (reply.ok) return onDone(reply.data!.member as Member, Boolean(reply.data!.signedOut));
    if (reply.status === 401) setError(SESSION_ENDED);
    else if (reply.status === 429) setError(RATE_LIMITED);
    else if (reply.status === 0) setError(NETWORK_ERROR);
    else setError(reply.message ?? "We couldn't deactivate them. Please try again.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-fg-2">
        They lose access to this branch straight away. If it is their only branch they are signed out as well; otherwise they stay signed in
        with their other branches. Nothing they did is deleted, and you can reactivate them later with the same role and branch.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending} data-initial-focus>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} loading={pending}>
          {pending ? "Deactivating…" : "Deactivate"}
        </Button>
      </div>
    </div>
  );
}
