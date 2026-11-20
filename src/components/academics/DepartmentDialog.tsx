"use client";

import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { Pill } from "@/components/academics/StaffDetails";
import { CATEGORY_TEXT, displayName } from "@/components/academics/staff-model";
import { headLine, peopleText, subjectsText } from "@/lib/academics/department-rules";

// One department, opened from its card (task 0101 D7): its members and its head, and its subjects. An administrator does everything; the head of THIS department adds and removes members and
// subjects; everyone else only reads. Presentation only: every button calls an API that decides who may (and the list's `canManage` is only what the buttons are drawn from).

export type DepartmentMember = {
  staffRecordId: string;
  name: string;
  isHead: boolean;
  category: "TEACHING" | "NON_TEACHING";
  archived: boolean;
};
export type Department = {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  archived: boolean;
  head: { staffRecordId: string; name: string } | null;
  members: DepartmentMember[];
  subjects: { id: string; name: string; code: string | null }[];
  /// May the signed-in person change the members and the subjects (an administrator, or the head).
  canManage: boolean;
};

type StaffChoice = {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  category: "TEACHING" | "NON_TEACHING";
  archived: boolean;
  email: string | null;
};
type SubjectChoice = { id: string; name: string; code: string | null; department: { id: string; name: string } | null };

const hodPill = (
  <Pill tone="ok">
    <abbr title="Head of department" className="no-underline">
      HOD
    </abbr>
  </Pill>
);

export function DepartmentDialog({
  department,
  isAdmin,
  branchId,
  onClose,
  onChanged,
}: {
  /// The department to show; null closes the dialog. The panel passes the freshest copy of it after every change.
  department: Department | null;
  /// An administrator of the branch: may also choose the head.
  isAdmin: boolean;
  branchId: string;
  onClose: () => void;
  /// Called after a change with the sentence to show, or null when the list only needs reading again (a refusal that means what was on screen is out of date).
  onChanged: (text: string | null) => Promise<void>;
}) {
  return (
    <Dialog
      open={department !== null}
      onClose={onClose}
      title={department ? `Department: ${department.name}` : "Department"}
      description={department ? headLine(department.head?.name ?? null) : undefined}
      wide
    >
      {department && (
        <DepartmentBody
          key={department.id}
          department={department}
          isAdmin={isAdmin}
          branchId={branchId}
          onClose={onClose}
          onChanged={onChanged}
        />
      )}
    </Dialog>
  );
}

function DepartmentBody({
  department: d,
  isAdmin,
  branchId,
  onClose,
  onChanged,
}: {
  department: Department;
  isAdmin: boolean;
  branchId: string;
  onClose: () => void;
  onChanged: (text: string | null) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The person the administrator chose as head while there is already one: asked to confirm before the old head is replaced.
  const [replace, setReplace] = useState<DepartmentMember | null>(null);
  const [adding, setAdding] = useState<"people" | "subjects" | null>(null);
  const membersId = useId();
  const subjectsId = useId();
  const head = d.head;
  const editable = d.canManage && !d.archived;
  const base = `/api/v1/academics/departments/${d.id}`;

  /// Runs one change. A 409 means what is on screen may be out of date (the head changed, a person was archived): say so and read the list again.
  async function run(key: string, call: () => Promise<Reply>, done: string) {
    if (busy) return;
    setBusy(key);
    setError(null);
    const reply = await call();
    setBusy(null);
    if (!reply.ok) {
      setError(say(reply, "That didn't work."));
      if (reply.status === 409) await onChanged(null);
      return;
    }
    await onChanged(done);
  }
  const setHead = async (staffRecordId: string | null, done: string) => {
    setReplace(null);
    await run(
      `head:${staffRecordId ?? "none"}`,
      () => sendJson(`${base}/head`, "PUT", { staffRecordId, replacing: head?.staffRecordId ?? null }),
      done,
    );
  };
  const chooseHead = (person: DepartmentMember) => {
    if (head && head.staffRecordId !== person.staffRecordId) return setReplace(person);
    void setHead(person.staffRecordId, `${person.name} is now the head of ${d.name}.`);
  };

  return (
    <div className="mt-4 space-y-6">
      {d.description && <p className="text-sm text-fg-muted">{d.description}</p>}
      {d.archived && <Alert variant="info">This department is archived. Restore it from the list to change it.</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {replace && head && (
        <div role="group" aria-label="Replace the head" className="space-y-3">
          <Alert variant="warning">
            Replace {head.name} as head of {d.name}? {replace.name} becomes the head; {head.name} stays a member.
          </Alert>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" data-initial-focus onClick={() => setReplace(null)}>
              Keep {head.name}
            </Button>
            <Button
              loading={busy !== null}
              onClick={() => void setHead(replace.staffRecordId, `${replace.name} is now the head of ${d.name}.`)}
            >
              Replace head
            </Button>
          </div>
        </div>
      )}

      <section aria-labelledby={membersId} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={membersId} className="text-sm font-semibold text-fg">
            Members ({d.members.length})
          </h3>
          {editable && adding !== "people" && (
            <Button variant="secondary" onClick={() => setAdding("people")}>
              Add people
            </Button>
          )}
        </div>
        {adding === "people" && (
          <PeoplePicker
            branchId={branchId}
            department={d}
            onCancel={() => setAdding(null)}
            onDone={async (added) => {
              setAdding(null);
              await onChanged(`${peopleText(added)} added to ${d.name}.`);
            }}
          />
        )}
        {d.members.length === 0 ? (
          <p className="text-sm text-fg-muted">No one is in this department yet.</p>
        ) : (
          <ul aria-label={`Members of ${d.name}`} className="divide-y divide-line rounded-xl border border-line">
            {d.members.map((m) => (
              <li key={m.staffRecordId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-fg">{m.name}</span>
                  <span className="text-fg-muted">{CATEGORY_TEXT[m.category]}</span>
                  {m.isHead && hodPill}
                  {m.archived && <span className="text-fg-muted">(archived)</span>}
                </span>
                <span className="flex flex-wrap gap-2">
                  {isAdmin && !d.archived && !m.isHead && !m.archived && (
                    <Button
                      variant="secondary"
                      loading={busy === `head:${m.staffRecordId}`}
                      disabled={busy !== null}
                      aria-label={`Make ${m.name} head of ${d.name}`}
                      onClick={() => chooseHead(m)}
                    >
                      Make head
                    </Button>
                  )}
                  {isAdmin && !d.archived && m.isHead && (
                    <Button
                      variant="ghost"
                      loading={busy === "head:none"}
                      disabled={busy !== null}
                      aria-label={`Remove ${m.name} as head of ${d.name}`}
                      onClick={() => void setHead(null, `${d.name} has no head now.`)}
                    >
                      Remove as head
                    </Button>
                  )}
                  {editable && (
                    <Button
                      variant="ghost"
                      loading={busy === `rm:${m.staffRecordId}`}
                      disabled={busy !== null}
                      aria-label={`Remove ${m.name} from ${d.name}`}
                      onClick={() =>
                        void run(
                          `rm:${m.staffRecordId}`,
                          () => sendJson(`${base}/members/${m.staffRecordId}`, "DELETE"),
                          `${m.name} removed from ${d.name}.`,
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={subjectsId} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={subjectsId} className="text-sm font-semibold text-fg">
            Subjects ({d.subjects.length})
          </h3>
          {editable && adding !== "subjects" && (
            <Button variant="secondary" onClick={() => setAdding("subjects")}>
              Add subjects
            </Button>
          )}
        </div>
        {adding === "subjects" && (
          <SubjectPicker
            branchId={branchId}
            department={d}
            onCancel={() => setAdding(null)}
            onDone={async (added, moved) => {
              setAdding(null);
              await onChanged(`${subjectsText(added)} added to ${d.name}${moved > 0 ? ` (${moved} moved from another department)` : ""}.`);
            }}
          />
        )}
        {d.subjects.length === 0 ? (
          <p className="text-sm text-fg-muted">No subjects belong to this department yet.</p>
        ) : (
          <ul aria-label={`Subjects of ${d.name}`} className="divide-y divide-line rounded-xl border border-line">
            {d.subjects.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">
                  <span className="font-medium text-fg">{s.name}</span>
                  {s.code && <span className="ml-2 font-mono text-xs text-fg-muted">{s.code}</span>}
                </span>
                {editable && (
                  <Button
                    variant="ghost"
                    loading={busy === `sub:${s.id}`}
                    disabled={busy !== null}
                    aria-label={`Remove ${s.name} from ${d.name}`}
                    onClick={() =>
                      void run(`sub:${s.id}`, () => sendJson(`${base}/subjects/${s.id}`, "DELETE"), `${s.name} removed from ${d.name}.`)
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

const matches = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

/// Choose people of the branch who are not yet in the department, one or many. The API checks again (live staff of the same branch).
function PeoplePicker({
  branchId,
  department,
  onCancel,
  onDone,
}: {
  branchId: string;
  department: Department;
  onCancel: () => void;
  onDone: (added: number) => Promise<void>;
}) {
  const [staff, setStaff] = useState<StaffChoice[] | null>(null);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getJson(`/api/v1/staff?branchId=${encodeURIComponent(branchId)}`).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the staff."));
      setStaff(reply.data!.staff as StaffChoice[]);
    });
    return () => {
      live = false;
    };
  }, [branchId]);
  const inside = new Set(department.members.map((m) => m.staffRecordId));
  const options = (staff ?? []).filter(
    (p) => !p.archived && !inside.has(p.id) && (q.trim() === "" || matches(displayName(p), q) || matches(p.email ?? "", q)),
  );
  async function add() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`/api/v1/academics/departments/${department.id}/members`, "POST", { staffIds: chosen });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    await onDone(Number(reply.data!.added ?? 0));
  }
  return (
    <div role="group" aria-label="Add people" className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
      <TextField label="Search staff" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} autoComplete="off" />
      {staff === null && !error ? (
        <p className="text-sm text-fg-muted">Loading the staff…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {q.trim() === "" ? "Everyone on the staff list is already in this department." : "No one matches."}
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto pr-1">
          {options.map((p) => (
            <CheckboxField
              key={p.id}
              label={`${displayName(p)}${p.category === "NON_TEACHING" ? " (non-teaching)" : ""}`}
              checked={chosen.includes(p.id)}
              onChange={(e) => setChosen((all) => (e.target.checked ? [...all, p.id] : all.filter((x) => x !== p.id)))}
              disabled={busy}
            />
          ))}
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={chosen.length === 0} onClick={() => void add()}>
          {chosen.length === 0 ? "Add people" : `Add ${peopleText(chosen.length)}`}
        </Button>
      </div>
    </div>
  );
}

/// Choose subjects of the branch that are not yet in the department. A subject is in one department only: one that is in another is moved here, and says so.
function SubjectPicker({
  branchId,
  department,
  onCancel,
  onDone,
}: {
  branchId: string;
  department: Department;
  onCancel: () => void;
  onDone: (added: number, moved: number) => Promise<void>;
}) {
  const [subjects, setSubjects] = useState<SubjectChoice[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getJson(`/api/v1/academics/subjects?branchId=${encodeURIComponent(branchId)}`).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the subjects."));
      setSubjects(reply.data!.subjects as SubjectChoice[]);
    });
    return () => {
      live = false;
    };
  }, [branchId]);
  const options = (subjects ?? []).filter((s) => s.department?.id !== department.id);
  async function add() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`/api/v1/academics/departments/${department.id}/subjects`, "POST", { subjectIds: chosen });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    await onDone(Number(reply.data!.added ?? 0), Number(reply.data!.moved ?? 0));
  }
  return (
    <div role="group" aria-label="Add subjects" className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
      {subjects === null && !error ? (
        <p className="text-sm text-fg-muted">Loading the subjects…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">Every subject of this branch is already in this department.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto pr-1">
          {options.map((s) => (
            <CheckboxField
              key={s.id}
              label={
                <>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                  {s.department && <span className="text-fg-muted"> · now in {s.department.name}, moves here</span>}
                </>
              }
              checked={chosen.includes(s.id)}
              onChange={(e) => setChosen((all) => (e.target.checked ? [...all, s.id] : all.filter((x) => x !== s.id)))}
              disabled={busy}
            />
          ))}
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={chosen.length === 0} onClick={() => void add()}>
          {chosen.length === 0 ? "Add subjects" : `Add ${subjectsText(chosen.length)}`}
        </Button>
      </div>
    </div>
  );
}
