"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type Notice } from "@/components/academics/common";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@prisma/client";

// Email-address changes waiting for a decision (task 0088). The list is already narrowed by the server to the people this administrator may
// decide for: members of their branches (a superadmin: everyone, including administrators). The API refuses anything else.

type Item = {
  id: string;
  newEmail: string;
  createdAt: string;
  person: { id: string; name: string | null; email: string | null };
  needs: "ADMIN" | "SUPERADMIN";
  roles: Role[];
};

export function EmailChangesPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [deciding, setDeciding] = useState<{ item: Item; decision: "approve" | "deny" } | null>(null);

  const load = useCallback(async () => {
    const r = await getJson("/api/v1/email-change-requests");
    if (!r.ok) return setError(say(r, "Couldn't load the requests."));
    setError(null);
    setItems(r.data!.requests as Item[]);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading when the tab opens is exactly what this effect is for
    void load();
  }, [load]);

  const who = (i: Item) => i.person.name ?? i.person.email ?? "someone";

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        A person&apos;s email address is how they sign in and recover their account, so a change waits here. Approving sends a link to the
        new address; nothing changes until that link is opened. An administrator&apos;s own request needs a superadmin.
      </p>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {items === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
          No email changes are waiting for you.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-fg">{who(i)}</p>
                <p className="text-sm text-fg-muted">
                  {i.roles.length > 0 ? i.roles.map((r) => ROLE_LABELS[r]).join(", ") : "No branch"} · asked on{" "}
                  {new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-sm break-words text-fg">
                  <span className="text-fg-muted">From</span> {i.person.email ?? "no address"} <span className="text-fg-muted">to</span>{" "}
                  <strong className="font-semibold">{i.newEmail}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setDeciding({ item: i, decision: "approve" })}
                  aria-label={`Approve the email change for ${who(i)}`}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDeciding({ item: i, decision: "deny" })}
                  aria-label={`Deny the email change for ${who(i)}`}
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DecideDialog
        key={deciding ? `${deciding.item.id}-${deciding.decision}` : "none"}
        deciding={deciding}
        who={deciding ? who(deciding.item) : ""}
        onClose={() => setDeciding(null)}
        onDone={async (text) => {
          setDeciding(null);
          setNotice({ variant: "success", text });
          await load();
        }}
      />
    </div>
  );
}

function DecideDialog({
  deciding,
  who,
  onClose,
  onDone,
}: {
  deciding: { item: Item; decision: "approve" | "deny" } | null;
  who: string;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deciding || pending) return;
    setPending(true);
    setProblem(null);
    const r = await sendJson(`/api/v1/email-change-requests/${deciding.item.id}`, "POST", {
      decision: deciding.decision,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (r.ok) {
      await onDone(
        deciding.decision === "approve"
          ? `Approved. A confirmation link is on its way to the new address for ${who}.`
          : `Denied. ${who} has been told their address was not changed.`,
      );
      return;
    }
    if (r.status === 404) {
      await onDone("That request was already decided, or is no longer yours to decide.");
      return;
    }
    setProblem(say(r, "That didn't work."));
  }
  const approve = deciding?.decision === "approve";
  return (
    <Dialog
      open={deciding !== null}
      onClose={onClose}
      title={approve ? "Approve this email change" : "Deny this email change"}
      description={deciding ? `${who} wants to use ${deciding.item.newEmail}.` : undefined}
    >
      {deciding && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="text-sm text-fg-muted">
            {approve
              ? "We'll send a confirmation link to the new address, and tell their current address. Only approve it if you are sure it is really them."
              : "Their current address stays as it is, and they are told it was declined."}
          </p>
          <div>
            <label htmlFor="email-change-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              Your note (optional, recorded with the decision)
            </label>
            <textarea
              id="email-change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} variant={approve ? "primary" : "danger"}>
              {approve ? "Approve" : "Deny"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
