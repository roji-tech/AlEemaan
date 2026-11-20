"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { useBranchSelection } from "@/components/ui/useBranchSelection";
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
import { draftPill } from "@/components/academics/StaffDetails";
import { AGE_MAX, activePupilFilters, pupilFilterQuery, type PupilFilters } from "@/lib/students/list-filters";
import { PupilGuardiansDialog } from "@/components/guardians/PupilGuardiansDialog";
import { AccessCodesDialog } from "@/components/guardians/AccessCodesDialog";
import { ClassSlipsDialog } from "@/components/guardians/ClassSlipsDialog";
import { RELATIONSHIP_OPTIONS, type GuardianMatch } from "@/components/guardians/model";
import { PupilScholarshipsDialog } from "@/components/scholarships/PupilScholarshipsDialog";
import { PupilFeeItemsDialog } from "@/components/finance/PupilFeeItemsDialog";
import { TONE } from "@/components/ui/tone";

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
  /// A draft (task 0101 D1): saved unfinished. `missing` is what it still needs, by the server's rule.
  isDraft: boolean;
  missing: string[];
  /// What applies today, and the last day of a suspension (task 0045).
  standing: StandingValue;
  standingUntil: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  /// Day pupil or boarder (task 0113 R1); null = not set.
  residence: "DAY" | "BOARDING" | null;
  /// The live scholarships (task 0113 S1): only an administrator of the pupil's branch is sent them; absent for anyone else.
  scholarships?: { typeName: string; percent: number }[];
  currentClass: string | null;
  sessionLabel: string | null;
};
type ClassOption = { id: string; name: string; arms: { id: string; name: string }[] };
type Paging = { page: number; totalPages: number; total: number };
type Editing = { kind: "form"; item: Student | null } | null;

/// How many pupils to a page when the person has not chosen: the 25 this list always had (a size the kit offers in the list view; the grid's equivalent is 24).
const USUAL_SIZE = 25;

type Show = "live" | "suspended" | "expelled" | "archived";

const RESIDENCE_TEXT = { DAY: "Day", BOARDING: "Boarding" } as const;

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
  const [branchId, setBranchId] = useBranchSelection(branches, { initial: initialBranchId });
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
  // How many of the pupils matched are drafts (task 0101 D1), and whether "Add many" saves its rows as drafts.
  const [drafts, setDrafts] = useState(0);
  const [asDraft, setAsDraft] = useState(false);
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
  // Task 0113: a pupil's guardians, their access codes, and a class's printable slips.
  const [guardiansOf, setGuardiansOf] = useState<{ id: string; name: string } | null>(null);
  const [codesOf, setCodesOf] = useState<{ id: string; name: string } | null>(null);
  const [slips, setSlips] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [scholarshipsOf, setScholarshipsOf] = useState<{ id: string; name: string } | null>(null);
  const [feeLinesOf, setFeeLinesOf] = useState<{ id: string; name: string } | null>(null);
  // The branch's current scholarship types, for the filter (administrators only: the API refuses anyone else).
  const [scholarshipTypes, setScholarshipTypes] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!branch.canEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a branch the person cannot administer has no scholarship filter
      setScholarshipTypes([]);
      return;
    }
    const controller = new AbortController();
    void getJson(`/api/v1/finance/scholarship-types?branchId=${encodeURIComponent(branchId)}`, controller.signal).then((reply) => {
      if (!controller.signal.aborted && reply.ok)
        setScholarshipTypes(
          (reply.data!.types as { id: string; name: string; archived: boolean }[])
            .filter((t) => !t.archived)
            .map(({ id, name }) => ({ id, name })),
        );
    });
    return () => controller.abort();
  }, [branch.canEdit, branchId]);
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
    setDrafts((s.data!.drafts as number | undefined) ?? 0);
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
  /// Task 0101 D1: finish a draft, or put a pupil back to unfinished. The server decides (what is missing) and says so.
  async function setDraft(s: Student, draft: boolean) {
    const reply = draft
      ? await sendJson(`/api/v1/students/${s.id}`, "PATCH", { isDraft: true })
      : await sendJson(`/api/v1/students/${s.id}/complete`, "POST");
    const who = `${s.firstName} ${s.lastName}`;
    setNotice(
      reply.ok
        ? { variant: "success", text: draft ? `${who} is now a draft.` : `${who} is complete: no longer a draft.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }
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
                <Button variant="secondary" onClick={() => setSlips((v) => ({ open: true, key: v.key + 1 }))}>
                  Print access slips
                </Button>
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
          <SelectField
            label="Drafts"
            value={pf.draft ?? ""}
            onChange={(e) => setFilter({ ...pf, draft: (e.target.value || undefined) as PupilFilters["draft"] })}
            options={[
              { value: "", label: "Any" },
              { value: "YES", label: "Drafts only" },
              { value: "NO", label: "Not drafts" },
            ]}
          />
          <SelectField
            label="Day or boarding"
            value={pf.residence ?? ""}
            onChange={(e) => setFilter({ ...pf, residence: (e.target.value || undefined) as PupilFilters["residence"] })}
            options={[
              { value: "", label: "Any" },
              { value: "DAY", label: "Day" },
              { value: "BOARDING", label: "Boarding" },
              { value: "NONE", label: "Not set" },
            ]}
          />
          {branch.canEdit && (
            <SelectField
              label="Scholarship"
              value={pf.scholarship ?? ""}
              onChange={(e) => setFilter({ ...pf, scholarship: e.target.value || undefined })}
              options={[
                { value: "", label: "Any" },
                { value: "ANY", label: "Has a scholarship" },
                { value: "NONE", label: "None" },
                ...scholarshipTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          )}
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
        {drafts > 0 && (
          <p className="text-sm text-fg-muted" aria-live="polite">
            {drafts} {drafts === 1 ? "draft" : "drafts"} among these pupils: kept unfinished and left out of classes, attendance, invoices
            and results until completed.
          </p>
        )}
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
              ...(s.archived
                ? []
                : [
                    s.isDraft
                      ? { id: "complete", label: "Complete", ariaLabel: `Complete ${name}`, onSelect: () => void setDraft(s, false) }
                      : {
                          id: "draft",
                          label: "Mark as draft",
                          ariaLabel: `Mark ${name} as a draft`,
                          onSelect: () => void setDraft(s, true),
                        },
                  ]),
              {
                id: "history",
                label: "Standing history",
                ariaLabel: `Standing history of ${name}`,
                onSelect: () => setHistoryOf({ endpoint: `/api/v1/students/${s.id}/standing`, name }),
              },
              ...(s.archived
                ? []
                : [
                    {
                      id: "guardians",
                      label: "Guardians",
                      ariaLabel: `Guardians of ${name}`,
                      onSelect: () => setGuardiansOf({ id: s.id, name }),
                    },
                    ...(branch.canEdit
                      ? [
                          {
                            id: "scholarships",
                            label: "Scholarships",
                            ariaLabel: `Scholarships of ${name}`,
                            onSelect: () => setScholarshipsOf({ id: s.id, name }),
                          },
                          {
                            id: "fee-lines",
                            label: "Fee lines",
                            ariaLabel: `Fee lines of ${name}`,
                            onSelect: () => setFeeLinesOf({ id: s.id, name }),
                          },
                        ]
                      : []),
                    {
                      id: "access-codes",
                      label: "Access codes",
                      ariaLabel: `Access codes of ${name}`,
                      onSelect: () => setCodesOf({ id: s.id, name }),
                    },
                  ]),
            ];
            return (
              <Item
                key={s.id}
                leading={<ItemInitials text={initialsOf(s.firstName, s.lastName)} />}
                title={`${s.firstName} ${s.middleName ? `${s.middleName} ` : ""}${s.lastName}`}
                subtitle={
                  s.isDraft && s.missing.length > 0 ? (
                    <>
                      <span className="block">{`${s.admissionNo} · ${s.gender === "MALE" ? "Male" : "Female"}`}</span>
                      <span className="block">Missing: {s.missing.join(", ")}</span>
                    </>
                  ) : (
                    `${s.admissionNo} · ${s.gender === "MALE" ? "Male" : "Female"}`
                  )
                }
                facts={facts}
                badges={
                  s.archived || s.isDraft || s.standing !== "ACTIVE" || s.residence || (s.scholarships?.length ?? 0) > 0 ? (
                    <>
                      {s.isDraft && draftPill()}
                      {(s.archived || s.standing !== "ACTIVE") && <StandingBadge standing={s.standing} until={s.standingUntil} />}
                      {s.archived && (
                        <span className="shrink-0 rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-2">
                          Archived
                        </span>
                      )}
                      {s.scholarships?.map((sc) => (
                        <span key={sc.typeName} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${TONE.ok.chip}`}>
                          {sc.percent >= 100 ? `Full scholarship: ${sc.typeName}` : `Scholarship: ${sc.typeName} ${sc.percent}%`}
                        </span>
                      ))}
                      {s.residence && (
                        <span
                          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${TONE[s.residence === "BOARDING" ? "info" : "neutral"].chip}`}
                        >
                          {RESIDENCE_TEXT[s.residence]}
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
      <PupilGuardiansDialog
        pupil={guardiansOf}
        onClose={() => {
          setGuardiansOf(null);
          void load();
        }}
        onChanged={(text) => setNotice({ variant: "success", text })}
      />
      <PupilScholarshipsDialog
        pupil={scholarshipsOf}
        onClose={() => {
          setScholarshipsOf(null);
          void load();
        }}
        onChanged={(text) => setNotice({ variant: "success", text })}
      />
      <PupilFeeItemsDialog
        branchId={branchId}
        pupil={feeLinesOf}
        onClose={() => setFeeLinesOf(null)}
        onChanged={(text) => setNotice({ variant: "success", text })}
      />
      <AccessCodesDialog pupil={codesOf} onClose={() => setCodesOf(null)} onChanged={(text) => setNotice({ variant: "success", text })} />
      {branch.canEdit && (
        <ClassSlipsDialog
          key={`slips-${slips.key}`}
          open={slips.open}
          branchId={branchId}
          classes={classes}
          onClose={() => setSlips((v) => ({ ...v, open: false }))}
          onDone={(text) => setNotice({ variant: "success", text })}
        />
      )}
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
          context={{ branchId, allowDuplicates, asDraft }}
          contextControl={(locked) => (
            <div className="space-y-2">
              <CheckboxField
                label="Add even if a pupil with the same name (and date of birth, when given) is already here (recorded against your name)"
                checked={allowDuplicates}
                disabled={locked}
                onChange={(e) => setAllowDuplicates(e.target.checked)}
              />
              <CheckboxField
                label="Save these as drafts (kept unfinished: left out of classes, attendance, invoices and results until each is completed)"
                checked={asDraft}
                disabled={locked}
                onChange={(e) => setAsDraft(e.target.checked)}
              />
            </div>
          )}
          noun={{ one: "pupil", many: "pupils" }}
          onSaved={async (count) => {
            setNotice({
              variant: "success",
              text: `${count} ${count === 1 ? "pupil" : "pupils"} added to ${branch.name}${asDraft ? " as drafts" : ""}.`,
            });
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
    guardianRelationship: "",
    residence: item?.residence ?? "",
  });
  // Task 0113 D9: an existing guardian found by phone or e-mail (offered instead of typing them again), and the one chosen.
  const [matches, setMatches] = useState<GuardianMatch[] | null>(null);
  const [chosenGuardian, setChosenGuardian] = useState<GuardianMatch | null>(null);
  const [finding, setFinding] = useState(false);
  async function findGuardian() {
    const contact = (f.guardianPhone.trim() || f.guardianEmail.trim()).slice(0, 254);
    if (contact.length < 3) return;
    setFinding(true);
    const reply = await getJson(`/api/v1/guardians/match?contact=${encodeURIComponent(contact)}`);
    setFinding(false);
    setMatches(reply.ok ? (reply.data!.guardians as GuardianMatch[]) : []);
  }
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldProblems, setFieldProblems] = useState<Record<string, string>>({});
  const [namesake, setNamesake] = useState<string | null>(null);
  // Whether the attempt a namesake question came from was "Save as draft": confirming it keeps it a draft.
  const [askedAsDraft, setAskedAsDraft] = useState(false);
  const [askedToComplete, setAskedToComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((all) => ({ ...all, [key]: value }));
  const arms = classes.find((c) => c.name === f.className)?.arms ?? [];
  // A new pupil, or an existing one with no class yet, can be placed in a class from this form.
  const canPlace = !item || item.currentClass === null;

  /// `asDraft` (task 0101 D1): keep the pupil unfinished. A plain save never changes a pupil's draft state (a new pupil is a normal record; a draft stays a draft until it is completed).
  /// `complete`: for a pupil who is already a draft, save the form and then run the complete check (the server says what is missing; the form stays open to say so).
  async function submit(event: FormEvent<HTMLFormElement> | null, allowDuplicate = false, asDraft = false, complete = false) {
    event?.preventDefault();
    if (pending) return;
    setProblem(null);
    setFieldProblems({});
    if (!allowDuplicate) {
      setNamesake(null);
      setAskedAsDraft(asDraft);
      setAskedToComplete(complete);
    }
    setPending(true);
    // The main guardian (task 0113 D9): a guardian chosen from the ones found, or the three fields; on an edit, only when something about the guardian changed (an untouched form does not
    // rewrite the guardian).
    const guardianTouched =
      !item ||
      f.guardianName.trim() !== (item.guardianName ?? "") ||
      f.guardianPhone.trim() !== (item.guardianPhone ?? "") ||
      f.guardianEmail.trim() !== (item.guardianEmail ?? "");
    const guardian = chosenGuardian
      ? { guardianId: chosenGuardian.id }
      : guardianTouched
        ? {
            guardianName: f.guardianName.trim() || null,
            guardianPhone: f.guardianPhone.trim() || null,
            guardianEmail: f.guardianEmail.trim() || null,
          }
        : {};
    const person = {
      firstName: f.firstName,
      middleName: f.middleName.trim() || null,
      lastName: f.lastName,
      gender: f.gender,
      dateOfBirth: f.dateOfBirth,
      ...guardian,
      ...(f.guardianRelationship ? { guardianRelationship: f.guardianRelationship } : {}),
      residence: f.residence || null,
      ...(f.admissionNo.trim() ? { admissionNo: f.admissionNo.trim() } : {}),
      allowDuplicate,
      ...(asDraft ? { isDraft: true } : {}),
    };
    const reply = item
      ? await sendJson(`/api/v1/students/${item.id}`, "PATCH", {
          ...person,
          // A pupil with no class yet can be given one here (a draft needs one to be completed); for a pupil already in a class the form has no such field.
          ...(canPlace && f.className ? { className: f.className, arm: f.arm || undefined } : {}),
        })
      : await sendJson("/api/v1/students", "POST", {
          branchId,
          ...person,
          ...(f.className ? { className: f.className, arm: f.arm || undefined } : {}),
        });
    if (reply.ok && complete && item) {
      const done = await sendJson(`/api/v1/students/${item.id}/complete`, "POST");
      setPending(false);
      // Saved, but still a draft: the form stays open and says what is missing.
      if (!done.ok) return setProblem(say(done, "It could not be completed."));
      return void (await onDone(`${f.firstName} ${f.lastName} saved and completed: no longer a draft.`));
    }
    setPending(false);
    if (reply.ok) {
      const unplaced = f.className && canPlace && reply.data?.enrolled === false;
      return void (await onDone(
        `${f.firstName} ${f.lastName} ${item ? "saved" : "registered"}${asDraft || item?.isDraft ? " as a draft" : ""}.${unplaced ? " They were not put in a class: this branch has no active academic session yet." : ""}`,
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
          {canPlace && (
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
          <SelectField
            label="Day or boarding"
            value={f.residence}
            onChange={(e) => set("residence", e.target.value)}
            error={fieldProblems.residence}
            options={[
              { value: "", label: "Not set" },
              { value: "DAY", label: "Day" },
              { value: "BOARDING", label: "Boarding" },
            ]}
            disabled={pending}
          />
          <fieldset className="space-y-4 rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-fg">Main guardian</legend>
            {chosenGuardian ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-sm text-fg">
                  <span className="font-semibold">{chosenGuardian.name}</span>
                  {chosenGuardian.children.length > 0 ? `, already the guardian of ${chosenGuardian.children.join(", ")}` : ""}
                </p>
                <Button variant="ghost" onClick={() => setChosenGuardian(null)} disabled={pending}>
                  Not this guardian
                </Button>
              </div>
            ) : (
              <>
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
                  onChange={(e) => (set("guardianPhone", e.target.value), setMatches(null))}
                  error={fieldProblems.guardianPhone}
                  autoComplete="off"
                  disabled={pending}
                />
                <TextField
                  label="Guardian email (optional)"
                  inputMode="email"
                  value={f.guardianEmail}
                  onChange={(e) => (set("guardianEmail", e.target.value), setMatches(null))}
                  error={fieldProblems.guardianEmail}
                  autoComplete="off"
                  disabled={pending}
                />
                {!item && (
                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      loading={finding}
                      disabled={pending || (f.guardianPhone.trim() || f.guardianEmail.trim()).length < 3}
                      onClick={() => void findGuardian()}
                    >
                      Find an existing guardian
                    </Button>
                    {matches && matches.length === 0 && (
                      <p className="text-sm text-fg-muted">
                        No guardian you can see has this number or address: a new one is added when you register.
                      </p>
                    )}
                    {matches && matches.length > 0 && (
                      <ul aria-label="Guardians found" className="space-y-2">
                        {matches.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                            <p className="min-w-0 text-sm text-fg">
                              <span className="font-semibold">{m.name}</span>
                              {m.children.length > 0 ? `, guardian of ${m.children.join(", ")}` : ""}
                            </p>
                            <Button variant="secondary" onClick={() => setChosenGuardian(m)} aria-label={`Use ${m.name}`}>
                              Use
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
            <SelectField
              label="Relationship to the pupil (optional)"
              value={f.guardianRelationship}
              onChange={(e) => set("guardianRelationship", e.target.value)}
              options={[{ value: "", label: item ? "Leave as it is" : "Not said" }, ...RELATIONSHIP_OPTIONS]}
              disabled={pending}
            />
            {item && (
              <p className="text-xs text-fg-muted">
                Changing these changes the main guardian, for all their children when you run all their branches. More guardians, blocking
                and codes: Guardians and Access codes in the pupil&apos;s Actions list.
              </p>
            )}
          </fieldset>
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
                onClick={(e) => void submit(e as unknown as FormEvent<HTMLFormElement>, true, askedAsDraft, askedToComplete)}
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
            {item?.isDraft ? (
              <>
                {/* Already a draft: "Save" and "Save as draft" would be the same thing, so it is Save draft (stays a draft) and Complete (runs the check). */}
                <Button type="submit" variant="secondary" disabled={pending}>
                  Save draft
                </Button>
                <Button loading={pending} onClick={() => void submit(null, false, false, true)}>
                  Complete
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => void submit(null, false, true)} disabled={pending}>
                  Save as draft
                </Button>
                <Button type="submit" loading={pending}>
                  {pending ? "Working…" : item ? "Save" : "Register student"}
                </Button>
              </>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
