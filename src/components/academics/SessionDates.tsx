"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { InfoTip } from "@/components/ui/InfoTip";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { validateSchedule, type PeriodDates, type ScheduleProblem } from "@/lib/academics/session-schedule";

// The dates of a session and of its terms or semesters (task 0097): the rows shared by the New session form and the "Edit dates" dialog, and the dialog itself. Presentation only: the rules are
// in session-schedule.ts (the same ones the server applies), and PUT /api/v1/academics/sessions/[id]/schedule is the authority.

/// The message for one field (`session.endDate`, `periods.1.startDate`), if there is one.
export const problemAt = (problems: readonly ScheduleProblem[], path: string): string | undefined =>
  problems.find((p) => p.path === path)?.message;

/// One row per term or semester: its first and last day. Editing a date calls `onChange`; `onReset` (shown only once the person has changed something) goes back to equal shares.
export function PeriodDatesFields({
  legend,
  names,
  rows,
  problems,
  disabled,
  onChange,
  onReset,
}: {
  legend: string;
  names: readonly string[];
  rows: readonly PeriodDates[];
  problems: readonly ScheduleProblem[];
  disabled?: boolean;
  onChange: (index: number, field: keyof PeriodDates, value: string) => void;
  onReset?: () => void;
}) {
  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">{legend}</legend>
          <InfoTip tip="sessions.periodDates" />
        </div>
        {onReset && (
          <Button variant="ghost" onClick={onReset} disabled={disabled}>
            Share the days equally
          </Button>
        )}
      </div>
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface-2/50 p-3">
          <p className="mb-2 text-sm font-semibold text-fg">{names[i]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={`${names[i]} starts`}
              type="date"
              value={row.startDate}
              onChange={(e) => onChange(i, "startDate", e.target.value)}
              error={problemAt(problems, `periods.${i}.startDate`)}
              disabled={disabled}
            />
            <TextField
              label={`${names[i]} ends`}
              type="date"
              value={row.endDate}
              onChange={(e) => onChange(i, "endDate", e.target.value)}
              error={problemAt(problems, `periods.${i}.endDate`)}
              disabled={disabled}
            />
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export type EditableSession = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  periods: { id: string; label: string; startDate: string; endDate: string }[];
};

/// A stored date (an ISO timestamp at midnight UTC) as the calendar day the date inputs use.
const dayOf = (iso: string): string => iso.slice(0, 10);

export function EditDatesDialog({
  open,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  session: EditableSession | null;
  onClose: () => void;
  /// Called after the dates are saved (the panel shows its message and reloads).
  onSaved: (message: string) => Promise<void>;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={session ? `Dates of ${session.label}` : "Dates"}
      description="The first and last day of the session and of each term or semester."
    >
      {open && session && <EditDatesForm key={session.id} session={session} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditDatesForm({
  session,
  onClose,
  onSaved,
}: {
  session: EditableSession;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(dayOf(session.startDate));
  const [endDate, setEndDate] = useState(dayOf(session.endDate));
  const [rows, setRows] = useState<PeriodDates[]>(
    session.periods.map((p) => ({ startDate: dayOf(p.startDate), endDate: dayOf(p.endDate) })),
  );
  const [shown, setShown] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const names = session.periods.map((p) => p.label);
  // The checks run as the person types, but the messages appear only after the first Save: no red on a form that has just opened.
  const problems = validateSchedule({ startDate, endDate }, rows, names);
  const unchanged =
    startDate === dayOf(session.startDate) &&
    endDate === dayOf(session.endDate) &&
    rows.every((r, i) => r.startDate === dayOf(session.periods[i].startDate) && r.endDate === dayOf(session.periods[i].endDate));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setShown(true);
    setFailure(null);
    if (problems.length > 0) return;
    if (unchanged) return onClose();
    setPending(true);
    const reply = await sendJson(`/api/v1/academics/sessions/${session.id}/schedule`, "PUT", {
      startDate,
      endDate,
      periods: rows.map((r, i) => ({ id: session.periods[i].id, startDate: r.startDate, endDate: r.endDate })),
    });
    setPending(false);
    if (!reply.ok) return setFailure(say(reply, "The dates could not be saved."));
    await onSaved(`The dates of ${session.label} are saved.`);
  }

  const visible = shown ? problems : [];
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First day"
          info="sessions.dates"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={problemAt(visible, "session.startDate")}
          disabled={pending}
        />
        <TextField
          label="Last day"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={problemAt(visible, "session.endDate")}
          disabled={pending}
        />
      </div>
      <PeriodDatesFields
        legend="Each term or semester"
        names={names}
        rows={rows}
        problems={visible}
        disabled={pending}
        onChange={(i, field, value) => setRows((all) => all.map((r, j) => (j === i ? { ...r, [field]: value } : r)))}
      />
      {failure && <Alert variant="error">{failure}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : "Save dates"}
        </Button>
      </div>
    </form>
  );
}
