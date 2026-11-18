"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { InfoTip } from "@/components/ui/InfoTip";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { classEntity } from "@/lib/bulk/classes";
import { subjectEntity } from "@/lib/bulk/subjects";

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

const CLASS_PAGE = 8;
const SUBJECT_PAGE = 12;
const same = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

/// One view of the branch's academic set-up: its classes (with arms and the subjects each studies) or its subjects. The Academics page puts them on their own tabs; both load the
/// same branch data because a class lists subject names and a subject says how many classes study it. Search, the filters and the page are the browser's: a branch has tens of rows.
export function ClassesPanel({
  branches,
  view,
  branchId,
  onBranchChange,
}: {
  branches: BranchChoice[];
  view: "classes" | "subjects";
  branchId: string;
  onBranchChange: (id: string) => void;
}) {
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [groups, setGroups] = useState<ClassGroup[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(null);
  // "Add many" (task 0084): whether the dialog is open, and a key that gives each opening a clean dialog.
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [search, setSearch] = useState("");
  const [gap, setGap] = useState(""); // classes: "" | "noSubjects" | "noArms"; subjects: "" | "unused"
  const [page, setPage] = useState(1);

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
  const usedBy = (id: string) => (groups ?? []).filter((g) => g.subjectIds.includes(id)).length;

  const clearFilters = () => {
    setSearch("");
    setGap("");
    setPage(1);
  };
  const filtered = search.trim() !== "" || gap !== "";

  const shownGroups = (groups ?? []).filter(
    (g) =>
      (search.trim() === "" ||
        same(g.name, search) ||
        g.arms.some((a) => same(a.name, search)) ||
        g.subjectIds.some((id) => same(subjectName(id), search))) &&
      (gap === "" || (gap === "noSubjects" ? g.subjectIds.length === 0 : g.arms.length === 0)),
  );
  const shownSubjects = (subjects ?? []).filter(
    (s) => (search.trim() === "" || same(s.name, search) || same(s.code ?? "", search)) && (gap === "" || usedBy(s.id) === 0),
  );
  const classPage = paginate(shownGroups, page, CLASS_PAGE);
  const subjectPage = paginate(shownSubjects, page, SUBJECT_PAGE);

  return (
    <div className="space-y-6">
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setNotice(null);
            clearFilters();
            onBranchChange(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      {view === "classes" ? (
        <section aria-labelledby="classes-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 id="classes-heading" className="text-lg font-semibold tracking-tight text-fg">
                Classes and arms
              </h2>
              <InfoTip tip="academics.classes" />
            </div>
            {branch.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                  Add many
                </Button>
                <Button onClick={() => setEditing({ kind: "class", item: null })}>New class</Button>
              </div>
            )}
          </div>
          <ListToolbar
            searchValue={search}
            onSearch={(v) => (setSearch(v), setPage(1))}
            searchPlaceholder="Search classes, arms or subjects"
            activeCount={gap === "" ? 0 : 1}
            onClear={clearFilters}
          >
            <SelectField
              label="Set-up"
              value={gap}
              onChange={(e) => (setGap(e.target.value), setPage(1))}
              options={[
                { value: "", label: "All classes" },
                { value: "noSubjects", label: "No subjects set" },
                { value: "noArms", label: "No arms yet" },
              ]}
            />
          </ListToolbar>
          {unmatched > 0 && (
            <p className="text-sm text-fg-muted">
              {unmatched} {unmatched === 1 ? "enrolment names" : "enrolments name"} a class or arm that isn&apos;t set up here yet.
            </p>
          )}
          <p className="text-sm text-fg-muted" aria-live="polite">
            {groups === null ? " " : `${shownGroups.length} ${shownGroups.length === 1 ? "class" : "classes"}${filtered ? " match" : ""}`}
          </p>
          {groups === null ? (
            <p className="text-sm text-fg-muted" aria-busy="true">
              Loading…
            </p>
          ) : groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">No classes yet.</p>
          ) : shownGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
              <p>No class matches.</p>
              <Button variant="secondary" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <ul aria-label="Classes" className="grid gap-3 lg:grid-cols-2">
              {classPage.rows.map((g) => {
                const pupils = g.arms.reduce((n, a) => n + a.enrolments, 0);
                const names = g.subjectIds.map(subjectName).filter(Boolean);
                return (
                  <li key={g.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-fg">{g.name}</p>
                        <p className="mt-0.5 text-sm text-fg-muted">
                          {g.arms.length} {g.arms.length === 1 ? "arm" : "arms"} · {g.subjectIds.length}{" "}
                          {g.subjectIds.length === 1 ? "subject" : "subjects"} · {pupils} {pupils === 1 ? "pupil" : "pupils"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-fg-muted">
                      {names.length === 0 ? (
                        "No subjects set"
                      ) : (
                        <>
                          {names.slice(0, 6).join(", ")}
                          {names.length > 6 && <span className="text-fg-2"> and {names.length - 6} more</span>}
                        </>
                      )}
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
                    {branch.canEdit && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
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
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={classPage.page} pages={classPage.pages} onPage={setPage} label="Pages of classes" />
        </section>
      ) : (
        <section aria-labelledby="subjects-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 id="subjects-heading" className="text-lg font-semibold tracking-tight text-fg">
                Subjects
              </h2>
              <InfoTip tip="academics.subjects" />
            </div>
            {branch.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                  Add many
                </Button>
                <Button onClick={() => setEditing({ kind: "subject", item: null })}>New subject</Button>
              </div>
            )}
          </div>
          <ListToolbar
            searchValue={search}
            onSearch={(v) => (setSearch(v), setPage(1))}
            searchPlaceholder="Search subjects by name or code"
            activeCount={gap === "" ? 0 : 1}
            onClear={clearFilters}
          >
            <SelectField
              label="Used by"
              value={gap}
              onChange={(e) => (setGap(e.target.value), setPage(1))}
              options={[
                { value: "", label: "All subjects" },
                { value: "unused", label: "No class studies it" },
              ]}
            />
          </ListToolbar>
          <p className="text-sm text-fg-muted" aria-live="polite">
            {subjects === null
              ? " "
              : `${shownSubjects.length} ${shownSubjects.length === 1 ? "subject" : "subjects"}${filtered ? " match" : ""}`}
          </p>
          {subjects === null ? (
            <p className="text-sm text-fg-muted" aria-busy="true">
              Loading…
            </p>
          ) : subjects.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">No subjects yet.</p>
          ) : shownSubjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
              <p>No subject matches.</p>
              <Button variant="secondary" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <ul aria-label="Subjects" className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
              {subjectPage.rows.map((s) => {
                const classes = usedBy(s.id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0">
                      <p className="text-fg">
                        {s.name}
                        {s.code && <span className="ml-2 font-mono text-xs text-fg-muted">{s.code}</span>}
                      </p>
                      <p className="text-sm text-fg-muted">
                        {classes === 0 ? "No class studies it yet" : `${classes} ${classes === 1 ? "class" : "classes"}`}
                      </p>
                    </div>
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
                );
              })}
            </ul>
          )}
          <Pager page={subjectPage.page} pages={subjectPage.pages} onPage={setPage} label="Pages of subjects" />
        </section>
      )}

      {branch.canEdit && (
        <BulkImportDialog
          key={`${view}-${bulk.key}`}
          open={bulk.open}
          onClose={() => setBulk((b) => ({ ...b, open: false }))}
          entity={view === "classes" ? classEntity : subjectEntity}
          title={view === "classes" ? "Add classes in bulk" : "Add subjects in bulk"}
          description={
            view === "classes"
              ? `Into ${branch.name}. One row is one class, with its arms and the subjects it studies in one cell each (A, B, C). The subjects must already exist. Nothing is saved until you press Save.`
              : `Into ${branch.name}. Nothing is saved until you press Save.`
          }
          endpoint={view === "classes" ? "/api/v1/academics/class-groups/import" : "/api/v1/academics/subjects/import"}
          context={{ branchId }}
          noun={view === "classes" ? { one: "class", many: "classes" } : { one: "subject", many: "subjects" }}
          onSaved={async (count) => {
            const noun = view === "classes" ? (count === 1 ? "class" : "classes") : count === 1 ? "subject" : "subjects";
            setNotice({ variant: "success", text: `${count} ${noun} added.` });
            await load();
          }}
        />
      )}
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
