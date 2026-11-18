"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";
import { MailIcon } from "@/components/ui/icons";
import { GENERIC_ERROR, NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, sendJson } from "@/components/auth/postJson";

// Deliberately loose: the point is to catch typos before a round trip. The server's zod rule decides, and the
// only real proof an address works is the link that is mailed to it.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// After the person acts, the control they used disappears — a heading that takes focus when it appears (never on
/// first load) lands keyboard and screen-reader users on what replaced it.
function Heading({ children, focus }: { children: string; focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <h3 ref={ref} tabIndex={-1} className="text-base font-semibold text-fg focus:outline-none">
      {children}
    </h3>
  );
}

/// "Email address" card (plan §0.5.E): idle → form (new address + CURRENT password) → "check your inbox".
/// The screen says the same thing whether or not the address already belongs to somebody — that is the
/// server's promise, and this panel must not undo it by hinting at the difference.
///
/// Task 0088: unless the person is a superadmin, an administrator has to approve the change before any link is sent
/// (`needsApproval`), so the form says so, the confirmation says "sent for approval", and a request that is waiting
/// is shown with a Cancel button (`waiting`).
export function ChangeEmailPanel({
  email,
  needsApproval = false,
  waiting = null,
}: {
  email: string | null;
  needsApproval?: boolean;
  waiting?: { newEmail: string; since: string } | null;
}) {
  const [view, setView] = useState<"idle" | "form" | "sent">("idle");
  const [open, setOpen] = useState(waiting);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [touched, setTouched] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const startButton = useRef<HTMLButtonElement>(null);

  // Back at the start (Cancel, or Done after the mail was sent): the control the person just used is gone, so
  // focus goes to the button that took its place, not to <body>.
  useEffect(() => {
    if (touched && view === "idle") startButton.current?.focus();
  }, [touched, view]);
  function go(next: "idle" | "form" | "sent") {
    setTouched(true);
    setView(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const address = newEmail.trim();
    const noEmail = !address ? "Enter the new email address." : !LOOKS_LIKE_EMAIL.test(address) ? "Enter a valid email address." : null;
    const noPassword = password ? null : "Enter your current password.";
    setEmailError(noEmail);
    setPasswordError(noPassword);
    if (noEmail || noPassword) return;

    setPending(true);
    const reply = await sendJson("/api/v1/auth/email-change/request", "POST", { newEmail: address, password });
    setPending(false);
    if (reply.ok) {
      setSentTo(address);
      setAsked(reply.data?.needsApproval === true);
      if (reply.data?.needsApproval === true) setOpen({ newEmail: address, since: new Date().toISOString() });
      setNewEmail("");
      setPassword("");
      return go("sent");
    }
    setPassword("");
    if (reply.code === "INVALID_PASSWORD") setPasswordError(reply.message ?? "Your password is incorrect.");
    else if (reply.code === "SAME_EMAIL") setEmailError(reply.message ?? "That is already your email address.");
    else if (reply.code === "VALIDATION") setEmailError(reply.message ?? "Enter a valid email address.");
    else if (reply.status === 429) setFormError(RATE_LIMITED);
    else if (reply.status === 401) setFormError(SESSION_ENDED);
    else setFormError(reply.code === "NETWORK" ? NETWORK_ERROR : GENERIC_ERROR);
  }

  async function cancelRequest() {
    if (cancelling) return;
    setCancelling(true);
    setCancelError(null);
    const reply = await sendJson("/api/v1/auth/email-change/request", "DELETE");
    setCancelling(false);
    if (reply.ok) return setOpen(null);
    setCancelError(reply.status === 401 ? SESSION_ENDED : reply.code === "NETWORK" ? NETWORK_ERROR : GENERIC_ERROR);
  }

  return (
    <div className="mt-4 space-y-4">
      {view === "idle" && (
        <div className="space-y-4">
          <p className="text-sm text-fg-2">
            Your email address is <strong className="font-semibold wrap-break-word text-fg">{email ?? "not set"}</strong>.
          </p>
          {open && (
            <div role="status" className="max-w-md space-y-3 rounded-2xl border border-line bg-info-bg p-4">
              <p className="text-sm font-semibold text-fg">Waiting for approval</p>
              <p className="text-sm text-fg-2">
                You asked to change it to <strong className="font-semibold wrap-break-word text-fg">{open.newEmail}</strong> on{" "}
                {new Date(open.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. An administrator
                has to approve it first; once they do, a link goes to the new address. Until then nothing changes.
              </p>
              {cancelError && <Alert variant="error">{cancelError}</Alert>}
              <Button variant="ghost" onClick={cancelRequest} loading={cancelling}>
                Cancel this request
              </Button>
            </div>
          )}
          <Button variant="secondary" onClick={() => go("form")} ref={startButton}>
            {open ? "Ask for a different address" : "Change email address"}
          </Button>
        </div>
      )}

      {view === "form" && (
        <form method="post" onSubmit={submit} noValidate className="max-w-md space-y-4">
          <Heading focus={touched}>Change your email address</Heading>
          <p className="text-sm text-fg-muted">
            {needsApproval
              ? "An administrator has to approve this first. Once they do, we'll send a link to the new address. Nothing changes until it is opened. When it is, you'll be signed out everywhere and sign in with the new address."
              : "We'll send a link to the new address. Nothing changes until it is opened. When it is, you'll be signed out everywhere and sign in with the new address."}
          </p>
          <TextField
            label="New email address"
            name="newEmail"
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            error={emailError}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            disabled={pending}
          />
          <PasswordField
            label="Your password"
            hint="Enter your current password to confirm it's you."
            name="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            error={passwordError}
            autoComplete="current-password"
            maxLength={128}
            disabled={pending}
          />
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" loading={pending}>
              {pending ? "Sending…" : needsApproval ? "Send for approval" : "Send confirmation link"}
            </Button>
            <Button variant="ghost" onClick={() => go("idle")} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {view === "sent" && (
        <div className="max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-bg text-info-icon">
              <MailIcon className="h-5 w-5" />
            </span>
            <Heading focus={touched}>{asked ? "Sent for approval" : "Check your inbox"}</Heading>
          </div>
          {asked ? (
            <p className="text-sm leading-relaxed text-fg-2">
              Your request to use <strong className="font-semibold wrap-break-word text-fg">{sentTo}</strong> is waiting for an
              administrator. Once they approve it, a confirmation link goes to that address. Your current address keeps working until you
              open it, and we&apos;ve let it know about the request.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-fg-2">
              If <strong className="font-semibold wrap-break-word text-fg">{sentTo}</strong> can be used, a confirmation link is on its way.
              It works once and stops working after an hour. Your current address keeps working until you open it, and we&apos;ve let it
              know about the request.
            </p>
          )}
          <Button variant="secondary" onClick={() => go("idle")}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
