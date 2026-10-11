"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField } from "@/components/ui/PasswordField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson } from "@/components/auth/postJson";
import { displayName, type Member } from "./model";

/// Make someone a superadmin (administers every branch, the school's settings and other administrators) or take that away. It needs the
/// CALLER's own password — school-wide authority is not something a stolen session should be able to hand out. The server decides everything
/// else (not yourself, never the last superadmin); its message is shown as it is.
export function SuperAdminDialog({
  member,
  onClose,
  onDone,
}: {
  member: Member | null;
  onClose: () => void;
  onDone: (member: Member, granted: boolean) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={
        member
          ? member.isSuperAdmin
            ? `Remove superadmin from ${displayName(member)}?`
            : `Make ${displayName(member)} a superadmin?`
          : "Superadmin"
      }
    >
      {member && <Body key={member.id} member={member} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function Body({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (member: Member, granted: boolean) => void }) {
  const granting = !member.isSuperAdmin;
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    if (!password) return setPasswordError("Enter your password.");
    setPasswordError(null);
    setPending(true);
    const reply = await sendJson(`/api/v1/members/${member.id}/superadmin`, "PATCH", { superAdmin: granting, password });
    setPending(false);
    if (reply.ok) return onDone(reply.data!.member as Member, granting);

    const problem = problemFor(reply, "password");
    if (problem || reply.code === "INVALID_PASSWORD") setPasswordError(problem ?? "Your password is incorrect.");
    else if (reply.status === 401) setFormError(SESSION_ENDED);
    else if (reply.status === 429) setFormError(RATE_LIMITED);
    else if (reply.status === 0) setFormError(NETWORK_ERROR);
    else setFormError(reply.message ?? "We couldn't save that change. Please try again.");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm leading-relaxed text-fg-2">
        {granting
          ? "A superadmin can manage every branch, the school's settings and branches, and other administrators. They keep the role they hold in each branch."
          : "They stop being able to manage every branch, the school's settings and other administrators. Their role in each branch stays as it is."}
      </p>
      <PasswordField
        label="Your password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (passwordError) setPasswordError(null);
        }}
        error={passwordError}
        hint="To confirm it is you."
        disabled={pending}
        data-initial-focus
      />
      {formError && <Alert variant="error">{formError}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant={granting ? "primary" : "danger"} loading={pending}>
          {pending ? "Saving…" : granting ? "Make superadmin" : "Remove superadmin"}
        </Button>
      </div>
    </form>
  );
}
