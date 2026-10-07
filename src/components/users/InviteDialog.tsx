"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson } from "@/components/auth/postJson";
import { ROLE_OPTIONS, type BranchOption, type Invitation, type RoleName } from "./model";

/// "Invite someone": an address, a role and a branch (every membership belongs to one). The server checks everything again; this form only gives the answer where
/// the person is looking. The dialog is remounted per opening (the owner keys it), so it always starts clean.
export function InviteDialog({
  open,
  onClose,
  branches,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  branches: BranchOption[];
  onInvited: (invitation: Invitation) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleName>("TEACHING_STAFF");
  const [branchId, setBranchId] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    const branchMistake = branchId ? null : "Choose a branch.";
    setEmailError(emailMistake);
    setBranchError(branchMistake);
    if (emailMistake || branchMistake) return;

    setPending(true);
    const reply = await sendJson(`/api/v1/invitations`, "POST", { email: address, role, branchId });
    setPending(false);
    if (reply.ok) return onInvited(reply.data!.invitation as Invitation);

    const emailProblem = problemFor(reply, "email");
    const branchProblem = problemFor(reply, "branchId");
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
      title="Invite someone"
      description="They get an email with a link that works for 7 days. Until they accept, they have no access."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
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
          autoFocus
          disabled={pending}
        />
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
            if (branchError) setBranchError(null);
          }}
          error={branchError}
          options={[{ value: "", label: "Choose a branch" }, ...branches.map((c) => ({ value: c.id, label: c.name }))]}
          hint={role === "ADMIN" ? "Administrators can see every branch whatever is chosen here." : "The branch this person belongs to."}
          disabled={pending}
        />
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
