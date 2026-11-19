"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { InfoTip } from "@/components/ui/InfoTip";
import { CalendarIcon } from "@/components/ui/icons";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";
import { EditDatesDialog, PeriodDatesFields, problemAt } from "@/components/academics/SessionDates";
import { SessionTerms, day } from "@/components/academics/SessionTerms";
import { SessionTimeline } from "@/components/academics/SessionTimeline";
import {
  AnnounceBreakDialog,
  BreakDialog,
  type AnnounceTarget,
  type BreakRow,
  type BreakTarget,
} from "@/components/academics/BreakDialogs";
import {
  COUNTS,
  defaultSchedule,
  kindNoun,
  periodLabel,
  usualCount,
  validateSchedule,
  type PeriodDates,
  type PeriodKindName,
} from "@/lib/academics/session-schedule";
import { suggestSession } from "@/lib/academics/session-suggest";

// The Sessions tab of Academics (task 0093): a school year with its terms. Presentation only - the academics API checks who may change what and audits every change; each outcome
// (a name that already exists, a signed-out person, a lost connection) has its own honest message.

type Status = "PLANNED" | "ACTIVE" | "CLOSED";
type Period = {
  id: string;
  kind: PeriodKindName;
  label: string;
  ordinal: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  breaks: BreakRow[];
};
type SessionRow = { id: string; branchId: string; label: string; startDate: string; endDate: string; status: Status; periods: Period[] };
type Action =
  | { kind: "create" }
  | { kind: "rename"; session: SessionRow }
  | { kind: "dates"; session: SessionRow }
  | { kind: "removeBreak"; session: SessionRow; period: Period; brk: BreakRow }
  | { kind: "activate"; session: SessionRow }
  | { kind: "close"; session: SessionRow }
  | null;

const ORDER: Record<Status, number> = { ACTIVE: 0, PLANNED: 1, CLOSED: 2 };
const STATUS_TEXT: Record<Status, string> = { ACTIVE: "Active", PLANNED: "Planned", CLOSED: "Closed" };
const STATUS_STYLE: Record<Status, string> = {
  ACTIVE: "border-ok-line bg-ok-bg text-ok-fg",
  PLANNED: "border-info-line bg-info-bg text-info-fg",
  CLOSED: "border-line bg-surface-2 text-fg-muted",
};
function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_TEXT[status]}</span>;
}

export function SessionsPanel({
  branches,
  branchId,
  onBranchChange,
  autoNew = false,
  onAutoNewDone,
}: {
  branches: BranchChoice[];
  branchId: string;
  onBranchChange: (id: string) => void;
  /// Open the New session form at once (a shortcut from the Overview). Used once.
  autoNew?: boolean;
  onAutoNewDone?: () => void;
}) {
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [everySession, setEverySession] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [action, setAction] = useState<Action>(autoNew && branch.canEdit ? { kind: "create" } : null);

  useEffect(() => {
    if (autoNew) onAutoNewDone?.();
  }, [autoNew, onAutoNewDone]);

  const load = useCallback(async () => {
    // All the sessions of every branch the person may see, in one request: the form that creates for several branches needs to know which already have the name or an active one.
    const reply = await getJson("/api/v1/academics/sessions");
    if (!reply.ok) {
      setError(say(reply, "Couldn't load the sessions."));
      return;
    }
    setError(null);
    setEverySession(reply.data!.sessions as SessionRow[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when the panel opens is exactly what this effect is for
    void load();
  }, [load]);

  const byBranch = new Map<string, SessionRow[]>();
  for (const row of everySession ?? []) byBranch.set(row.branchId, [...(byBranch.get(row.branchId) ?? []), row]);
  const sessions =
    everySession === null
      ? null
      : (byBranch.get(branchId) ?? []).slice().sort((x, y) => ORDER[x.status] - ORDER[y.status] || y.startDate.localeCompare(x.startDate));

  const active = sessions?.find((s) => s.status === "ACTIVE") ?? null;

  async function change(session: SessionRow, body: { status?: Status; label?: string }, done: string): Promise<Reply> {
    const reply = await sendJson(`/api/v1/academics/sessions/${session.id}`, "PATCH", body);
    setNotice(reply.ok ? { variant: "success", text: done } : { variant: "error", text: say(reply, "That didn't work.") });
    if (reply.ok) setAction(null);
    await load();
    return reply;
  }
  // Breaks (task 0098): the one being added or changed, and the announcement offered once a new one is saved.
  const [breakTarget, setBreakTarget] = useState<BreakTarget | null>(null);
  const [announce, setAnnounce] = useState<AnnounceTarget | null>(null);
  const breakTargetOf = (session: SessionRow, period: Period, editing?: BreakRow): BreakTarget => ({
    sessionLabel: session.label,
    branchId: session.branchId,
    branchName: branch.name,
    period,
    editing,
  });
  // The term being made current right now: its button shows it, and no second change starts until this one is answered.
  const [settingTerm, setSettingTerm] = useState<string | null>(null);
  // The moment the cards are drawn for (Upcoming, Ended, the timeline); read once, when the panel opens.
  const [now] = useState(() => new Date());
  async function makeCurrent(session: SessionRow, period: Period) {
    if (settingTerm) return;
    setSettingTerm(period.id);
    const reply = await sendJson(`/api/v1/academics/periods/${period.id}`, "PATCH", { branchId, isCurrent: true });
    setNotice(
      reply.ok
        ? { variant: "success", text: `${period.label} is now the current ${kindNoun(period.kind)} of ${session.label}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
    setSettingTerm(null);
  }

  return (
    <div className="space-y-6">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setNotice(null);
          onBranchChange(id);
        }}
      />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="sessions-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="sessions-heading" className="text-lg font-semibold tracking-tight text-fg">
                Academic sessions
              </h2>
              <InfoTip tip="academics.sessions" />
            </div>
            <p className="mt-1 max-w-prose text-sm text-fg-muted">The school years of this branch, each with its terms.</p>
          </div>
          {branch.canEdit && <Button onClick={() => setAction({ kind: "create" })}>New session</Button>}
        </div>

        {sessions !== null && !active && (
          <Alert variant="warning">
            {branch.name} has no active session, so pupils can&apos;t be placed in a class yet.{" "}
            {branch.canEdit
              ? sessions.length === 0
                ? "Create the first one with New session."
                : "Make one active below, or create a new one."
              : "Ask an administrator of this branch to start one."}
          </Alert>
        )}

        <Collection
          label="Academic sessions"
          view="list"
          state={sessions === null ? "loading" : sessions.length === 0 ? "empty" : "ready"}
          emptyText={branch.canEdit ? "No sessions yet. Create the first one to start placing pupils in classes." : "No sessions yet."}
        >
          {(sessions ?? []).map((s) => {
            const current = s.periods.find((p) => p.isCurrent);
            // Terms or semesters: the words follow what the session is made of.
            const noun = kindNoun(s.periods[0]?.kind ?? "TERM");
            return (
              <Item
                key={s.id}
                leading={
                  <ItemTile>
                    <CalendarIcon className="h-5 w-5" />
                  </ItemTile>
                }
                title={s.label}
                badges={<StatusBadge status={s.status} />}
                actions={
                  branch.canEdit
                    ? [
                        s.status === "ACTIVE"
                          ? {
                              id: "close",
                              label: "Close session",
                              ariaLabel: `Close ${s.label}`,
                              onClick: () => setAction({ kind: "close", session: s }),
                            }
                          : {
                              id: "activate",
                              label: "Make active",
                              ariaLabel: `Make ${s.label} the active session`,
                              variant: s.status === "PLANNED" ? "primary" : "secondary",
                              onClick: () => setAction({ kind: "activate", session: s }),
                            },
                        {
                          id: "dates",
                          label: "Edit dates",
                          ariaLabel: `Edit the dates of ${s.label}`,
                          variant: "ghost",
                          onClick: () => setAction({ kind: "dates", session: s }),
                        },
                        {
                          id: "rename",
                          label: "Rename",
                          ariaLabel: `Rename ${s.label}`,
                          variant: "ghost",
                          onClick: () => setAction({ kind: "rename", session: s }),
                        },
                      ]
                    : undefined
                }
                below={
                  <div className="space-y-4">
                    <SessionTimeline status={s.status} periods={s.periods} startDate={s.startDate} endDate={s.endDate} now={now} />
                    <SessionTerms
                      sessionLabel={s.label}
                      sessionStatus={s.status}
                      periods={s.periods}
                      canEdit={branch.canEdit}
                      settingTerm={settingTerm}
                      now={now}
                      onMakeCurrent={(p) => makeCurrent(s, p)}
                      onAddBreak={(p) => setBreakTarget(breakTargetOf(s, p))}
                      onChangeBreak={(p, b) => setBreakTarget(breakTargetOf(s, p, b))}
                      onRemoveBreak={(p, b) => setAction({ kind: "removeBreak", session: s, period: p, brk: b })}
                    />
                  </div>
                }
              >
                <p className="text-fg-2">
                  {day(s.startDate)} to {day(s.endDate)}
                  <span className="text-fg-muted">
                    {" "}
                    · {s.periods.length}{" "}
                    {noun === "semester" ? (s.periods.length === 1 ? "semester" : "semesters") : s.periods.length === 1 ? "term" : "terms"}
                  </span>
                </p>
                <p className="mt-0.5 text-fg-muted">
                  Current {noun}: <span className="font-semibold text-fg">{current ? current.label : "none"}</span>
                </p>
              </Item>
            );
          })}
        </Collection>
      </section>

      <CreateDialog
        open={action?.kind === "create"}
        branches={branches.filter((b) => b.canEdit)}
        currentBranchId={branchId}
        byBranch={byBranch}
        onClose={() => setAction(null)}
        onChanged={load}
        onCreated={async (label, madeActive, names) => {
          setAction(null);
          setNotice({
            variant: "success",
            text:
              names.length === 1
                ? madeActive
                  ? `${label} created and made the active session.`
                  : `${label} created.`
                : `${label} created in ${names.length} branches${madeActive ? " and made the active session there" : ""}: ${names.join(", ")}.`,
          });
          await load();
        }}
      />
      <EditDatesDialog
        open={action?.kind === "dates"}
        session={action?.kind === "dates" ? action.session : null}
        onClose={() => setAction(null)}
        onSaved={async (text) => {
          setAction(null);
          setNotice({ variant: "success", text });
          await load();
        }}
      />
      <BreakDialog
        target={breakTarget}
        onClose={() => setBreakTarget(null)}
        onSaved={async (saved, t) => {
          setBreakTarget(null);
          setNotice({
            variant: "success",
            text: saved.created ? `${saved.label} added to the ${t.period.label}.` : `${saved.label} saved.`,
          });
          await load();
          // A new break is worth telling everyone about: offer the announcement (the person may send nothing).
          if (saved.created)
            setAnnounce({
              branchId: t.branchId,
              branchName: t.branchName,
              sessionLabel: t.sessionLabel,
              periodLabel: t.period.label,
              label: saved.label,
              startDate: saved.startDate,
              endDate: saved.endDate,
            });
        }}
      />
      <AnnounceBreakDialog
        target={announce}
        onClose={() => setAnnounce(null)}
        onSent={async (text) => {
          setAnnounce(null);
          setNotice({ variant: "success", text });
        }}
      />
      <ConfirmDialog
        open={action?.kind === "removeBreak"}
        title={action?.kind === "removeBreak" ? `Remove ${action.brk.label}?` : "Remove break"}
        confirmLabel="Remove the break"
        onClose={() => setAction(null)}
        onConfirm={async () => {
          if (action?.kind !== "removeBreak") return null;
          const reply = await sendJson(`/api/v1/academics/breaks/${action.brk.id}`, "DELETE", undefined);
          setNotice(
            reply.ok
              ? { variant: "success", text: `${action.brk.label} removed.` }
              : { variant: "error", text: say(reply, "That didn't work.") },
          );
          if (reply.ok) setAction(null);
          await load();
          return reply;
        }}
      >
        {action?.kind === "removeBreak" && (
          <p>
            Classes will run on those days again. An announcement already sent about {action.brk.label} is not withdrawn: post a new one if
            the dates changed.
          </p>
        )}
      </ConfirmDialog>
      <RenameDialog
        open={action?.kind === "rename"}
        session={action?.kind === "rename" ? action.session : null}
        onClose={() => setAction(null)}
        onSubmit={(session, label) => change(session, { label }, `${label} saved.`)}
      />
      <ConfirmDialog
        open={action?.kind === "activate"}
        title={action?.kind === "activate" ? `Make ${action.session.label} the active session?` : "Make active"}
        confirmLabel="Make active"
        onClose={() => setAction(null)}
        onConfirm={() =>
          action?.kind === "activate"
            ? change(action.session, { status: "ACTIVE" }, `${action.session.label} is now the active session of ${branch.name}.`)
            : Promise.resolve(null)
        }
      >
        {action?.kind === "activate" && (
          <>
            <p>Pupils are placed in classes for the active session.</p>
            {active && active.id !== action.session.id && (
              <p className="mt-2">
                <strong>{active.label}</strong> is the active session now and will be closed. Nothing is deleted.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={action?.kind === "close"}
        title={action?.kind === "close" ? `Close ${action.session.label}?` : "Close session"}
        confirmLabel="Close session"
        onClose={() => setAction(null)}
        onConfirm={() =>
          action?.kind === "close"
            ? change(action.session, { status: "CLOSED" }, `${action.session.label} is closed.`)
            : Promise.resolve(null)
        }
      >
        <p>
          {branch.name} will have no active session until you make another one active, and pupils can&apos;t be placed in a class meanwhile.
          Nothing is deleted, and you can make this session active again.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  confirmLabel,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<Reply | null>;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && (
        <div className="space-y-4 text-sm text-fg-2">
          <div>{children}</div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" data-initial-focus onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (pending) return;
                setPending(true);
                await onConfirm();
                setPending(false);
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function RenameDialog({
  open,
  session,
  onClose,
  onSubmit,
}: {
  open: boolean;
  session: SessionRow | null;
  onClose: () => void;
  onSubmit: (session: SessionRow, label: string) => Promise<Reply>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={session ? `Rename ${session.label}` : "Rename session"}>
      {open && session && <RenameForm key={session.id} session={session} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function RenameForm({
  session,
  onClose,
  onSubmit,
}: {
  session: SessionRow;
  onClose: () => void;
  onSubmit: (session: SessionRow, label: string) => Promise<Reply>;
}) {
  const [label, setLabel] = useState(session.label);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = label.trim();
    if (trimmed.length < 4) return setProblem("Use at least 4 characters, for example 2026/2027.");
    setProblem(null);
    setPending(true);
    const reply = await onSubmit(session, trimmed);
    setPending(false);
    if (!reply.ok) setProblem(problemFor(reply, "label") ?? say(reply, "That didn't work."));
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Session name"
        name="label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={problem}
        maxLength={30}
        disabled={pending}
        autoComplete="off"
      />
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function CreateDialog({
  open,
  branches,
  currentBranchId,
  byBranch,
  onClose,
  onChanged,
  onCreated,
}: {
  open: boolean;
  /// The branches the person may create sessions in.
  branches: BranchChoice[];
  currentBranchId: string;
  byBranch: Map<string, SessionRow[]>;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreated: (label: string, madeActive: boolean, branchNames: string[]) => Promise<void>;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New academic session"
      description={
        branches.length > 1
          ? "For one branch or several at once. The terms or semesters are made with the session."
          : `For ${branches[0]?.name ?? "this branch"}. The terms or semesters are made with the session.`
      }
    >
      {open && (
        <CreateForm
          key="create"
          branches={branches}
          currentBranchId={currentBranchId}
          byBranch={byBranch}
          onClose={onClose}
          onChanged={onChanged}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  );
}

type Problems = { label?: string; startDate?: string; endDate?: string; branches?: string; form?: string };

function CreateForm({
  branches,
  currentBranchId,
  byBranch,
  onClose,
  onChanged,
  onCreated,
}: {
  branches: BranchChoice[];
  currentBranchId: string;
  byBranch: Map<string, SessionRow[]>;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreated: (label: string, madeActive: boolean, branchNames: string[]) => Promise<void>;
}) {
  const labelsOf = (id: string) => new Set((byBranch.get(id) ?? []).map((s) => s.label));
  const activeOf = (id: string) => (byBranch.get(id) ?? []).find((s) => s.status === "ACTIVE")?.label ?? null;
  const several = branches.length > 1;
  const firstChoice = branches.some((b) => b.id === currentBranchId) ? currentBranchId : (branches[0]?.id ?? "");

  // The suggestion is read once, when the form opens: the next school year the branch being looked at does not have yet.
  const [suggested] = useState(() => suggestSession(new Date(), [...labelsOf(firstChoice)]));
  const [label, setLabel] = useState(suggested.label);
  const [startDate, setStartDate] = useState(suggested.startDate);
  const [endDate, setEndDate] = useState(suggested.endDate);
  // Terms or semesters, and how many (task 0097). It starts at the usual number of the branch being looked at (3, or 2 for the Arabic branches); the same choice is made for every branch chosen.
  const [kind, setKind] = useState<PeriodKindName>("TERM");
  const [count, setCount] = useState(() => String(usualCount(branches.find((b) => b.id === firstChoice)?.name ?? "")));
  // The dates of each term: shared equally from the session's days until the person changes one (`custom`); changing the session's days or the number of terms shares them equally again.
  const [custom, setCustom] = useState<PeriodDates[] | null>(null);
  const [chosen, setChosen] = useState<string[]>(firstChoice ? [firstChoice] : []);
  // With no active session the new one should be it (that is what unblocks the pupils); with one, an explicit choice that closes it.
  const [makeActive, setMakeActive] = useState(activeOf(firstChoice) === null);
  const [problems, setProblems] = useState<Problems>({});
  // The date checks run as the person types, but their messages appear only after the first try to create.
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);

  const periodCount = kind === "SEMESTER" ? 2 : Number(count);
  const rows = custom ?? defaultSchedule(startDate, endDate, periodCount);
  const names = rows.map((_, i) => periodLabel(kind, i + 1));
  const dateProblems = validateSchedule({ startDate, endDate }, rows, names);
  // With no usable session dates there are no rows yet; the session's own messages say what is missing.
  const visibleProblems = tried ? dateProblems.filter((p) => p.path !== "periods" || rows.length > 0) : [];

  const trimmed = label.trim();
  // A branch that already has a session of this name is left out (the server would refuse it): the list says so beside it.
  const has = (id: string) => labelsOf(id).has(trimmed);
  const targets = branches.filter((b) => chosen.includes(b.id) && !has(b.id));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found: Problems = {};
    if (trimmed.length < 4) found.label = "Use at least 4 characters, for example 2026/2027.";
    if (targets.length === 0)
      found.branches = several
        ? "Choose at least one branch that does not have this session yet."
        : "This branch already has a session with this name.";
    setTried(true);
    setProblems(found);
    if (Object.keys(found).length > 0 || dateProblems.length > 0) return;

    setPending(true);
    const made: string[] = [];
    const failed: { branch: BranchChoice; why: string }[] = [];
    for (const b of targets) {
      const reply = await sendJson("/api/v1/academics/sessions", "POST", {
        branchId: b.id,
        label: trimmed,
        startDate,
        endDate,
        kind,
        periods: rows,
        status: makeActive ? "ACTIVE" : "PLANNED",
      });
      if (reply.ok) {
        made.push(b.name);
        continue;
      }
      // The same rules apply to every branch: a refusal of the name or the dates on the first one is the form's, and nothing has been created.
      const field = { label: problemFor(reply, "label"), startDate: problemFor(reply, "startDate"), endDate: problemFor(reply, "endDate") };
      if (made.length === 0 && failed.length === 0 && (field.label || field.startDate || field.endDate)) {
        setPending(false);
        setProblems(field);
        return;
      }
      failed.push({ branch: b, why: reply.status === 409 ? "already has a session with this name" : say(reply, "That didn't work.") });
    }

    if (failed.length === 0) {
      await onCreated(trimmed, makeActive, made);
      return;
    }
    // Some were created and some were not: say which, keep the form open on the ones that failed, and show the new state behind it.
    await onChanged();
    setChosen(failed.map((f) => f.branch.id));
    setPending(false);
    setProblems({
      form: `${made.length > 0 ? `Created in ${made.join(", ")}. ` : ""}Not created: ${failed.map((f) => `${f.branch.name} (${f.why})`).join("; ")}.`,
    });
  }

  const toggle = (id: string, on: boolean) => setChosen((all) => (on ? [...new Set([...all, id])] : all.filter((x) => x !== id)));

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {several && (
        <fieldset className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Branches</legend>
              <InfoTip tip="sessions.branches" />
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => setChosen(branches.map((b) => b.id))} disabled={pending}>
                Select all
              </Button>
              <Button variant="ghost" onClick={() => setChosen([])} disabled={pending}>
                Clear
              </Button>
            </div>
          </div>
          {branches.map((b) => {
            const exists = has(b.id);
            const current = activeOf(b.id);
            return (
              <div key={b.id}>
                <CheckboxField
                  label={b.name}
                  checked={chosen.includes(b.id) && !exists}
                  onChange={(e) => toggle(b.id, e.target.checked)}
                  disabled={pending || exists}
                />
                {(exists || (makeActive && current)) && (
                  <p className="-mt-1 mb-1 ml-8 text-xs text-fg-muted">
                    {exists ? `Already has ${trimmed}; left out.` : `${current} is the active session there now and will be closed.`}
                  </p>
                )}
              </div>
            );
          })}
          {problems.branches && <p className="text-xs text-danger-fg">{problems.branches}</p>}
        </fieldset>
      )}
      <TextField
        label="Session name"
        name="label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={problems.label}
        hint="For example 2026/2027."
        maxLength={30}
        disabled={pending}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First day"
          info="sessions.dates"
          name="startDate"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setCustom(null);
          }}
          error={problemAt(visibleProblems, "session.startDate") ?? problems.startDate}
          disabled={pending}
        />
        <TextField
          label="Last day"
          name="endDate"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setCustom(null);
          }}
          error={problemAt(visibleProblems, "session.endDate") ?? problems.endDate}
          disabled={pending}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="The year is divided into"
          info="sessions.kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as PeriodKindName);
            setCustom(null);
          }}
          disabled={pending}
          options={[
            { value: "TERM", label: "Terms" },
            { value: "SEMESTER", label: "Semesters" },
          ]}
        />
        <SelectField
          label={kind === "SEMESTER" ? "Number of semesters" : "Number of terms"}
          info="sessions.terms"
          value={String(periodCount)}
          onChange={(e) => {
            setCount(e.target.value);
            setCustom(null);
          }}
          disabled={pending || COUNTS[kind].length === 1}
          options={COUNTS[kind].map((n) => ({ value: String(n), label: `${n} ${kindNoun(kind, true)}` }))}
        />
      </div>
      {rows.length > 0 ? (
        <PeriodDatesFields
          legend={`Dates of each ${kindNoun(kind)}`}
          names={names}
          rows={rows}
          problems={visibleProblems}
          disabled={pending}
          onChange={(i, field, value) => setCustom(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)))}
          onReset={custom ? () => setCustom(null) : undefined}
        />
      ) : (
        <p className="text-xs text-fg-muted">Choose the first and last day of the session to see the dates of each {kindNoun(kind)}.</p>
      )}
      <div>
        <CheckboxField
          label="Make this the active session now"
          checked={makeActive}
          onChange={(e) => setMakeActive(e.target.checked)}
          disabled={pending}
        />
        {!several && makeActive && activeOf(firstChoice) && (
          <p className="mt-1 ml-8 text-xs text-fg-muted">{activeOf(firstChoice)} is the active session now and will be closed.</p>
        )}
        {!makeActive && (
          <p className="mt-1 ml-8 text-xs text-fg-muted">Until a session is active, pupils can&apos;t be placed in a class.</p>
        )}
      </div>
      {!several && problems.branches && <Alert variant="error">{problems.branches}</Alert>}
      {problems.form && <Alert variant="error">{problems.form}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : several && targets.length > 1 ? `Create in ${targets.length} branches` : "Create session"}
        </Button>
      </div>
    </form>
  );
}
