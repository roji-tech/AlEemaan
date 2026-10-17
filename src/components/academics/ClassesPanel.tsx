"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// The Academics page's lists and dialogs (Slice P1): classes with their arms and subjects, and the branch's subjects. Presentation only - the academics API
// enforces who may read and change what, and every outcome (duplicate name, archived parent, signed out, offline) has its own honest message.

type Arm = { id: string; name: string; capacity: number | null; archivedAt: string | null; enrolments: number };
type ClassGroup = { id: string; name: string; sortOrder: number; archivedAt: string | null; subjectIds: string[]; arms: Arm[] };
type Subject = { id: string; name: string; code: string | null; archivedAt: string | null };
type Editing =
  | { kind: "class"; item: ClassGroup | null }
  | { kind: "arm"; classGroup: ClassGroup; item: Arm | null }
  | { kind: "subject"; item: Subject | null }
  | { kind: "offerings"; classGroup: ClassGroup }
  | null;

export function ClassesPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [groups, setGroups] = useState<ClassGroup[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([
      getJson(`/api/v1/academics/class-groups?branchId=${encodeURIComponent(branchId)}`),
      getJson(`/api/v1/academics/subjects?branchId=${encodeURIComponent(branchId)}`),
    ]);
    if (!g.ok || !s.ok) {
      setError(say(g.ok ? s : g, "Couldn't load this branch."));
      return;
    }
    setError(null);
    setGroups(g.data!.classGroups as ClassGroup[]);
    setUnmatched(g.data!.unmatchedEnrolments as number);
    setSubjects(s.data!.subjects as Subject[]);
  }, [branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on a branch change is exactly what this effect is for
    setGroups(null);
    setSubjects(null);
    void load();
  }, [load]);

  async function archive(path: string, archived: boolean, what: string) {
    const reply = await sendJson(path, "PATCH", { archived });
    setNotice(
      reply.ok
        ? { variant: "success", text: `${what} ${archived ? "archived" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }
  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="space-y-8">
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setNotice(null);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="classes-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="classes-heading" className="text-lg font-semibold tracking-tight text-fg">
            Classes and arms
          </h2>
          {branch.canEdit && <Button onClick={() => setEditing({ kind: "class", item: null })}>New class</Button>}
        </div>
        {unmatched > 0 && (
          <p className="mt-2 text-sm text-fg-muted">
            {unmatched} {unmatched === 1 ? "enrolment names" : "enrolments name"} a class or arm that isn&apos;t set up here yet.
          </p>
        )}
        {groups === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">No classes yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-fg">{g.name}</p>
                  {branch.canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setEditing({ kind: "arm", classGroup: g, item: null })}
                        aria-label={`Add an arm to ${g.name}`}
                      >
                        Add arm
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setEditing({ kind: "offerings", classGroup: g })}
                        aria-label={`Subjects of ${g.name}`}
                      >
                        Subjects
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing({ kind: "class", item: g })} aria-label={`Rename ${g.name}`}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => archive(`/api/v1/academics/class-groups/${g.id}`, true, g.name)}
                        aria-label={`Archive ${g.name}`}
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  {g.subjectIds.length === 0 ? "No subjects set" : g.subjectIds.map(subjectName).filter(Boolean).join(", ")}
                </p>
                {g.arms.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {g.arms.map((a) => (
                      <li key={a.id} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-2">
                        <span>
                          {a.name}
                          {a.capacity ? ` · cap ${a.capacity}` : ""} · {a.enrolments}
                        </span>
                        {branch.canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "arm", classGroup: g, item: a })}
                            aria-label={`Edit arm ${a.name} of ${g.name}`}
                            className="ml-1 min-h-6 rounded px-1 text-xs font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            Edit
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="subjects-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="subjects-heading" className="text-lg font-semibold tracking-tight text-fg">
            Subjects
          </h2>
          {branch.canEdit && <Button onClick={() => setEditing({ kind: "subject", item: null })}>New subject</Button>}
        </div>
        {subjects === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : subjects.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">No subjects yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                <p className="text-fg">
                  {s.name}
                  {s.code && <span className="ml-2 font-mono text-xs text-fg-muted">{s.code}</span>}
                </p>
                {branch.canEdit && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing({ kind: "subject", item: s })} aria-label={`Edit ${s.name}`}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => archive(`/api/v1/academics/subjects/${s.id}`, true, s.name)}
                      aria-label={`Archive ${s.name}`}
                    >
                      Archive
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <NameDialog
        open={editing?.kind === "class"}
        title={editing?.kind === "class" && editing.item ? `Edit ${editing.item.name}` : "New class"}
        label="Class name"
        initial={editing?.kind === "class" ? (editing.item?.name ?? "") : ""}
        submitLabel={editing?.kind === "class" && editing.item ? "Save" : "Create class"}
        onClose={() => setEditing(null)}
        onSubmit={async (name) => {
          const item = editing?.kind === "class" ? editing.item : null;
          const reply = item
            ? await sendJson(`/api/v1/academics/class-groups/${item.id}`, "PATCH", { name })
            : await sendJson("/api/v1/academics/class-groups", "POST", { branchId, name });
          if (reply.ok) await done(`${name} ${item ? "saved" : "created"}.`);
          return reply;
        }}
      />
      <NameDialog
        open={editing?.kind === "arm"}
        title={
          editing?.kind === "arm" ? (editing.item ? `Edit arm ${editing.item.name}` : `Add an arm to ${editing.classGroup.name}`) : "Arm"
        }
        label="Arm name"
        initial={editing?.kind === "arm" ? (editing.item?.name ?? "") : ""}
        submitLabel={editing?.kind === "arm" && editing.item ? "Save" : "Add arm"}
        onClose={() => setEditing(null)}
        onSubmit={async (name) => {
          if (editing?.kind !== "arm") return null;
          const reply = editing.item
            ? await sendJson(`/api/v1/academics/arms/${editing.item.id}`, "PATCH", { name })
            : await sendJson("/api/v1/academics/arms", "POST", { classGroupId: editing.classGroup.id, name });
          if (reply.ok) await done(`Arm ${name} ${editing.item ? "saved" : "added"}.`);
          return reply;
        }}
      />
      <NameDialog
        open={editing?.kind === "subject"}
        title={editing?.kind === "subject" && editing.item ? `Edit ${editing.item.name}` : "New subject"}
        label="Subject name"
        initial={editing?.kind === "subject" ? (editing.item?.name ?? "") : ""}
        submitLabel={editing?.kind === "subject" && editing.item ? "Save" : "Create subject"}
        onClose={() => setEditing(null)}
        onSubmit={async (name) => {
          const item = editing?.kind === "subject" ? editing.item : null;
          const reply = item
            ? await sendJson(`/api/v1/academics/subjects/${item.id}`, "PATCH", { name })
            : await sendJson("/api/v1/academics/subjects", "POST", { branchId, name });
          if (reply.ok) await done(`${name} ${item ? "saved" : "created"}.`);
          return reply;
        }}
      />
      <OfferingsDialog
        key={editing?.kind === "offerings" ? editing.classGroup.id : "none"}
        classGroup={editing?.kind === "offerings" ? editing.classGroup : null}
        subjects={subjects ?? []}
        onClose={() => setEditing(null)}
        onDone={(name) => done(`Subjects of ${name} saved.`)}
      />
    </div>
  );
}

function NameDialog({
  open,
  title,
  label,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<Reply | null>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && (
        <NameForm
          key={`${title}|${initial}`}
          label={label}
          initial={initial}
          submitLabel={submitLabel}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}

function NameForm({
  label,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  label: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<Reply | null>;
}) {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) return setProblem("Give a name.");
    setProblem(null);
    setPending(true);
    const reply = await onSubmit(trimmed);
    setPending(false);
    if (reply && !reply.ok) setProblem(problemFor(reply, "name") ?? say(reply, "That didn't work."));
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label={label}
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={problem}
        maxLength={60}
        disabled={pending}
        autoComplete="off"
      />
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function OfferingsDialog({
  classGroup,
  subjects,
  onClose,
  onDone,
}: {
  classGroup: ClassGroup | null;
  subjects: Subject[];
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(classGroup?.subjectIds ?? []);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classGroup || pending) return;
    setProblem(null);
    setPending(true);
    const reply = await sendJson(`/api/v1/academics/class-groups/${classGroup.id}/subjects`, "PUT", { subjectIds: chosen });
    setPending(false);
    if (reply.ok) onDone(classGroup.name);
    else setProblem(say(reply, "That didn't work."));
  }
  return (
    <Dialog open={classGroup !== null} onClose={onClose} title={classGroup ? `Subjects of ${classGroup.name}` : "Subjects"}>
      {classGroup && (
        <form onSubmit={submit} noValidate className="space-y-3">
          {subjects.length === 0 ? (
            <p className="text-sm text-fg-muted">Add subjects first, then choose which this class studies.</p>
          ) : (
            <fieldset className="space-y-1">
              <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">This class studies</legend>
              {subjects.map((s) => (
                <CheckboxField
                  key={s.id}
                  label={s.name}
                  checked={chosen.includes(s.id)}
                  onChange={(e) => setChosen((all) => (e.target.checked ? [...all, s.id] : all.filter((x) => x !== s.id)))}
                  disabled={pending}
                />
              ))}
            </fieldset>
          )}
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? "Working…" : "Save subjects"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
