"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { AddPersonDialog } from "@/components/programs/AddPersonDialog";
import type { RunChange } from "@/components/programs/ProgramPage";
import { dayText, type ProgramDetail } from "@/components/programs/model";
import {
  ACTION_TEXT,
  KIND_TEXT,
  STATE_STYLE,
  STATE_TEXT,
  actionsFor,
  whereToChange,
  type PersonAction,
  type PersonKindKey,
  type PlaceStateKey,
  type PlaceStatusKey,
} from "@/components/programs/people-model";
import { StandingDialog, type StandingAsk } from "@/components/standing/StandingDialog";
import { KIND_TEXT as STANDING_KIND_TEXT, prettyDay } from "@/components/standing/model";

// The people of a program (task 0043, slice P2): who is in it, in which group and through which branch, and what state each place is in (read from the school's own records, so the
// Students and Users pages are the one place to discipline a pupil or a member of staff). Presentation only: the API decides who sees whom and what each button may do.

type Person = {
  id: string;
  kind: PersonKindKey;
  name: string;
  admissionNo: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  branchId: string;
  branchName: string;
  groupId: string;
  groupPath: string;
  status: PlaceStatusKey;
  state: PlaceStateKey;
  standing: "ACTIVE" | "SUSPENDED" | "EXPELLED";
  standingUntil: string | null;
  joinedOn: string;
  endedOn: string | null;
  endedReason: string | null;
  linked: boolean;
  can: { suspend: boolean; remove: boolean };
};
type Page = { people: Person[]; total: number; hasNext: boolean };
type HistoryRow = { id: string; action: string; at: string; by: string; reason: string | null };
type Dialog_ =
  | { kind: "add" }
  | { kind: "move"; person: Person }
  | { kind: "place"; person: Person; action: "withdraw" | "reenrol" }
  | { kind: "edit"; person: Person }
  | { kind: "history"; person: Person };

const KIND_OPTIONS = [
  { value: "", label: "Every kind" },
  ...(Object.keys(KIND_TEXT) as PersonKindKey[]).map((value) => ({ value, label: KIND_TEXT[value] })),
];
const STATE_OPTIONS = [
  { value: "", label: "Every state" },
  ...(Object.keys(STATE_TEXT) as PlaceStateKey[]).map((value) => ({ value, label: STATE_TEXT[value] })),
];

export function ProgramPeopleTab({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const open = program.can.people;
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<Page | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<Dialog_ | null>(null);
  const [ask, setAsk] = useState<StandingAsk | null>(null);
  const base = `/api/v1/programs/${encodeURIComponent(program.id)}/people`;

  // The search applies a moment after typing stops, and any new filter starts again at the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    if (groupId) params.set("groupId", groupId);
    if (branchId) params.set("branchId", branchId);
    if (kind) params.set("kind", kind);
    if (state) params.set("state", state);
    void getJson(`${base}?${params.toString()}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The people couldn't be loaded."));
      setFailed(null);
      setLoaded({
        people: (reply.data as unknown as { people: Person[] }).people,
        total: Number(reply.meta?.total ?? 0),
        hasNext: Boolean(reply.meta?.hasNext),
      });
    });
    return () => controller.abort();
  }, [base, page, search, groupId, branchId, kind, state, version]);

  /// Something changed: the list reloads, and so does the program (the Structure tab's head counts and the audit follow it); the page says what happened. The dialog for adding
  /// stays open so several people can be added in a row; every other dialog closes.
  const added = useCallback(
    (text: string) => {
      setVersion((n) => n + 1);
      void run(async () => ({ ok: true, status: 200 }), text, "");
    },
    [run],
  );
  const changed = useCallback(
    (text: string) => {
      setDialog(null);
      setAsk(null);
      added(text);
    },
    [added],
  );

  const liveGroups = program.groups.filter((group) => !group.archived);
  const branches = program.branches.filter((branch) => program.manageBranchIds.includes(branch.id));
  const filtering = Boolean(search || groupId || branchId || kind || state);

  function perform(person: Person, action: PersonAction) {
    if (action === "move") return setDialog({ kind: "move", person });
    if (action === "withdraw" || action === "reenrol") return setDialog({ kind: "place", person, action });
    if (action === "edit") return setDialog({ kind: "edit", person });
    setAsk({ kind: action, subject: "student", endpoint: `${base}/${encodeURIComponent(person.id)}/standing`, name: person.name });
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="program-people" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-people" className="text-lg font-semibold text-fg">
            People
          </h2>
          {open && <Button onClick={() => setDialog({ kind: "add" })}>Add people</Button>}
        </div>
        <p className="text-sm text-fg-muted">
          Everyone has one place in one group, through one branch.{" "}
          {program.access === "BRANCH" ? "You see the people who are in the program through your own branch." : ""} Whether a pupil or a
          member of staff is suspended, expelled or has left the school is read from the school&apos;s own records, so it is changed on the
          Students or Users page.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextField
            label="Search people"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or admission number"
            autoComplete="off"
          />
          <SelectField
            label="Group"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setPage(1);
            }}
            options={[{ value: "", label: "Every group" }, ...liveGroups.map((g) => ({ value: g.id, label: g.path }))]}
          />
          <SelectField
            label="Branch"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            options={[{ value: "", label: "Every branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <SelectField
            label="Kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            options={KIND_OPTIONS}
          />
          <SelectField
            label="State"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
            options={STATE_OPTIONS}
          />
        </div>
        {failed && <Alert variant="error">{failed}</Alert>}
        {!loaded && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
        {loaded && loaded.people.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
            {filtering ? "No one matches." : "No one is in this program yet."}
          </p>
        )}
        {loaded && loaded.people.length > 0 && (
          <>
            <p className="text-xs text-fg-muted" aria-live="polite">
              {loaded.total} {loaded.total === 1 ? "person" : "people"}
            </p>
            <ul className="space-y-2" aria-label="People in the program">
              {loaded.people.map((person) => {
                const actions = actionsFor(person, open);
                const note = whereToChange(person);
                return (
                  <li key={person.id} className="space-y-2 rounded-xl border border-line px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-fg">
                          {person.name}{" "}
                          <span className="ml-1 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                            {KIND_TEXT[person.kind]}
                          </span>
                        </p>
                        <p className="break-words text-fg-muted">
                          {person.groupPath} · {person.branchName}
                          {person.admissionNo ? ` · ${person.admissionNo}` : ""}
                          {person.phone || person.guardianPhone ? ` · ${person.phone ?? person.guardianPhone}` : ""}
                        </p>
                        <p className="text-xs text-fg-muted">
                          Joined {dayText(person.joinedOn)}
                          {person.endedOn ? `, left ${dayText(person.endedOn)}${person.endedReason ? `: ${person.endedReason}` : ""}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATE_STYLE[person.state]}`}>
                        {person.state === "SUSPENDED" && !person.linked && person.standingUntil
                          ? `Suspended until ${prettyDay(person.standingUntil)}`
                          : STATE_TEXT[person.state]}
                      </span>
                    </div>
                    {note && <p className="text-xs text-fg-muted">{note}</p>}
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button
                          key={action}
                          variant={action === "expel" ? "danger" : "ghost"}
                          aria-label={`${labelOf(action)} ${person.name}`}
                          onClick={() => perform(person, action)}
                        >
                          {labelOf(action)}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        aria-label={`History of ${person.name}`}
                        onClick={() => setDialog({ kind: "history", person })}
                      >
                        History
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-fg-muted">Page {page}</span>
              <Button variant="secondary" disabled={!loaded.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </>
        )}
      </section>

      <AddPersonDialog
        open={dialog?.kind === "add"}
        program={program}
        onClose={() => {
          setDialog(null);
          setVersion((n) => n + 1);
        }}
        onAdded={added}
      />
      <MoveDialog
        dialog={dialog?.kind === "move" ? dialog : null}
        base={base}
        groups={liveGroups}
        onClose={() => setDialog(null)}
        onDone={changed}
      />
      <PlaceDialog
        dialog={dialog?.kind === "place" ? dialog : null}
        base={base}
        groups={liveGroups}
        onClose={() => setDialog(null)}
        onDone={changed}
      />
      <EditDialog dialog={dialog?.kind === "edit" ? dialog : null} base={base} onClose={() => setDialog(null)} onDone={changed} />
      <HistoryDialog dialog={dialog?.kind === "history" ? dialog : null} base={base} onClose={() => setDialog(null)} />
      <StandingDialog ask={ask} onClose={() => setAsk(null)} onDone={changed} />
    </div>
  );
}

const labelOf = (action: PersonAction): string =>
  action === "move"
    ? "Move"
    : action === "withdraw"
      ? "Withdraw"
      : action === "reenrol"
        ? "Re-enrol"
        : action === "edit"
          ? "Edit"
          : STANDING_KIND_TEXT[action];

type Groups = ProgramDetail["groups"];

function MoveDialog({
  dialog,
  base,
  groups,
  onClose,
  onDone,
}: {
  dialog: Extract<Dialog_, { kind: "move" }> | null;
  base: string;
  groups: Groups;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={dialog !== null} onClose={onClose} title={dialog ? `Move ${dialog.person.name}` : "Move"}>
      {dialog && <MoveBody key={dialog.person.id} person={dialog.person} base={base} groups={groups} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
function MoveBody({
  person,
  base,
  groups,
  onClose,
  onDone,
}: {
  person: Person;
  base: string;
  groups: Groups;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [groupId, setGroupId] = useState(person.groupId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const reply = await sendJson(`${base}/${encodeURIComponent(person.id)}/move`, "POST", { groupId });
    setPending(false);
    if (reply.ok) return onDone(`${person.name} was moved.`);
    setError(reply.status === 0 ? NETWORK_ERROR : say(reply, "That didn't work."));
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField
        label="New group"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        options={groups.map((g) => ({ value: g.id, label: g.path }))}
        hint="They stay in the same branch."
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} data-initial-focus>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={groupId === person.groupId}>
          Move
        </Button>
      </div>
    </form>
  );
}

function PlaceDialog({
  dialog,
  base,
  groups,
  onClose,
  onDone,
}: {
  dialog: Extract<Dialog_, { kind: "place" }> | null;
  base: string;
  groups: Groups;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={dialog !== null}
      onClose={onClose}
      title={dialog ? `${dialog.action === "withdraw" ? "Withdraw" : "Re-enrol"} ${dialog.person.name}?` : "Place"}
    >
      {dialog && (
        <PlaceBody
          key={`${dialog.person.id}:${dialog.action}`}
          person={dialog.person}
          action={dialog.action}
          base={base}
          groups={groups}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}
function PlaceBody({
  person,
  action,
  base,
  groups,
  onClose,
  onDone,
}: {
  person: Person;
  action: "withdraw" | "reenrol";
  base: string;
  groups: Groups;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [groupId, setGroupId] = useState(groups.some((g) => g.id === person.groupId) ? person.groupId : (groups[0]?.id ?? ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProblem(undefined);
    if (reason.trim().length < 3) return setProblem("Say why (at least 3 characters).");
    setPending(true);
    const reply = await sendJson(`${base}/${encodeURIComponent(person.id)}/place`, "POST", {
      action,
      reason: reason.trim(),
      ...(action === "reenrol" ? { groupId } : {}),
    });
    setPending(false);
    if (reply.ok) return onDone(action === "withdraw" ? `${person.name} has left the program.` : `${person.name} is back in the program.`);
    const fromReason = problemFor(reply, "reason");
    if (fromReason) return setProblem(fromReason);
    setError(reply.status === 0 ? NETWORK_ERROR : say(reply, "That didn't work."));
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm leading-relaxed text-fg-2">
        {action === "withdraw"
          ? `${person.name}'s place ends today. Nothing is deleted: their history stays, and you can re-enrol them later.`
          : `${person.name}'s place opens again, with the same history.`}
      </p>
      {action === "reenrol" && (
        <SelectField
          label="Group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          options={groups.map((g) => ({ value: g.id, label: g.path }))}
        />
      )}
      <TextAreaField
        label={action === "withdraw" ? "Why are they leaving?" : "Why are they coming back?"}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        hint="Kept in the history, with your name and today's date."
        error={problem}
        required
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} data-initial-focus>
          Cancel
        </Button>
        <Button type="submit" loading={pending} variant={action === "withdraw" ? "danger" : "primary"}>
          {action === "withdraw" ? "Withdraw" : "Re-enrol"}
        </Button>
      </div>
    </form>
  );
}

function EditDialog({
  dialog,
  base,
  onClose,
  onDone,
}: {
  dialog: Extract<Dialog_, { kind: "edit" }> | null;
  base: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={dialog !== null} onClose={onClose} title={dialog ? `Edit ${dialog.person.name}` : "Edit"}>
      {dialog && <EditBody key={dialog.person.id} person={dialog.person} base={base} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
function EditBody({
  person,
  base,
  onClose,
  onDone,
}: {
  person: Person;
  base: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [first, ...rest] = person.name.split(" ");
  const [v, setV] = useState({
    firstName: first ?? "",
    lastName: rest.join(" "),
    dateOfBirth: person.dateOfBirth ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    guardianName: person.guardianName ?? "",
    guardianPhone: person.guardianPhone ?? "",
  });
  const [problems, setProblems] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const child = person.kind === "CHILD";
  const set = (key: keyof typeof v, value: string) => setV((d) => ({ ...d, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProblems({});
    setPending(true);
    const orNull = (value: string) => (value.trim() === "" ? null : value.trim());
    const reply = await sendJson(`${base}/${encodeURIComponent(person.id)}`, "PATCH", {
      firstName: v.firstName,
      lastName: v.lastName,
      dateOfBirth: orNull(v.dateOfBirth),
      phone: orNull(v.phone),
      email: orNull(v.email),
      ...(child ? { guardianName: orNull(v.guardianName), guardianPhone: orNull(v.guardianPhone) } : {}),
    });
    setPending(false);
    if (reply.ok) return onDone(`${person.name}'s details were saved.`);
    const fields = ["firstName", "lastName", "dateOfBirth", "phone", "email", "guardianName", "guardianPhone"] as const;
    const found = Object.fromEntries(fields.map((f) => [f, problemFor(reply, f)]));
    if (Object.values(found).some(Boolean)) return setProblems(found);
    setError(reply.status === 0 ? NETWORK_ERROR : say(reply, "That didn't work."));
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="First name"
          value={v.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          error={problems.firstName}
          required
        />
        <TextField
          label="Last name"
          value={v.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          error={problems.lastName}
          required
        />
      </div>
      <TextField
        label={child ? "Date of birth" : "Date of birth (optional)"}
        type="date"
        value={v.dateOfBirth}
        onChange={(e) => set("dateOfBirth", e.target.value)}
        error={problems.dateOfBirth}
        required={child}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Phone (optional)"
          type="tel"
          value={v.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={problems.phone}
        />
        <TextField
          label="E-mail (optional)"
          type="email"
          value={v.email}
          onChange={(e) => set("email", e.target.value)}
          error={problems.email}
        />
      </div>
      {child && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Guardian's name"
            value={v.guardianName}
            onChange={(e) => set("guardianName", e.target.value)}
            error={problems.guardianName}
            required
          />
          <TextField
            label="Guardian's phone"
            type="tel"
            value={v.guardianPhone}
            onChange={(e) => set("guardianPhone", e.target.value)}
            error={problems.guardianPhone}
            required
          />
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} data-initial-focus>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function HistoryDialog({
  dialog,
  base,
  onClose,
}: {
  dialog: Extract<Dialog_, { kind: "history" }> | null;
  base: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={dialog !== null} onClose={onClose} title={dialog ? `History of ${dialog.person.name}` : "History"}>
      {dialog && <HistoryBody key={dialog.person.id} person={dialog.person} base={base} onClose={onClose} />}
    </Dialog>
  );
}
function HistoryBody({ person, base, onClose }: { person: Person; base: string; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${base}/${encodeURIComponent(person.id)}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
      setRows((reply.data as unknown as { history: HistoryRow[] }).history);
    });
    return () => controller.abort();
  }, [base, person.id]);
  return (
    <div className="space-y-4">
      {failed && <Alert variant="error">{failed}</Alert>}
      {!rows && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-fg-muted">Nothing has been recorded yet.</p>}
      {rows && rows.length > 0 && (
        <ol className="space-y-2 text-sm" aria-label="History">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-line px-3 py-2">
              <p className="text-fg">
                <span className="font-semibold">{row.by}</span> {ACTION_TEXT[row.action] ?? row.action.toLowerCase()}
              </p>
              <p className="text-xs text-fg-muted">
                {new Date(row.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {row.reason && <p className="mt-1 break-words text-fg-2">{row.reason}</p>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose} data-initial-focus>
          Close
        </Button>
      </div>
    </div>
  );
}
