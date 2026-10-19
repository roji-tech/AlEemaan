"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";
import { CSV_TEMPLATE, parseStudentCsv } from "@/lib/students/csv";

// The branch's pupils (Slice UI1, over the students API): search, register, edit, archive and restore, and import from a spreadsheet. Presentation only: the API
// decides who may read and change what, refuses a namesake unless an administrator confirms it (ADR 0011), and audits that confirmation.

type Student = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  admissionNo: string;
  archived: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  currentClass: string | null;
  sessionLabel: string | null;
};
type ClassOption = { id: string; name: string; arms: { id: string; name: string }[] };
type Paging = { page: number; totalPages: number; total: number };
type Editing = { kind: "form"; item: Student | null } | { kind: "import" } | null;

const PAGE_SIZE = 25;

export function StudentsPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [paging, setPaging] = useState<Paging>({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState<"live" | "archived">("live");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [restoreAsk, setRestoreAsk] = useState<{ student: Student; message: string } | null>(null);

  const load = useCallback(async () => {
    const base = `branchId=${encodeURIComponent(branchId)}`;
    const [s, c] = await Promise.all([
      getJson(`/api/v1/students?${base}&status=${status}&q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`),
      getJson(`/api/v1/academics/class-groups?${base}`),
    ]);
    const bad = [s, c].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setStudents(s.data!.students as Student[]);
    setPaging(s.data!.pagination as Paging);
    setClasses(c.data!.classGroups as ClassOption[]);
  }, [branchId, status, q, page]);

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
      return setRestoreAsk({ student: s, message: reply.message ?? "A current pupil has the same name and date of birth." });
    }
    setNotice(
      reply.ok
        ? { variant: "success", text: `${who} ${archived ? "archived" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }

  return (
    <div className="space-y-6">
      {branches.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setNotice(null);
            setStudents(null);
            setPage(1);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
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

      <section aria-labelledby="students-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="students-heading" className="text-lg font-semibold tracking-tight text-fg">
            Pupils
          </h2>
          {branch.canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing({ kind: "import" })}>
                Import from spreadsheet
              </Button>
              <Button onClick={() => setEditing({ kind: "form", item: null })}>New student</Button>
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Registered in {branch.name}. A pupil is put in a class when registered; to move a whole class up a year use Promotion on the
          Academics page.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
          <TextField
            label="Search students"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name or admission number"
            autoComplete="off"
          />
          <SelectField
            label="Show"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "live" | "archived");
              setPage(1);
            }}
            options={[
              { value: "live", label: "Current students" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>
        {students === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : students.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            {q || status === "archived"
              ? "No students match."
              : branch.canEdit
                ? "No students yet. Add one, or import a class from a spreadsheet."
                : "No students yet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">
                    {s.firstName} {s.middleName ? `${s.middleName} ` : ""}
                    {s.lastName}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {s.admissionNo} · {s.gender === "MALE" ? "Male" : "Female"} · born {s.dateOfBirth} · {s.currentClass ?? "No class yet"}
                    {s.guardianName ? ` · Guardian ${s.guardianName}` : ""}
                    {s.guardianPhone ? ` (${s.guardianPhone})` : ""}
                  </p>
                </div>
                {branch.canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {!s.archived && (
                      <Button
                        variant="secondary"
                        onClick={() => setEditing({ kind: "form", item: s })}
                        aria-label={`Edit ${s.firstName} ${s.lastName}`}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => setArchived(s, !s.archived)}
                      aria-label={`${s.archived ? "Restore" : "Archive"} ${s.firstName} ${s.lastName}`}
                    >
                      {s.archived ? "Restore" : "Archive"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {paging.totalPages > 1 && (
          <nav aria-label="Pages of students" className="mt-3 flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <p className="text-sm text-fg-muted">
              Page {paging.page} of {paging.totalPages} · {paging.total} students
            </p>
            <Button variant="secondary" disabled={page >= paging.totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </section>

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
      <ImportDialog
        key={editing?.kind === "import" ? "import" : "none-import"}
        open={editing?.kind === "import"}
        branchId={branchId}
        branchName={branch.name}
        onClose={() => setEditing(null)}
        onDone={done}
      />
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
    if (reply.ok) return void (await onDone(`${f.firstName} ${f.lastName} ${item ? "saved" : "registered"}.`));
    if (reply.code === "POSSIBLE_DUPLICATE")
      return setNamesake(reply.message ?? "A pupil with the same name and date of birth already exists in this branch.");
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
            label="Date of birth"
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

type ImportSummary = {
  total: number;
  imported: number;
  overridden: number;
  failed: number;
  conflicts: { row: number; name: string; existingAdmissionNo: string }[];
  errors: { row: number; error: string }[];
};

function ImportDialog({
  open,
  branchId,
  branchName,
  onClose,
  onDone,
}: {
  open: boolean;
  branchId: string;
  branchName: string;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const parsed = text.trim() ? parseStudentCsv(text) : null;

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setText(await file.text());
    setSummary(null);
  }
  async function run() {
    if (!parsed || parsed.rows.length === 0 || pending) return;
    setPending(true);
    setProblem(null);
    const reply = await sendJson("/api/v1/students/import", "POST", { branchId, allowDuplicates, rows: parsed.rows });
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "The import didn't run. Nothing was imported."));
    const result = reply.data!.summary as ImportSummary;
    setSummary(result);
    if (result.failed === 0 && result.conflicts.length === 0) await onDone(`Imported ${result.imported} students into ${branchName}.`);
  }
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Import students from a spreadsheet"
      description={`Into ${branchName}. Save your sheet as CSV, then choose the file or paste its contents. Nothing is saved until you press Import.`}
    >
      {open && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Needed columns: first name, last name, gender, date of birth. Optional: admission number, class, arm, guardian name, phone and
            email.{" "}
            <a href={template} download="students-template.csv" className="font-semibold text-brand-fg underline">
              Download a template
            </a>
          </p>
          <div>
            <label htmlFor="student-csv-file" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              CSV file
            </label>
            <input
              id="student-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void chooseFile(e)}
              className="block w-full text-sm text-fg"
            />
          </div>
          <div>
            <label htmlFor="student-csv-text" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              Or paste the rows here
            </label>
            <textarea
              id="student-csv-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSummary(null);
              }}
              rows={6}
              className="w-full rounded-xl border border-line bg-field p-3 font-mono text-xs text-fg focus-visible:outline-2 focus-visible:outline-ring"
              placeholder={CSV_TEMPLATE}
            />
          </div>
          {parsed && (
            <div aria-live="polite" className="space-y-2">
              <p className="text-sm text-fg">
                {parsed.rows.length} ready to import{parsed.problems.length > 0 ? `, ${parsed.problems.length} with problems` : ""}.
              </p>
              {parsed.problems.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-fg">
                  {parsed.problems.slice(0, 50).map((p) => (
                    <li key={`${p.line}-${p.message}`}>
                      Line {p.line}: {p.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" checked={allowDuplicates} onChange={(e) => setAllowDuplicates(e.target.checked)} className="mt-1" />
            <span>
              Import a pupil even if one with the same name and date of birth is already in this branch (recorded against your name).
            </span>
          </label>
          {problem && <Alert variant="error">{problem}</Alert>}
          {summary && (
            <Alert variant={summary.failed === 0 && summary.conflicts.length === 0 ? "success" : "error"}>
              <p>
                {summary.imported} of {summary.total} imported
                {summary.overridden ? `, ${summary.overridden} as namesakes you confirmed` : ""}.
              </p>
              {summary.conflicts.map((c) => (
                <p key={`c${c.row}`} className="text-xs">
                  Row {c.row}: {c.name} already exists ({c.existingAdmissionNo}).
                </p>
              ))}
              {summary.errors.map((e) => (
                <p key={`e${e.row}`} className="text-xs">
                  Row {e.row}: {e.error}
                </p>
              ))}
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {summary ? "Close" : "Cancel"}
            </Button>
            <Button onClick={() => void run()} loading={pending} disabled={!parsed || parsed.rows.length === 0 || summary !== null}>
              {pending ? "Importing…" : `Import ${parsed?.rows.length ?? 0} students`}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
