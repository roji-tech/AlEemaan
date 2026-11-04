"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson } from "@/components/auth/postJson";
import { KIND_TEXT, explain, type StandingKind, type StandingSubject } from "./model";

// Suspend, lift, expel, terminate or reinstate one person (task 0045). The same dialog for a pupil and for a member of staff: it says what the action does before anyone confirms
// it, asks for the reason (kept in the history), and for a suspension the last day. The server decides who may; this only asks and shows what it says.

export type StandingAsk = {
  kind: StandingKind;
  subject: StandingSubject;
  /// `POST` target, e.g. `/api/v1/students/<id>/standing`.
  endpoint: string;
  name: string;
  /// Staff only: a super admin may apply it in every branch the person belongs to.
  canSchoolWide?: boolean;
};

const REASON_LABEL: Record<StandingKind, string> = {
  suspend: "Why are you suspending them?",
  lift: "Why are you lifting it?",
  expel: "Why are you expelling them?",
  terminate: "Why are you terminating them?",
  reinstate: "Why are you reinstating them?",
};

export function StandingDialog({
  ask,
  onClose,
  onDone,
}: {
  ask: StandingAsk | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={ask !== null} onClose={onClose} title={ask ? `${KIND_TEXT[ask.kind]} ${ask.name}?` : "Standing"}>
      {ask && <Body key={`${ask.endpoint}:${ask.kind}`} ask={ask} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

const DONE_TEXT: Record<StandingKind, string> = {
  suspend: "suspended",
  lift: "no longer suspended",
  expel: "expelled",
  terminate: "terminated",
  reinstate: "reinstated",
};

function Body({ ask, onClose, onDone }: { ask: StandingAsk; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [schoolWide, setSchoolWide] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ reason?: string; until?: string }>({});
  const destructive = ask.kind === "expel" || ask.kind === "terminate";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setProblems({});
    if (reason.trim().length < 3) return setProblems({ reason: "Say why (at least 3 characters)." });
    setPending(true);
    const reply = await sendJson(ask.endpoint, "POST", {
      action: ask.kind,
      reason: reason.trim(),
      ...(ask.kind === "suspend" && until ? { until } : {}),
      ...(ask.subject === "staff" ? { scope: schoolWide ? "SCHOOL" : "BRANCH" } : {}),
    });
    setPending(false);
    if (reply.ok) return onDone(`${ask.name} is ${DONE_TEXT[ask.kind]}.`);
    const fromReason = problemFor(reply, "reason");
    const fromUntil = problemFor(reply, "until");
    if (fromReason || fromUntil) return setProblems({ reason: fromReason, until: fromUntil });
    if (reply.status === 401) setError(SESSION_ENDED);
    else if (reply.status === 429) setError(RATE_LIMITED);
    else if (reply.status === 0) setError(NETWORK_ERROR);
    else setError(reply.message ?? "That didn't work. Please try again.");
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm leading-relaxed text-fg-2">{explain(ask.kind, ask.subject, ask.name)}</p>
      <TextAreaField
        label={REASON_LABEL[ask.kind]}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        hint="Kept in the history, with your name and today's date."
        error={problems.reason}
        required
      />
      {ask.kind === "suspend" && (
        <TextField
          label="Last day of the suspension"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          hint="Leave it empty to suspend until you lift it yourself."
          error={problems.until}
        />
      )}
      {ask.subject === "staff" && ask.canSchoolWide && (
        <CheckboxField
          label="Everywhere in the school (every branch this person belongs to)"
          checked={schoolWide}
          onChange={(e) => setSchoolWide(e.target.checked)}
        />
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending} data-initial-focus>
          Cancel
        </Button>
        <Button type="submit" variant={destructive ? "danger" : "primary"} loading={pending}>
          {pending ? "Saving…" : KIND_TEXT[ask.kind]}
        </Button>
      </div>
    </form>
  );
}
