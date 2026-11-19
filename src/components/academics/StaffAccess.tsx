"use client";

import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";

// Task 0114: inviting staff to sign in from their records (one or many, nobody copies an address), and moving a member of staff to another branch or adding them there as well.
// Presentation only: the staff invite and transfer APIs decide who may do what and check every record again.

export type InvitePerson = { id: string; name: string; email: string };
type Outcome = { staffId: string; name: string; result: "invited" | "linked" | "skipped"; email?: string; why?: string };

/// Can this record be invited from the list? A live, active record that is not a draft, with an e-mail address, no sign-in yet, and no link still waiting.
export function invitable(p: {
  archived: boolean;
  standing: string;
  email: string | null;
  account: { state: string };
  invited?: { expired: boolean } | null;
  /// A draft is not invited (task 0101 D1): complete the record first.
  isDraft?: boolean;
}): boolean {
  return (
    !p.archived && !p.isDraft && p.standing === "ACTIVE" && !!p.email && p.account.state === "none" && (!p.invited || p.invited.expired)
  );
}

export function StaffInviteDialog({
  branchName,
  branchId,
  people,
  onClose,
  onDone,
}: {
  branchName: string;
  branchId: string;
  /// Who to invite; null closes the dialog.
  people: InvitePerson[] | null;
  onClose: () => void;
  onDone: (summary: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  if (!people) return null;
  const many = people.length !== 1;

  async function send() {
    setBusy(true);
    setError(null);
    const reply = await sendJson("/api/v1/staff/invite", "POST", { branchId, staffIds: people!.map((p) => p.id) });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "The invitations could not be sent."));
    setOutcomes(reply.data!.outcomes as Outcome[]);
  }
  const counts = outcomes && {
    invited: outcomes.filter((o) => o.result === "invited").length,
    linked: outcomes.filter((o) => o.result === "linked").length,
    skipped: outcomes.filter((o) => o.result === "skipped"),
  };
  const finish = () => {
    if (!counts) return onClose();
    const parts = [
      counts.invited > 0 && `${counts.invited} ${counts.invited === 1 ? "invitation" : "invitations"} sent`,
      counts.linked > 0 && `${counts.linked} linked to the account they already had`,
      counts.skipped.length > 0 && `${counts.skipped.length} not invited`,
    ].filter(Boolean);
    void onDone(`${parts.join(", ")}.`);
  };

  return (
    <Dialog
      open
      onClose={finish}
      title={many ? `Invite ${people.length} people to sign in` : `Invite ${people[0].name} to sign in`}
      description={`Each gets an e-mail with a link that works for 7 days, at the address on their record, to ${branchName}. Teaching staff join as Teaching staff, non-teaching staff as Non-teaching staff. Accepting links the account to their record.`}
    >
      <div className="mt-4 space-y-4">
        {!outcomes ? (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm" aria-label="People to invite">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2">
                <span className="font-medium text-fg">{p.name}</span>
                <span className="text-fg-muted">{p.email}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <Alert variant={counts!.skipped.length === 0 ? "success" : "info"}>
              {counts!.invited} sent{counts!.linked > 0 ? `, ${counts!.linked} linked` : ""}
              {counts!.skipped.length > 0 ? `, ${counts!.skipped.length} not invited` : ""}.
            </Alert>
            {counts!.skipped.length > 0 && (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm" aria-label="Not invited">
                {counts!.skipped.map((o) => (
                  <li key={o.staffId} className="px-3 py-2">
                    <span className="font-medium text-fg">{o.name || "A record"}</span>
                    <span className="block text-fg-muted">{o.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          {!outcomes ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void send()}>
                {many ? `Send ${people.length} invitations` : "Send invitation"}
              </Button>
            </>
          ) : (
            <Button onClick={finish}>Done</Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/// Move a member of staff to another branch, or add them there as well (task 0114). The other branch is one the viewer administers.
export function StaffTransferDialog({
  person,
  fromBranchName,
  branches,
  onClose,
  onDone,
}: {
  person: { id: string; name: string; hasAccount: boolean } | null;
  fromBranchName: string;
  /// The branches it may go to (administered by the viewer, not this one).
  branches: BranchChoice[];
  onClose: () => void;
  onDone: (text: string) => void | Promise<void>;
}) {
  const [to, setTo] = useState(branches[0]?.id ?? "");
  const [mode, setMode] = useState<"move" | "also">("also");
  const [ends, setEnds] = useState<{ assignments: number; classTeacher: number; grants: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = useId();
  useEffect(() => {
    if (!person) return;
    let live = true;
    void getJson(`/api/v1/staff/${person.id}/transfer`).then((reply) => {
      if (live && reply.ok) setEnds(reply.data!.ends as { assignments: number; classTeacher: number; grants: number });
    });
    return () => {
      live = false;
    };
  }, [person]);
  if (!person) return null;
  const target = branches.find((b) => b.id === to);
  const endsText = ends
    ? [
        ends.assignments > 0 && `${ends.assignments} subject ${ends.assignments === 1 ? "assignment" : "assignments"}`,
        ends.classTeacher > 0 && `class teacher of ${ends.classTeacher} ${ends.classTeacher === 1 ? "arm" : "arms"}`,
        ends.grants > 0 && `${ends.grants} attendance ${ends.grants === 1 ? "grant" : "grants"}`,
      ].filter(Boolean)
    : [];

  async function go() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`/api/v1/staff/${person!.id}/transfer`, "POST", { toBranchId: to, mode });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    const r = reply.data as { branchName: string; account: "none" | "linked" | "deactivated-there" };
    const sign =
      r.account === "linked"
        ? " Their sign-in now works there too."
        : r.account === "deactivated-there"
          ? ` Their sign-in in ${r.branchName} was deactivated earlier: reactivate it on the Users page.`
          : "";
    await onDone(
      mode === "move" ? `${person!.name} moved to ${r.branchName}.${sign}` : `${person!.name} now also works in ${r.branchName}.${sign}`,
    );
  }

  const radio =
    "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm text-fg-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring";
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${person.name}: another branch`}
      description="Their details go with them; nothing is typed again. What belongs to a branch (subjects taught, class teacher, attendance grants) does not."
    >
      <div className="mt-4 space-y-4">
        {branches.length === 0 ? (
          <Alert variant="info">There is no other branch you administer.</Alert>
        ) : (
          <>
            <SelectField
              label="Branch"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">What happens</legend>
              <label className={radio}>
                <input
                  type="radio"
                  name={name}
                  checked={mode === "also"}
                  onChange={() => setMode("also")}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="block font-medium text-fg">Also works in {target?.name ?? "that branch"}</span>
                  <span className="block text-xs text-fg-muted">
                    They stay in {fromBranchName} as they are, and get a record there too.
                  </span>
                </span>
              </label>
              <label className={radio}>
                <input
                  type="radio"
                  name={name}
                  checked={mode === "move"}
                  onChange={() => setMode("move")}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="block font-medium text-fg">Move to {target?.name ?? "that branch"}</span>
                  <span className="block text-xs text-fg-muted">
                    Their record in {fromBranchName} is archived
                    {person.hasAccount ? `, and their sign-in moves with them (it stops working in ${fromBranchName})` : ""}.
                    {endsText.length > 0 ? ` Ends in ${fromBranchName}: ${endsText.join(", ")}.` : ""}
                  </span>
                </span>
              </label>
            </fieldset>
          </>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {branches.length > 0 && (
            <Button loading={busy} variant={mode === "move" ? "danger" : "primary"} onClick={() => void go()}>
              {mode === "move" ? "Move" : "Add to branch"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
