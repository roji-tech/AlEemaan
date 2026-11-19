"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { MAX_INVITATION_BRANCHES } from "@/lib/invitations/rules";
import type { SelectOption } from "@/components/ui/SelectField";
import type { BranchOption, Invitation, Member, RoleName } from "./model";

/// The person an "Add to another branch" dialog is about: their address cannot be changed there, and the branch of the row it was opened from is one they hold.
export type InvitePerson = Pick<Member, "userId" | "name" | "email" | "role" | "branchId">;

/// Why a branch is not offered to that person. Only branches the caller administers are ever in the list, so naming them tells the caller nothing new.
type Held = "member" | "deactivated" | "invited";
const HELD_TEXT: Record<Held, string> = {
  member: "already a member",
  deactivated: "deactivated there: reactivate them instead",
  invited: "an invitation is already waiting",
};

const NO_INVITATIONS: Invitation[] = []; // (a default that is the same array on every render, so what is worked out from it is not worked out again)

/// "Invite someone": an address, a role and ONE branch (every membership belongs to one), or, on request, SEVERAL branches at once (task 0092): one invitation per branch, all or none, the same
/// role in each, and ONE e-mail with a link per branch. With `person` it is "Add <name> to another branch": the address is fixed, the branches the person already holds (or has a link waiting
/// for) are not offered, and any of the others can be ticked. The server checks everything again; this form only gives the answer where the person is looking. The dialog is remounted per
/// opening (the owner keys it), so it always starts clean.
export function InviteDialog({
  open,
  onClose,
  branches,
  roleOptions,
  invitations = NO_INVITATIONS,
  person = null,
  onInvited,
  onFromStaff,
}: {
  open: boolean;
  onClose: () => void;
  /// The branches this caller may invite to.
  branches: BranchOption[];
  roleOptions: SelectOption[];
  /// The open invitations the page already holds, so a branch with a link still waiting is not offered (`person` only; the server refuses it anyway).
  invitations?: Invitation[];
  person?: InvitePerson | null;
  onInvited: (invitations: Invitation[]) => void;
  /// Task 0114: go to the Staff tab, where staff are ticked and invited at the addresses on their records (no typing). Absent when adding a member to another branch.
  onFromStaff?: () => void;
}) {
  const personName = person?.name?.trim() || person?.email || "this person";
  const personEmail = person?.email?.trim().toLowerCase() ?? "";
  // The members list's search takes at most 64 characters; a longer address is not looked up, and the server is the check.
  const canLookUp = Boolean(person?.email) && (person?.email?.length ?? 0) <= 64;

  const [email, setEmail] = useState(person?.email ?? "");
  const [role, setRole] = useState<RoleName>(() =>
    person && roleOptions.some((o) => o.value === person.role) ? person.role : "TEACHING_STAFF",
  );
  // One branch (the select) or several (the checkboxes). "Add to another branch" is always several.
  const [several, setSeveral] = useState(Boolean(person));
  const [branchId, setBranchId] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [fetched, setFetched] = useState<ReadonlyMap<string, Held> | "loading" | "unknown">(
    !person ? new Map() : canLookUp ? "loading" : "unknown",
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const branchErrorId = useId();
  const groupLabelId = useId();

  // Which branches does this person already hold? Asked of the members list, which shows the caller only what they administer. A failure is not an error here: every other branch is then offered
  // and the server (which checks again) names the one that cannot be added.
  useEffect(() => {
    if (!person || !open || !canLookUp) return;
    const controller = new AbortController();
    void (async () => {
      const query = new URLSearchParams({ q: person.email ?? "", status: "all", limit: "100" });
      const reply = await getJson(`/api/v1/members?${query}`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFetched("unknown");
      const found = new Map<string, Held>();
      for (const m of reply.data!.members as Member[]) {
        if (m.userId === person.userId) found.set(m.branchId, m.status === "active" ? "member" : "deactivated");
      }
      setFetched(found);
    })();
    return () => controller.abort();
  }, [person, open, canLookUp]);

  // Every branch the person cannot be added to, and why: the row's own, the ones the members list shows, and those with a link still waiting.
  const held = useMemo(() => {
    const all = new Map<string, Held>();
    if (!person) return all;
    all.set(person.branchId, "member");
    if (fetched instanceof Map) for (const [id, why] of fetched) all.set(id, why);
    for (const i of invitations) {
      if (i.email.toLowerCase() === personEmail && i.status === "pending" && !all.has(i.branchId)) all.set(i.branchId, "invited");
    }
    return all;
  }, [person, fetched, invitations, personEmail]);
  const offered = useMemo(() => branches.filter((b) => !held.has(b.id)), [branches, held]);
  const notOffered = branches.filter((b) => held.has(b.id)).map((b) => `${b.name} (${HELD_TEXT[held.get(b.id)!]})`);

  const loading = fetched === "loading";
  const nothingToOffer = Boolean(person) && !loading && offered.length === 0;
  const limited = offered.slice(0, MAX_INVITATION_BRANCHES);
  const allChosen = limited.length > 0 && limited.every((b) => chosen.has(b.id));

  function toggle(id: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    if (branchError) setBranchError(null);
  }
  function selectAll() {
    setChosen(allChosen ? new Set() : new Set(limited.map((b) => b.id)));
    if (branchError) setBranchError(null);
  }
  /// Changing between one and several keeps what was picked, so changing one's mind loses nothing.
  function switchTo(many: boolean) {
    if (many) setChosen(branchId ? new Set([branchId]) : new Set());
    else setBranchId([...chosen][0] ?? "");
    setSeveral(many);
    setBranchError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const address = email.trim();
    const emailMistake = !address
      ? "Enter an email address."
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
        ? "Enter a valid email address."
        : null;
    const picked = several ? offered.filter((b) => chosen.has(b.id)).map((b) => b.id) : branchId ? [branchId] : [];
    const branchMistake = picked.length > 0 ? null : several ? "Choose at least one branch." : "Choose a branch.";
    setEmailError(emailMistake);
    setBranchError(branchMistake);
    if (emailMistake || branchMistake) return;

    setPending(true);
    // One branch keeps the original request and its answer; several send the list.
    const reply = await sendJson(
      `/api/v1/invitations`,
      "POST",
      several ? { email: address, role, branchIds: picked } : { email: address, role, branchId },
    );
    setPending(false);
    if (reply.ok) return onInvited(several ? (reply.data!.invitations as Invitation[]) : [reply.data!.invitation as Invitation]);

    const emailProblem = problemFor(reply, "email");
    const branchProblem = problemFor(reply, several ? "branchIds" : "branchId");
    if (emailProblem) setEmailError(emailProblem);
    else if (branchProblem) setBranchError(branchProblem);
    else if (reply.status === 401) setFormError(SESSION_ENDED);
    else if (reply.status === 429) setFormError(reply.message ?? RATE_LIMITED);
    else if (reply.status === 0) setFormError(NETWORK_ERROR);
    else setFormError(reply.message ?? "We couldn't send that invitation. Please try again.");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={person ? `Add ${personName} to another branch` : "Invite someone"}
      description={
        person
          ? "They get one email with a link for each branch you choose. Each link works for 7 days and adds that branch only, once they accept."
          : "They get an email with a link that works for 7 days. Until they accept, they have no access."
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {onFromStaff && !person && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg-2">
            <span>Inviting your staff? Tick them on their records instead: no typing.</span>
            <Button type="button" variant="secondary" onClick={onFromStaff}>
              Choose from staff records
            </Button>
          </div>
        )}
        <TextField
          label="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          error={emailError}
          autoComplete="off"
          inputMode="email"
          maxLength={254}
          autoFocus={!person}
          readOnly={Boolean(person)}
          disabled={pending}
        />
        <SelectField
          label="Role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleName)}
          options={roleOptions}
          hint={several ? "The same role in every branch you choose." : undefined}
          data-initial-focus={person ? "" : undefined}
          disabled={pending}
        />
        {several ? (
          <div
            role="group"
            aria-labelledby={groupLabelId}
            aria-describedby={branchError ? branchErrorId : undefined}
            className="min-w-0 space-y-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id={groupLabelId} className="text-xs font-semibold tracking-wide text-fg-2 uppercase">
                Branches
              </span>
              {limited.length > 1 && (
                <Button variant="ghost" className="px-3" onClick={selectAll} disabled={pending}>
                  {allChosen ? "Clear selection" : "Select all"}
                </Button>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-fg-muted" aria-busy="true">
                Checking which branches {personName} is already in…
              </p>
            ) : nothingToOffer ? (
              <p className="rounded-xl border border-dashed border-line-strong p-3 text-sm text-fg-muted">
                There is no other branch you can add {personName} to: they are already in each of the branches you administer, or an
                invitation is waiting.
              </p>
            ) : (
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {offered.map((b) => (
                  <li key={b.id}>
                    <CheckboxField
                      label={b.name}
                      checked={chosen.has(b.id)}
                      disabled={pending || (!chosen.has(b.id) && chosen.size >= MAX_INVITATION_BRANCHES)}
                      onChange={(e) => toggle(b.id, e.target.checked)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {offered.length > MAX_INVITATION_BRANCHES && (
              <p className="text-xs text-fg-muted">At most {MAX_INVITATION_BRANCHES} branches at a time.</p>
            )}
            {notOffered.length > 0 && <p className="text-xs text-fg-muted">Not offered: {notOffered.join("; ")}.</p>}
            {role === "ADMIN" && (
              <p className="text-xs text-fg-muted">
                Administers each branch they accept. For authority over every branch, make them a superadmin afterwards.
              </p>
            )}
            {branchError && (
              <p id={branchErrorId} role="alert" className="text-sm font-medium text-danger-text">
                {branchError}
              </p>
            )}
          </div>
        ) : (
          <SelectField
            label="Branch"
            name="branch"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              if (branchError) setBranchError(null);
            }}
            error={branchError}
            options={[{ value: "", label: "Choose a branch" }, ...branches.map((c) => ({ value: c.id, label: c.name }))]}
            hint={
              role === "ADMIN"
                ? "Administers this branch. For authority over every branch, make them a superadmin afterwards."
                : "The branch this person belongs to."
            }
            disabled={pending}
          />
        )}
        {!person && branches.length > 1 && (
          <Button variant="ghost" className="-mt-2 px-2" onClick={() => switchTo(!several)} disabled={pending}>
            {several ? "Invite to one branch only" : "Invite to several branches"}
          </Button>
        )}
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={loading || nothingToOffer}>
            {pending ? "Sending…" : several ? "Send invitations" : "Send invitation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
