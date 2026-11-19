"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { InfoTip } from "@/components/ui/InfoTip";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { BookOpenIcon, GraduationCapIcon, LayersIcon, PencilIcon, UserIcon, UsersIcon } from "@/components/ui/icons";
import { TONE } from "@/components/ui/tone";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { ExportButton } from "@/components/bulk/ExportButton";
import { Pager, paginate } from "@/components/ui/Pager";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { classEntity } from "@/lib/bulk/classes";
import { subjectEntity } from "@/lib/bulk/subjects";

// The Academics page's lists and dialogs (Slice P1): classes with their arms and subjects, and the branch's subjects. Presentation only - the academics API
// enforces who may read and change what, and every outcome (duplicate name, archived parent, signed out, offline) has its own honest message.

type Arm = {
  id: string;
  name: string;
  capacity: number | null;
  archivedAt: string | null;
  enrolments: number;
  classTeacher: { id: string; name: string } | null;
};
type ClassGroup = { id: string; name: string; sortOrder: number; archivedAt: string | null; subjectIds: string[]; arms: Arm[] };
type Subject = { id: string; name: string; code: string | null; archivedAt: string | null };
type Editing =
  | { kind: "class"; item: ClassGroup | null }
  | { kind: "arm"; classGroup: ClassGroup; item: Arm | null }
  | { kind: "subject"; item: Subject | null }
  | { kind: "offerings"; classGroup: ClassGroup }
  | { kind: "teacher"; classGroup: ClassGroup; arm: Arm }
  | null;

const same = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

/// One view of the branch's academic set-up: its classes (with arms and the subjects each studies) or its subjects. The Academics page puts them on their own tabs; both load the
/// same branch data because a class lists subject names and a subject says how many classes study it. Search, the filters and the page are the browser's: a branch has tens of rows.
export function ClassesPanel({
  branches,
  view,
  branchId,
  onBranchChange,
  autoNew = false,
  onAutoNewDone,
  initialQuery = "",
}: {
  branches: BranchChoice[];
  view: "classes" | "subjects";
  branchId: string;
  onBranchChange: (id: string) => void;
  /// Open the New class form at once (a shortcut from the Overview). Used once.
  autoNew?: boolean;
  onAutoNewDone?: () => void;
  /// The search a link opens the list with (the top-bar search, task 0113).
  initialQuery?: string;
}) {
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [groups, setGroups] = useState<ClassGroup[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(autoNew && view === "classes" && branch.canEdit ? { kind: "class", item: null } : null);
  useEffect(() => {
    if (autoNew) onAutoNewDone?.();
  }, [autoNew, onAutoNewDone]);
  // "Add many" (task 0084): whether the dialog is open, and a key that gives each opening a clean dialog.
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [search, setSearch] = useState(initialQuery);
  const [gap, setGap] = useState(""); // classes: "" | "noSubjects" | "noArms"; subjects: "" | "unused"
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered per list (task 0089). Classes read best as cards, subjects as rows.
  const layout = useCollectionView(`academics-${view}`, { defaultView: view === "classes" ? "grid" : "list", page, onPage: setPage });

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
  const classPage = paginate(shownGroups, page, layout.size);
  const subjectPage = paginate(shownSubjects, page, layout.size);

  const picker = (
    <BranchPicker
      branches={branches}
      value={branchId}
      onChange={(id) => {
        setNotice(null);
        clearFilters();
        onBranchChange(id);
      }}
    />
  );

  return (
    <div className="space-y-6">
      {picker}
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
            <div className="flex flex-wrap items-center gap-2">
              {branch.canEdit && (
                <>
                  <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                    Add many
                  </Button>
                  <Button onClick={() => setEditing({ kind: "class", item: null })}>New class</Button>
                </>
              )}
            </div>
          </div>
          <ListToolbar
            searchValue={search}
            onSearch={(v) => (setSearch(v), setPage(1))}
            searchPlaceholder="Search classes, arms or subjects"
            activeCount={gap === "" ? 0 : 1}
            onClear={clearFilters}
            trailing={
              <>
                {branch.canEdit && (
                  <ExportButton
                    kind="classes"
                    branchId={branch.id}
                    branchName={branch.name}
                    shownCount={groups === null ? null : shownGroups.length}
                    shown={() => ({ ids: shownGroups.map((g) => g.id) })}
                  />
                )}
                <ViewToggle view={layout.view} onChange={layout.setView} />
              </>
            }
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
          <Collection
            label="Classes"
            view={layout.view}
            state={groups === null ? "loading" : groups.length === 0 ? "empty" : shownGroups.length === 0 ? "nomatch" : "ready"}
            emptyText="No classes yet."
            noMatchText="No class matches."
            onClear={clearFilters}
          >
            {classPage.rows.map((g) => {
              const pupils = g.arms.reduce((n, a) => n + a.enrolments, 0);
              const names = g.subjectIds.map(subjectName).filter(Boolean);
              return (
                <Item
                  key={g.id}
                  leading={
                    <ItemTile>
                      <GraduationCapIcon className="h-5 w-5" />
                    </ItemTile>
                  }
                  title={g.name}
                  factsStyle="stats"
                  facts={[
                    {
                      label: g.arms.length === 1 ? "arm" : "arms",
                      value: g.arms.length,
                      tone: "info",
                      icon: <LayersIcon className="h-4 w-4" />,
                    },
                    {
                      label: g.subjectIds.length === 1 ? "subject" : "subjects",
                      value: g.subjectIds.length,
                      tone: "brand",
                      icon: <BookOpenIcon className="h-4 w-4" />,
                    },
                    { label: pupils === 1 ? "pupil" : "pupils", value: pupils, tone: "ok", icon: <UsersIcon className="h-4 w-4" /> },
                  ]}
                  actions={
                    branch.canEdit
                      ? [
                          {
                            id: "arm",
                            label: "Add arm",
                            ariaLabel: `Add an arm to ${g.name}`,
                            onClick: () => setEditing({ kind: "arm", classGroup: g, item: null }),
                          },
                          {
                            id: "subjects",
                            label: "Subjects",
                            ariaLabel: `Subjects of ${g.name}`,
                            onClick: () => setEditing({ kind: "offerings", classGroup: g }),
                          },
                          {
                            id: "edit",
                            label: "Edit",
                            ariaLabel: `Rename ${g.name}`,
                            onClick: () => setEditing({ kind: "class", item: g }),
                          },
                          {
                            id: "archive",
                            label: "Archive",
                            ariaLabel: `Archive ${g.name}`,
                            variant: "ghost",
                            onClick: () => archive(`/api/v1/academics/class-groups/${g.id}`, true, g.name),
                          },
                        ]
                      : undefined
                  }
                  below={
                    g.arms.length > 0 ? (
                      <ul aria-label={`Arms of ${g.name}`} className="flex flex-wrap gap-2">
                        {g.arms.map((a) => {
                          const label = `${a.name}${a.capacity ? ` · cap ${a.capacity}` : ""} · ${a.enrolments}`;
                          return (
                            <li key={a.id}>
                              {branch.canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => setEditing({ kind: "arm", classGroup: g, item: a })}
                                  aria-label={`Edit arm ${a.name} of ${g.name}`}
                                  className={`relative z-10 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${TONE.info.chip}`}
                                >
                                  {label}
                                  <PencilIcon aria-hidden="true" className={`h-3.5 w-3.5 ${TONE.info.icon}`} />
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium ${TONE.info.chip}`}
                                >
                                  {label}
                                </span>
                              )}
                              {/* The arm's class teacher (task 0114): shown to everyone, chosen here by an administrator. */}
                              {branch.canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => setEditing({ kind: "teacher", classGroup: g, arm: a })}
                                  aria-label={`Class teacher of ${g.name} ${a.name}: ${a.classTeacher ? a.classTeacher.name : "none yet"}. Change`}
                                  className="relative z-10 mt-1 flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  <UserIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                  {a.classTeacher ? a.classTeacher.name : "Set class teacher"}
                                </button>
                              ) : (
                                a.classTeacher && (
                                  <p className="mt-1 flex items-center gap-1.5 px-2 text-xs text-fg-muted">
                                    <UserIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                    {a.classTeacher.name}
                                  </p>
                                )
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : undefined
                  }
                >
                  <p className="text-fg-muted">
                    {names.length === 0 ? (
                      "No subjects set"
                    ) : (
                      <>
                        {names.slice(0, 6).join(", ")}
                        {names.length > 6 && <span className="text-fg-2"> and {names.length - 6} more</span>}
                      </>
                    )}
                  </p>
                </Item>
              );
            })}
          </Collection>
          <Pager
            page={classPage.page}
            pages={classPage.pages}
            onPage={setPage}
            label="Pages of classes"
            total={shownGroups.length}
            size={layout.size}
            sizes={layout.sizes}
            onSize={layout.setSize}
          />
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
            <div className="flex flex-wrap items-center gap-2">
              {branch.canEdit && (
                <>
                  <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                    Add many
                  </Button>
                  <Button onClick={() => setEditing({ kind: "subject", item: null })}>New subject</Button>
                </>
              )}
            </div>
          </div>
          <ListToolbar
            searchValue={search}
            onSearch={(v) => (setSearch(v), setPage(1))}
            searchPlaceholder="Search subjects by name or code"
            activeCount={gap === "" ? 0 : 1}
            onClear={clearFilters}
            trailing={
              <>
                {branch.canEdit && (
                  <ExportButton
                    kind="subjects"
                    branchId={branch.id}
                    branchName={branch.name}
                    shownCount={subjects === null ? null : shownSubjects.length}
                    shown={() => ({ ids: shownSubjects.map((x) => x.id) })}
                  />
                )}
                <ViewToggle view={layout.view} onChange={layout.setView} />
              </>
            }
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
          <Collection
            label="Subjects"
            view={layout.view}
            state={subjects === null ? "loading" : subjects.length === 0 ? "empty" : shownSubjects.length === 0 ? "nomatch" : "ready"}
            emptyText="No subjects yet."
            noMatchText="No subject matches."
            onClear={clearFilters}
          >
            {subjectPage.rows.map((s) => {
              const classes = usedBy(s.id);
              return (
                <Item
                  key={s.id}
                  leading={
                    <ItemTile>
                      <BookOpenIcon className="h-5 w-5" />
                    </ItemTile>
                  }
                  title={s.name}
                  subtitle={s.code ? <span className="font-mono text-xs">{s.code}</span> : undefined}
                  facts={[
                    { label: "Studied by", value: classes === 0 ? "No class yet" : `${classes} ${classes === 1 ? "class" : "classes"}` },
                  ]}
                  actions={
                    branch.canEdit
                      ? [
                          {
                            id: "edit",
                            label: "Edit",
                            ariaLabel: `Edit ${s.name}`,
                            onClick: () => setEditing({ kind: "subject", item: s }),
                          },
                          {
                            id: "archive",
                            label: "Archive",
                            ariaLabel: `Archive ${s.name}`,
                            variant: "ghost",
                            onClick: () => archive(`/api/v1/academics/subjects/${s.id}`, true, s.name),
                          },
                        ]
                      : undefined
                  }
                />
              );
            })}
          </Collection>
          <Pager
            page={subjectPage.page}
            pages={subjectPage.pages}
            onPage={setPage}
            label="Pages of subjects"
            total={shownSubjects.length}
            size={layout.size}
            sizes={layout.sizes}
            onSize={layout.setSize}
          />
        </section>
      )}

      {branch.canEdit && (
        <BulkImportDialog
          branchName={branch.name}
          branchChoices={branches.filter((b) => b.canEdit)}
          branchId={branchId}
          onBranchChange={(id) => {
            setNotice(null);
            clearFilters();
            onBranchChange(id);
          }}
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
      <ClassTeacherDialog
        key={editing?.kind === "teacher" ? editing.arm.id : "no-arm"}
        branchId={branchId}
        target={editing?.kind === "teacher" ? { classGroup: editing.classGroup, arm: editing.arm } : null}
        onClose={() => setEditing(null)}
        onDone={(text) => done(text)}
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

type StaffChoice = {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  category: "TEACHING" | "NON_TEACHING";
  archived: boolean;
  standing: string;
};

/// Choose an arm's class teacher (task 0114): a live member of staff of the branch, teaching staff first, or nobody. The API checks again (an administrator of the branch, a live record of it).
function ClassTeacherDialog({
  branchId,
  target,
  onClose,
  onDone,
}: {
  branchId: string;
  target: { classGroup: ClassGroup; arm: Arm } | null;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [staff, setStaff] = useState<StaffChoice[] | null>(null);
  const [chosen, setChosen] = useState(target?.arm.classTeacher?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    let live = true;
    void getJson(`/api/v1/staff?branchId=${encodeURIComponent(branchId)}`).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the staff."));
      const rows = (reply.data!.staff as StaffChoice[]).filter((p) => !p.archived && p.standing === "ACTIVE");
      rows.sort((a, b) => (a.category === b.category ? 0 : a.category === "TEACHING" ? -1 : 1));
      setStaff(rows);
    });
    return () => {
      live = false;
    };
  }, [branchId, target]);
  if (!target) return null;
  const where = `${target.classGroup.name} ${target.arm.name}`;
  async function save() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`/api/v1/academics/arms/${target!.arm.id}/class-teacher`, "PATCH", {
      branchId,
      staffRecordId: chosen || null,
    });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    const person = staff?.find((p) => p.id === chosen);
    await onDone(
      person ? `${person.firstName} ${person.lastName} is the class teacher of ${where}.` : `${where} has no class teacher now.`,
    );
  }
  const nameOf = (p: StaffChoice) => `${p.title ? `${p.title} ` : ""}${p.firstName} ${p.lastName}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Class teacher of ${where}`}
      description="The class teacher can take the register for this arm. One per arm; choosing another replaces them."
    >
      <div className="mt-4 space-y-4">
        {staff === null && !error ? (
          <p className="text-sm text-fg-muted">Loading the staff…</p>
        ) : (
          <SelectField
            label="Class teacher"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            options={[
              { value: "", label: "No class teacher" },
              ...(staff ?? []).map((p) => ({
                value: p.id,
                label: `${nameOf(p)}${p.category === "NON_TEACHING" ? " (non-teaching)" : ""}`,
              })),
            ]}
          />
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()} disabled={staff === null}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
