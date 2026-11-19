"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemInitials, type ItemAction, type ItemFact } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import type { MenuAction } from "@/components/ui/ActionsMenu";
import { Pager } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { pupilEntityFor } from "@/lib/bulk/pupils";
import { StandingBadge } from "@/components/standing/StandingBadge";
import { StandingDialog, type StandingAsk } from "@/components/standing/StandingDialog";
import { StandingHistoryDialog } from "@/components/standing/StandingHistoryDialog";
import { KIND_TEXT, kindsFor, prettyDay, type StandingCan, type StandingValue } from "@/components/standing/model";
import { OwnProgramCard, type OwnProgram } from "@/components/students/OwnProgramCard";
import { ExportButton } from "@/components/bulk/ExportButton";
import { AGE_MAX, activePupilFilters, pupilFilterQuery, type PupilFilters } from "@/lib/students/list-filters";

// The branch's pupils (Slice UI1, over the students API): search, register, edit, archive and restore, and import from a spreadsheet. Presentation only: the API
// decides who may read and change what, refuses a namesake unless an administrator confirms it (ADR 0011), and audits that confirmation.

type Student = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: "MALE" | "FEMALE";
  /// Not required: null when it was not given.
  dateOfBirth: string | null;
  admissionNo: string;
  archived: boolean;
  /// What applies today, and the last day of a suspension (task 0045).
  standing: StandingValue;
  standingUntil: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  currentClass: string | null;
  sessionLabel: string | null;
};
type ClassOption = { id: string; name: string; arms: { id: string; name: string }[] };
type Paging = { page: number; totalPages: number; total: number };
type Editing = { kind: "form"; item: Student | null } | null;

/// How many pupils to a page when the person has not chosen: the 25 this list always had (a size the kit offers in the list view; the grid's equivalent is 24).
const USUAL_SIZE = 25;

type Show = "live" | "suspended" | "expelled" | "archived";

/// "AY" for Amina Yusuf: the first letter of the first and the last name (whole characters, so an emoji or an accented letter is not cut in half).
const initialsOf = (first: string, last: string) => `${Array.from(first.trim())[0] ?? ""}${Array.from(last.trim())[0] ?? ""}`.toUpperCase();

/// `standingCan`: what the person may do about a pupil's standing in each branch (display only: the API decides).
export function StudentsPanel({
  branches,
  standingCan = {},
  programs = {},
  initialBranchId,
  initialQuery = "",
}: {
  branches: BranchChoice[];
  /// From a link (the top-bar search, task 0113): the branch to open and the search to start with. A branch the person does not have is ignored.
  initialBranchId?: string;
  initialQuery?: string;
  standingCan?: Record<string, StandingCan>;
  /// The program each branch was made for, if any, as this person may see it (task 0110).
  programs?: Record<string, OwnProgram>;
}) {
  const [branchId, setBranchId] = useState(branches.some((b) => b.id === initialBranchId) ? initialBranchId! : branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const pupilEntity = useMemo(() => pupilEntityFor(classes.map((c) => c.name)), [classes]);
  const [paging, setPaging] = useState<Paging>({ page: 1, totalPages: 1, total: 0 });
  const [show, setShow] = useState<Show>("live");
  const status = show === "archived" ? "archived" : "live";
  const [q, setQ] = useState(initialQuery);
  // Class, arm, gender and age (task 0103 D1), applied by the server so the counts and pages follow them.
  const [pf, setPf] = useState<PupilFilters>({});
  const [noDob, setNoDob] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered in this browser (task 0089). The list is paged by the server, so the size is sent as `limit` (every size the kit offers is at most 50, the API's cap).
  const layout = useCollectionView("students", { defaultView: "list", defaultSize: USUAL_SIZE, page, onPage: setPage });
  const size = layout.size;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(null);
  const [restoreAsk, setRestoreAsk] = useState<{ student: Student; message: string } | null>(null);
  const [standingAsk, setStandingAsk] = useState<StandingAsk | null>(null);
  const [historyOf, setHistoryOf] = useState<{ endpoint: string; name: string } | null>(null);
  const can: StandingCan = standingCan[branchId] ?? { suspend: false, remove: false };

  // Changing the page size or the view moves the page and the size in the same breath; an answer to the request before that must not land after the one that replaced it.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    const base = `branchId=${encodeURIComponent(branchId)}`;
    const [s, c] = await Promise.all([
      getJson(
        `/api/v1/students?${base}&status=${status}${show === "suspended" || show === "expelled" ? `&standing=${show}` : ""}&q=${encodeURIComponent(q)}${pupilFilterQuery(pf)}&page=${page}&limit=${size}`,
      ),
      getJson(`/api/v1/academics/class-groups?${base}`),
    ]);
    if (mine !== latest.current) return;
    const bad = [s, c].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setStudents(s.data!.students as Student[]);
    setPaging(s.data!.pagination as Paging);
    setNoDob((s.data!.noDateOfBirth as number | null | undefined) ?? null);
    setClasses(c.data!.classGroups as ClassOption[]);
  }, [branchId, status, show, q, pf, page, size]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on a branch / filter / page change is exactly what this effect is for
    void load();
  }, [load]);

  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  async function setArchived(s: Student, archived: boolean, allowDuplicate = false) {
    setRestoreAsk(null);
    const reply = archived
      ? await sendJson(`/api/v1/students/${s.id}`, "DELETE")
      : await sendJson(`/api/v1/students/${s.id}/restore`, "POST", { allowDuplicate });
    const who = `${s.firstName} ${s.lastName}`;
    if (reply.code === "POSSIBLE_DUPLICATE") {
      // A current pupil already has this name and birth date: ask before restoring (ADR 0011); the API audits the confirmation.
      setNotice(null);
      return setRestoreAsk({ student: s, message: reply.message ?? "A current pupil has the same name (and date of birth, when given)." });
    }
    setNotice(
      reply.ok
        ? { variant: "success", text: `${who} ${archived ? "archived" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }

  const clearFilters = () => {
    setQ("");
    setShow("live");
    setPf({});
    setPage(1);
  };
  const setFilter = (next: PupilFilters) => {
    setPf(next);
    setPage(1);
  };
  const filterCount = (show === "live" ? 0 : 1) + activePupilFilters(pf);
  const chosenClass = classes.find((c) => c.id === pf.classGroupId);
  const ageValue = (v: string) => (v === "" ? undefined : Math.max(0, Math.min(AGE_MAX, Math.trunc(Number(v)) || 0)));

  return (
    <div className="space-y-6">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setNotice(null);
          setStudents(null);
          setPage(1);
          setPf({});
          setBranchId(id);
        }}
      />
      {programs[branchId] && <OwnProgramCard branchName={branch.name} program={programs[branchId]} />}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {restoreAsk && (
          <Alert variant="error">
            <p>{restoreAsk.message}</p>
            <p className="mt-1 text-xs">If this really is a different child, restore anyway. The decision is recorded against your name.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => void setArchived(restoreAsk.student, false, true)}>
                Restore anyway
              </Button>
              <Button variant="ghost" onClick={() => setRestoreAsk(null)}>
                Leave archived
              </Button>
            </div>
          </Alert>
        )}
      </div>

      <section aria-labelledby="students-heading" className="space-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="students-heading" className="text-lg font-semibold tracking-tight text-fg">
              Pupils
            </h2>
            {branch.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                  Add many
                </Button>
                <Button onClick={() => setEditing({ kind: "form", item: null })}>New student</Button>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Registered in {branch.name}. A pupil is put in a class when registered; to move a whole class up a year use Promotion on the
            Academics page.
          </p>
        </div>
        <ListToolbar
          searchLabel="Search students"
          searchValue={q}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          searchPlaceholder="Name or admission number"
          activeCount={filterCount}
          onClear={clearFilters}
          trailing={
            <>
              {branch.canEdit && (
                <ExportButton
                  kind="pupils"
                  branchId={branch.id}
                  branchName={branch.name}
                  shownCount={students === null ? null : paging.total}
                  shown={() => ({ pupils: { q, show, query: pupilFilterQuery(pf) } })}
                />
              )}
              <ViewToggle view={layout.view} onChange={layout.setView} />
            </>
          }
        >
          <SelectField
            label="Show"
            info="students.show"
            value={show}
            onChange={(e) => {
              setShow(e.target.value as Show);
              setPage(1);
            }}
            options={[
              { value: "live", label: "Current students" },
              { value: "suspended", label: "Suspended" },
              { value: "expelled", label: "Expelled" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <SelectField
            label="Class"
            value={pf.noClass ? "none" : (pf.classGroupId ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              setFilter({
                ...pf,
                classGroupId: v && v !== "none" ? v : undefined,
                classArmId: undefined,
                noClass: v === "none" ? "1" : undefined,
              });
            }}
            options={[
              { value: "", label: "Any class" },
              { value: "none", label: "No class yet" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          {chosenClass && chosenClass.arms.length > 1 && (
            <SelectField
              label="Arm"
              value={pf.classArmId ?? ""}
              onChange={(e) => setFilter({ ...pf, classArmId: e.target.value || undefined })}
              options={[{ value: "", label: "Every arm" }, ...chosenClass.arms.map((a) => ({ value: a.id, label: a.name }))]}
            />
          )}
          <SelectField
            label="Gender"
            value={pf.gender ?? ""}
            onChange={(e) => setFilter({ ...pf, gender: (e.target.value || undefined) as PupilFilters["gender"] })}
            options={[
              { value: "", label: "Any" },
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
            ]}
          />
          <TextField
            label="Age from"
            type="number"
            inputMode="numeric"
            min={0}
            max={AGE_MAX}
            value={pf.ageMin ?? ""}
            onChange={(e) => setFilter({ ...pf, ageMin: ageValue(e.target.value) })}
          />
          <TextField
            label="Age to"
            type="number"
            inputMode="numeric"
            min={0}
            max={AGE_MAX}
            value={pf.ageMax ?? ""}
            onChange={(e) => setFilter({ ...pf, ageMax: ageValue(e.target.value) })}
          />
        </ListToolbar>
        {noDob !== null && noDob > 0 && (
          <p className="text-sm text-fg-muted" aria-live="polite">
            {noDob} {noDob === 1 ? "pupil has" : "pupils have"} no date of birth, so their age cannot be checked: they are left out.
          </p>
        )}
        <Collection
          label="Students"
          view={layout.view}
          state={students === null ? "loading" : students.length === 0 ? (q || filterCount > 0 ? "nomatch" : "empty") : "ready"}
          emptyText={branch.canEdit ? "No students yet. Add one, or import a class from a spreadsheet." : "No students yet."}
          noMatchText="No students match."
          onClear={clearFilters}
        >
          {(students ?? []).map((s) => {
            const name = `${s.firstName} ${s.lastName}`;
            const guardian = s.guardianName ? `${s.guardianName}${s.guardianPhone ? ` (${s.guardianPhone})` : ""}` : s.guardianPhone;
            // Only what is known is shown: a pupil with no date of birth or no guardian has no empty field (the date is optional, task 0090).
            const facts: ItemFact[] = [
              { label: "Class", value: s.currentClass ?? "No class yet" },
              ...(guardian ? [{ label: "Guardian", value: guardian }] : []),
              ...(s.dateOfBirth ? [{ label: "Born", value: prettyDay(s.dateOfBirth) }] : []),
            ];
            // The two everyday actions stay buttons; standing (suspend, lift, expel, reinstate) and its history are in the Actions list. Every one keeps its full name ("Suspend Amina Musa").
            const actions: ItemAction[] = [
              ...(s.archived
                ? []
                : [{ id: "edit", label: "Edit", ariaLabel: `Edit ${name}`, onClick: () => setEditing({ kind: "form", item: s }) }]),
              {
                id: "archive",
                label: s.archived ? "Restore" : "Archive",
                ariaLabel: `${s.archived ? "Restore" : "Archive"} ${name}`,
                variant: "ghost",
                onClick: () => void setArchived(s, !s.archived),
              },
            ];
            const menu: MenuAction[] = [
              ...(s.archived
                ? []
                : kindsFor("student", s.standing, can).map((kind) => ({
                    id: kind,
                    label: KIND_TEXT[kind],
                    ariaLabel: `${KIND_TEXT[kind]} ${name}`,
                    onSelect: () => setStandingAsk({ kind, subject: "student", endpoint: `/api/v1/students/${s.id}/standing`, name }),
                  }))),
              {
                id: "history",
                label: "Standing history",
                ariaLabel: `Standing history of ${name}`,
                onSelect: () => setHistoryOf({ endpoint: `/api/v1/students/${s.id}/standing`, name }),
              },
            ];
            return (
              <Item
                key={s.id}
                leading={<ItemInitials text={initialsOf(s.firstName, s.lastName)} />}
                title={`${s.firstName} ${s.middleName ? `${s.middleName} ` : ""}${s.lastName}`}
                subtitle={`${s.admissionNo} · ${s.gender === "MALE" ? "Male" : "Female"}`}
                facts={facts}
                badges={
                  s.archived || s.standing !== "ACTIVE" ? (
                    <>
                      <StandingBadge standing={s.standing} until={s.standingUntil} />
                      {s.archived && (
                        <span className="shrink-0 rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-2">
                          Archived
                        </span>
                      )}
                    </>
                  ) : undefined
                }
                actions={branch.canEdit ? actions : undefined}
                menu={branch.canEdit ? { name, actions: menu } : undefined}
              />
            );
          })}
        </Collection>
        <Pager
          page={paging.page}
          pages={paging.totalPages}
          onPage={setPage}
          label="Pages of students"
          total={paging.total}
          size={size}
          sizes={layout.sizes}
          onSize={layout.setSize}
        />
      </section>

      <StandingDialog
        ask={standingAsk}
        onClose={() => setStandingAsk(null)}
        onDone={(text) => {
          setStandingAsk(null);
          setNotice({ variant: "success", text });
          void load();
        }}
      />
      <StandingHistoryDialog endpoint={historyOf?.endpoint ?? null} name={historyOf?.name ?? ""} onClose={() => setHistoryOf(null)} />
      <StudentDialog
        key={editing?.kind === "form" ? (editing.item?.id ?? "new") : "none"}
        open={editing?.kind === "form"}
        item={editing?.kind === "form" ? editing.item : null}
        branchId={branchId}
        branchName={branch.name}
        classes={classes}
        onClose={() => setEditing(null)}
        onDone={done}
      />
      {branch.canEdit && (
        <BulkImportDialog
          branchName={branch.name}
          branchChoices={branches.filter((b) => b.canEdit)}
          branchId={branchId}
          onBranchChange={(id) => {
            setNotice(null);
            setStudents(null);
            setPage(1);
            setBranchId(id);
          }}
          key={`bulk-${bulk.key}`}
          open={bulk.open}
          onClose={() => setBulk((b) => ({ ...b, open: false }))}
          entity={pupilEntity}
          title="Add pupils in bulk"
          description={`Into ${branch.name}. Nothing is saved until you press Save. A pupil is placed in a class only when a class of this branch is named and the branch has an active academic session.`}
          endpoint="/api/v1/students/import"
          context={{ branchId, allowDuplicates }}
          contextControl={(locked) => (
            <CheckboxField
              label="Add even if a pupil with the same name (and date of birth, when given) is already here (recorded against your name)"
              checked={allowDuplicates}
              disabled={locked}
              onChange={(e) => setAllowDuplicates(e.target.checked)}
            />
          )}
          noun={{ one: "pupil", many: "pupils" }}
          onSaved={async (count) => {
            setNotice({ variant: "success", text: `${count} ${count === 1 ? "pupil" : "pupils"} added to ${branch.name}.` });
            await load();
          }}
        />
      )}
    </div>
  );
}

function StudentDialog({
  open,
  item,
  branchId,
  branchName,
  classes,
  onClose,
  onDone,
}: {
  open: boolean;
  item: Student | null;
  branchId: string;
  branchName: string;
  classes: ClassOption[];
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [f, setF] = useState({
    firstName: item?.firstName ?? "",
    middleName: item?.middleName ?? "",
    lastName: item?.lastName ?? "",
    gender: item?.gender ?? "",
    dateOfBirth: item?.dateOfBirth ?? "",
    admissionNo: item && !/^\d{4}\/\d+$/.test(item.admissionNo) ? item.admissionNo : "",
    className: "",
    arm: "",
    guardianName: item?.guardianName ?? "",
    guardianPhone: item?.guardianPhone ?? "",
    guardianEmail: item?.guardianEmail ?? "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldProblems, setFieldProblems] = useState<Record<string, string>>({});
  const [namesake, setNamesake] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((all) => ({ ...all, [key]: value }));
  const arms = classes.find((c) => c.name === f.className)?.arms ?? [];

  async function submit(event: FormEvent<HTMLFormElement>, allowDuplicate = false) {
    event.preventDefault();
    if (pending) return;
    setProblem(null);
    setFieldProblems({});
    if (!allowDuplicate) setNamesake(null);
    setPending(true);
    const person = {
      firstName: f.firstName,
      middleName: f.middleName.trim() || null,
      lastName: f.lastName,
      gender: f.gender,
      dateOfBirth: f.dateOfBirth,
      guardianName: f.guardianName.trim() || null,
      guardianPhone: f.guardianPhone.trim() || null,
      guardianEmail: f.guardianEmail.trim() || null,
      ...(f.admissionNo.trim() ? { admissionNo: f.admissionNo.trim() } : {}),
      allowDuplicate,
    };
    const reply = item
      ? await sendJson(`/api/v1/students/${item.id}`, "PATCH", person)
      : await sendJson("/api/v1/students", "POST", {
          branchId,
          ...person,
          ...(f.className ? { className: f.className, arm: f.arm || undefined } : {}),
        });
    setPending(false);
    if (reply.ok) {
      const unplaced = !item && f.className && reply.data?.enrolled === false;
      return void (await onDone(
        `${f.firstName} ${f.lastName} ${item ? "saved" : "registered"}.${unplaced ? " They were not put in a class: this branch has no active academic session yet." : ""}`,
      ));
    }
    if (reply.code === "POSSIBLE_DUPLICATE")
      return setNamesake(reply.message ?? "A pupil with the same name (and date of birth, when given) already exists in this branch.");
    const found: Record<string, string> = {};
    for (const key of Object.keys(f)) {
      const message = problemFor(reply, key);
      if (message) found[key] = message;
    }
    setFieldProblems(found);
    if (Object.keys(found).length === 0) setProblem(say(reply, "That didn't work."));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.firstName} ${item.lastName}` : "New student"}
      description={item ? undefined : `Registering in ${branchName}.`}
    >
      {open && (
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <TextField
            label="First name"
            value={f.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            error={fieldProblems.firstName}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Middle name (optional)"
            value={f.middleName}
            onChange={(e) => set("middleName", e.target.value)}
            error={fieldProblems.middleName}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Last name"
            value={f.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            error={fieldProblems.lastName}
            maxLength={60}
            autoComplete="off"
            disabled={pending}
          />
          <SelectField
            label="Gender"
            value={f.gender}
            onChange={(e) => set("gender", e.target.value)}
            error={fieldProblems.gender}
            options={[
              { value: "", label: "Choose…" },
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
            ]}
            disabled={pending}
          />
          <TextField
            label="Date of birth (optional)"
            type="date"
            value={f.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            error={fieldProblems.dateOfBirth}
            disabled={pending}
          />
          <TextField
            label="Admission number (optional)"
            value={f.admissionNo}
            onChange={(e) => set("admissionNo", e.target.value)}
            error={fieldProblems.admissionNo}
            hint="Leave blank to generate the next one for this year."
            maxLength={40}
            autoComplete="off"
            disabled={pending}
          />
          {!item && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Class (optional)"
                value={f.className}
                onChange={(e) => setF((all) => ({ ...all, className: e.target.value, arm: "" }))}
                error={fieldProblems.className}
                options={[
                  { value: "", label: classes.length === 0 ? "No classes set up yet" : "No class yet" },
                  ...classes.map((c) => ({ value: c.name, label: c.name })),
                ]}
                disabled={pending || classes.length === 0}
              />
              <SelectField
                label="Arm"
                value={f.arm}
                onChange={(e) => set("arm", e.target.value)}
                error={fieldProblems.arm}
                options={[
                  { value: "", label: arms.length === 0 ? "—" : "Choose…" },
                  ...arms.map((a) => ({ value: a.name, label: a.name })),
                ]}
                disabled={pending || arms.length === 0}
              />
            </div>
          )}
          <TextField
            label="Guardian name (optional)"
            value={f.guardianName}
            onChange={(e) => set("guardianName", e.target.value)}
            error={fieldProblems.guardianName}
            maxLength={100}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Guardian phone (optional)"
            inputMode="tel"
            value={f.guardianPhone}
            onChange={(e) => set("guardianPhone", e.target.value)}
            error={fieldProblems.guardianPhone}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Guardian email (optional)"
            inputMode="email"
            value={f.guardianEmail}
            onChange={(e) => set("guardianEmail", e.target.value)}
            error={fieldProblems.guardianEmail}
            autoComplete="off"
            disabled={pending}
          />
          {namesake && (
            <Alert variant="error">
              <p>{namesake}</p>
              <p className="mt-1 text-xs">
                If this really is a different child, {item ? "save" : "register"} anyway. The decision is recorded against your name.
              </p>
              <Button
                variant="secondary"
                className="mt-3"
                loading={pending}
                onClick={(e) => void submit(e as unknown as FormEvent<HTMLFormElement>, true)}
              >
                {item ? "Save anyway" : "Register anyway"}
              </Button>
            </Alert>
          )}
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? "Working…" : item ? "Save" : "Register student"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
