"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField } from "@/components/ui/PasswordField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson } from "@/components/auth/postJson";
import type { SelectOption } from "@/components/ui/SelectField";
import { canBeApprover, displayName, type BranchOption, type Member, type RoleName } from "./model";

/// Change one person's role and/or branch, and (a superadmin only) whether they may approve results (task 0039). Only what changed is sent. The server enforces the
/// authority rules (not yourself, never the school's last superadmin, a real branch) and its message is shown as it is — those are the cases a person can act on.
/// Changing who may approve results asks for a fresh proof: the superadmin's own password, or the code from their authenticator when two-step verification is on.
export function EditMemberDialog({
  member,
  onClose,
  branches,
  roleOptions,
  isSuperAdmin,
  hasMfa,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  branches: BranchOption[];
  roleOptions: SelectOption[];
  isSuperAdmin: boolean;
  hasMfa: boolean;
  onSaved: (member: Member, changed: boolean) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={member ? `Change access for ${displayName(member)}` : "Change access"}
      description="Takes effect on their next request."
    >
      {member && (
        <EditForm
          key={member.id}
          member={member}
          onClose={onClose}
          branches={branches}
          roleOptions={roleOptions}
          isSuperAdmin={isSuperAdmin}
          hasMfa={hasMfa}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function EditForm({
  member,
  onClose,
  branches,
  roleOptions,
  isSuperAdmin,
  hasMfa,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  branches: BranchOption[];
  roleOptions: SelectOption[];
  isSuperAdmin: boolean;
  hasMfa: boolean;
  onSaved: (member: Member, changed: boolean) => void;
}) {
  const [role, setRole] = useState<RoleName>(member.role);
  const [canApprove, setCanApprove] = useState(member.canApproveResults);
  const [proof, setProof] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(member.branchId);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setBranchError(null);
    setProofError(null);
    const body: {
      role?: RoleName;
      branchId?: string;
      canApproveResults?: boolean;
      stepUp?: { type: "password" | "totp" | "recovery"; value: string };
    } = {};
    if (role !== member.role) body.role = role;
    if (branchId !== member.branchId) body.branchId = branchId;
    // Only a superadmin is offered the choice, and only for a role that can hold it; a role that cannot hold it takes the right away on the server by itself.
    const approvalChanged = isSuperAdmin && canBeApprover(role) && canApprove !== member.canApproveResults;
    if (approvalChanged) {
      if (!proof.trim()) return setProofError(hasMfa ? "Enter the code from your authenticator." : "Enter your password to confirm.");
      body.canApproveResults = canApprove;
      body.stepUp = {
        type: hasMfa ? (/^\d{6}$/.test(proof.trim()) ? "totp" : "recovery") : "password",
        value: hasMfa ? proof.trim() : proof,
      };
    }
    if (Object.keys(body).length === 0) return onClose(); // nothing changed — nothing sent

    setPending(true);
    const reply = await sendJson(`/api/v1/members/${member.id}`, "PATCH", body);
    setPending(false);
    if (reply.ok) return onSaved(reply.data!.member as Member, Boolean(reply.data!.changed));

    const branchProblem = problemFor(reply, "branchId");
    const proofProblem = problemFor(reply, "stepUp.value");
    if (branchProblem) setBranchError(branchProblem);
    else if (proofProblem) setProofError(proofProblem);
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
        options={roleOptions}
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
        hint={role === "ADMIN" ? "Administers this branch. Superadmin is set separately, from the list." : undefined}
        disabled={pending}
      />
      {isSuperAdmin && canBeApprover(role) && (
        <div className="space-y-3">
          <CheckboxField
            label="May approve results"
            checked={canApprove}
            onChange={(e) => setCanApprove(e.target.checked)}
            disabled={pending}
          />
          <p className="-mt-1 text-xs text-fg-muted">
            They review and approve the results of the classes you give them. Turning it on gives them the whole branch; narrow it
            afterwards. Turning it off removes it.
          </p>
          {canApprove !== member.canApproveResults &&
            (hasMfa ? (
              <TextField
                label="Authenticator code"
                name="stepUp"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                error={proofError}
                hint="The 6-digit code from your authenticator app, or one of your recovery codes."
                autoComplete="one-time-code"
                disabled={pending}
              />
            ) : (
              <PasswordField
                label="Your password"
                name="stepUp"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                error={proofError}
                hint="Confirm it is you before changing who approves results."
                autoComplete="current-password"
                disabled={pending}
              />
            ))}
        </div>
      )}
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
