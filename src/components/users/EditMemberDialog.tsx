"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson } from "@/components/auth/postJson";
import { ROLE_OPTIONS, displayName, type BranchOption, type Member, type RoleName } from "./model";

/// Change one person's role and/or branch. Only what changed is sent. The server enforces the authority rules (not yourself, never the school's
/// last administrator, a real branch) and its message is shown as it is — those are the cases a person can act on. (Extra permissions are a
/// separate port: Octalve Edu's 1.0.)
export function EditMemberDialog({
  member,
  onClose,
  branches,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  branches: BranchOption[];
  onSaved: (member: Member, changed: boolean) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={member ? `Change access for ${displayName(member)}` : "Change access"}
      description="Takes effect on their next request."
    >
      {member && <EditForm key={member.id} member={member} onClose={onClose} branches={branches} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditForm({
  member,
  onClose,
  branches,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  branches: BranchOption[];
  onSaved: (member: Member, changed: boolean) => void;
}) {
  const [role, setRole] = useState<RoleName>(member.role);
  const [branchId, setBranchId] = useState(member.branchId);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setBranchError(null);
    const body: { role?: RoleName; branchId?: string } = {};
    if (role !== member.role) body.role = role;
    if (branchId !== member.branchId) body.branchId = branchId;
    if (Object.keys(body).length === 0) return onClose(); // nothing changed — nothing sent

    setPending(true);
    const reply = await sendJson(`/api/v1/members/${member.id}`, "PATCH", body);
    setPending(false);
    if (reply.ok) return onSaved(reply.data!.member as Member, Boolean(reply.data!.changed));

    const branchProblem = problemFor(reply, "branchId");
    if (branchProblem) setBranchError(branchProblem);
    else if (reply.status === 401) setFormError(SESSION_ENDED);
    else if (reply.status === 429) setFormError(RATE_LIMITED);
    else if (reply.status === 0) setFormError(NETWORK_ERROR);
    else setFormError(reply.message ?? "We couldn't save that change. Please try again.");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <SelectField
        label="Role"
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as RoleName)}
        options={ROLE_OPTIONS}
        disabled={pending}
      />
      <SelectField
        label="Branch"
        name="branch"
        value={branchId}
        onChange={(e) => {
          setBranchId(e.target.value);
          setBranchError(null);
        }}
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        error={branchError}
        hint={role === "ADMIN" ? "Administrators can see every branch whatever is chosen here." : undefined}
        disabled={pending}
      />
      {formError && <Alert variant="error">{formError}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
