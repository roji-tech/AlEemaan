"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import {
  announcementExpiry,
  breakAnnouncement,
  defaultBreakLabel,
  validateBreak,
  type BreakProblem,
} from "@/lib/academics/session-break-rules";

// A break inside a term or semester, and the announcement that goes with it (task 0098). Presentation only: the rules are in session-break-rules.ts (the same the server applies),
// the routes are POST /academics/periods/[id]/breaks and PATCH /academics/breaks/[id], and the announcement is the ordinary POST /announcements.

export type BreakRow = { id: string; label: string; startDate: string; endDate: string };
/// What the dialog needs of the term a break sits in.
export type BreakPeriod = {
  id: string;
  kind: "TERM" | "SEMESTER";
  label: string;
  startDate: string;
  endDate: string;
  breaks: BreakRow[];
};
export type BreakTarget = { sessionLabel: string; branchId: string; branchName: string; period: BreakPeriod; editing?: BreakRow };

const dayOf = (iso: string): string => iso.slice(0, 10);
const messageOf = (problems: readonly BreakProblem[], path: BreakProblem["path"]): string | undefined =>
  problems.find((p) => p.path === path)?.message;

export function BreakDialog({
  target,
  onClose,
  onSaved,
}: {
  target: BreakTarget | null;
  onClose: () => void;
  /// After a save. `created` is true for a new break, so the screen can offer the announcement.
  onSaved: (saved: { created: boolean; label: string; startDate: string; endDate: string }, target: BreakTarget) => Promise<void>;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? (target.editing ? `Change ${target.editing.label}` : `Add a break to the ${target.period.label}`) : "Break"}
      description={
        target
          ? `School does not run from the first to the last day, both included. It must sit inside the ${target.period.label} of ${target.sessionLabel}.`
          : undefined
      }
    >
      {target && <BreakForm key={target.editing?.id ?? target.period.id} target={target} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function BreakForm({
  target,
  onClose,
  onSaved,
}: {
  target: BreakTarget;
  onClose: () => void;
  onSaved: (saved: { created: boolean; label: string; startDate: string; endDate: string }, target: BreakTarget) => Promise<void>;
}) {
  const { period, editing } = target;
  const [label, setLabel] = useState(editing?.label ?? defaultBreakLabel(period.kind));
  const [startDate, setStartDate] = useState(editing ? dayOf(editing.startDate) : "");
  const [endDate, setEndDate] = useState(editing ? dayOf(editing.endDate) : "");
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const others = period.breaks
    .filter((b) => b.id !== editing?.id)
    .map((b) => ({ label: b.label, startDate: dayOf(b.startDate), endDate: dayOf(b.endDate) }));
  const problems = validateBreak(
    { startDate: dayOf(period.startDate), endDate: dayOf(period.endDate) },
    others,
    { label, startDate, endDate },
    `the ${period.label}`,
  );
  const shown = tried ? problems : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTried(true);
    setFailure(null);
    if (problems.length > 0) return;
    setPending(true);
    const body = { label: label.trim(), startDate, endDate };
    const reply = editing
      ? await sendJson(`/api/v1/academics/breaks/${editing.id}`, "PATCH", body)
      : await sendJson(`/api/v1/academics/periods/${period.id}/breaks`, "POST", body);
    setPending(false);
    if (!reply.ok) return setFailure(say(reply, "The break could not be saved."));
    await onSaved({ created: !editing, ...body }, target);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Name of the break"
        info="sessions.break"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={messageOf(shown, "label")}
        maxLength={60}
        disabled={pending}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First day of the break"
          type="date"
          value={startDate}
          min={dayOf(period.startDate)}
          max={dayOf(period.endDate)}
          onChange={(e) => setStartDate(e.target.value)}
          error={messageOf(shown, "startDate")}
          disabled={pending}
        />
        <TextField
          label="Last day of the break"
          type="date"
          value={endDate}
          min={dayOf(period.startDate)}
          max={dayOf(period.endDate)}
          onChange={(e) => setEndDate(e.target.value)}
          error={messageOf(shown, "endDate")}
          disabled={pending}
        />
      </div>
      {failure && <Alert variant="error">{failure}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : editing ? "Save the break" : "Add the break"}
        </Button>
      </div>
    </form>
  );
}

export type AnnounceTarget = {
  branchId: string;
  branchName: string;
  sessionLabel: string;
  periodLabel: string;
  label: string;
  startDate: string;
  endDate: string;
};

/// Offered right after a break is added: the ordinary announcement to everyone in the branch, with the text written for the person to read and change.
export function AnnounceBreakDialog({
  target,
  onClose,
  onSent,
}: {
  target: AnnounceTarget | null;
  onClose: () => void;
  /// After it is sent (the screen says so).
  onSent: (message: string) => Promise<void>;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Tell everyone about the break?"
      description={
        target
          ? `An announcement for everyone in ${target.branchName}: staff, pupils and parents. You can change the words first, or send nothing.`
          : undefined
      }
    >
      {target && <AnnounceForm key={`${target.branchId}-${target.startDate}`} target={target} onClose={onClose} onSent={onSent} />}
    </Dialog>
  );
}

function AnnounceForm({
  target,
  onClose,
  onSent,
}: {
  target: AnnounceTarget;
  onClose: () => void;
  onSent: (message: string) => Promise<void>;
}) {
  const draft = breakAnnouncement({ ...target, startDate: dayOf(target.startDate), endDate: dayOf(target.endDate) });
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [pinned, setPinned] = useState(false);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const titleProblem = !title.trim() ? "Write a title." : title.length > 200 ? "Use 200 characters or fewer." : undefined;
  const bodyProblem = !body.trim() ? "Write the announcement." : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTried(true);
    setFailure(null);
    if (titleProblem || bodyProblem) return;
    setPending(true);
    const reply = await sendJson("/api/v1/announcements", "POST", {
      branchId: target.branchId,
      title: title.trim(),
      body: body.trim(),
      targetRoles: [],
      status: "PUBLISHED",
      isPinned: pinned,
      // It stops showing at the end of the day classes resume.
      expiresAt: announcementExpiry(dayOf(target.endDate)),
    });
    setPending(false);
    if (!reply.ok) return setFailure(say(reply, "The announcement could not be sent."));
    await onSent(`Announcement sent to everyone in ${target.branchName}.`);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={tried ? titleProblem : undefined}
        maxLength={200}
        disabled={pending}
        autoComplete="off"
      />
      <TextAreaField
        label="Announcement"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={tried ? bodyProblem : undefined}
        rows={5}
        disabled={pending}
      />
      <CheckboxField
        label="Keep it at the top of the announcements"
        checked={pinned}
        onChange={(e) => setPinned(e.target.checked)}
        disabled={pending}
      />
      {failure && <Alert variant="error">{failure}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Not now
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Sending…" : "Send the announcement"}
        </Button>
      </div>
    </form>
  );
}
