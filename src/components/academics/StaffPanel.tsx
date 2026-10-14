"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// The branch's staff and who teaches what (Slice P1d, over the P1c API). A record is how the branch knows a person - including someone who never signs in; a
// sign-in account is an existing member it can be linked to. Presentation only: the API decides who may read and change what.

type Account =
  | { state: "none" }
  | { state: "linked"; userId: string; name: string | null; email: string | null; deactivated: boolean; roleDiffers: boolean };
type Staff = {
  id: string;
  category: "TEACHING" | "NON_TEACHING";
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  archived: boolean;
  account: Account;
  assignmentCount: number;
};
type Assignment = { id: string; subjectId: string; subjectName: string; classArmId: string; armName: string; classGroupName: string };
type Linkable = { userId: string; name: string | null; email: string | null };
type ClassOption = { id: string; name: string; subjectIds: string[]; arms: { id: string; name: string }[] };
type SubjectOption = { id: string; name: string };
type Editing = { kind: "record"; item: Staff | null } | { kind: "manage"; item: Staff } | null;

const CATEGORY = { TEACHING: "Teaching", NON_TEACHING: "Non-teaching" } as const;

export function StaffPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [status, setStatus] = useState<"live" | "archived">("live");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    const base = `branchId=${encodeURIComponent(branchId)}`;
    const [s, c, sub] = await Promise.all([
      getJson(`/api/v1/staff?${base}&status=${status}&q=${encodeURIComponent(q)}`),
      getJson(`/api/v1/academics/class-groups?${base}`),
      getJson(`/api/v1/academics/subjects?${base}`),
    ]);
    const bad = [s, c, sub].find((r) => !r.ok);
    if (bad) return setError(say(bad, "Couldn't load this branch."));
    setError(null);
    setStaff(s.data!.staff as Staff[]);
    setClasses(c.data!.classGroups as ClassOption[]);
    setSubjects(sub.data!.subjects as SubjectOption[]);
  }, [branchId, status, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on a branch / filter change is exactly what this effect is for
    void load();
  }, [load]);

  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  async function setArchived(person: Staff, archived: boolean) {
    const reply = await sendJson(`/api/v1/staff/${person.id}/${archived ? "archive" : "restore"}`, "POST");
    const who = `${person.firstName} ${person.lastName}`;
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
            setStaff(null);
            setBranchId(e.target.value);
          }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="staff-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="staff-heading" className="text-lg font-semibold tracking-tight text-fg">
            Staff
          </h2>
          {branch.canEdit && <Button onClick={() => setEditing({ kind: "record", item: null })}>New staff record</Button>}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Everyone the branch employs, whether or not they sign in. A record does not create a login.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
          <TextField
            label="Search staff"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email or phone"
            autoComplete="off"
          />
          <SelectField
            label="Show"
            value={status}
            onChange={(e) => setStatus(e.target.value as "live" | "archived")}
            options={[
              { value: "live", label: "Current staff" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>
        {staff === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : staff.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            {q || status === "archived" ? "No staff match." : "No staff records yet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {staff.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {CATEGORY[p.category]} · {p.account.state === "linked" ? "Can sign in" : "No sign-in"} · {p.assignmentCount}{" "}
                    {p.assignmentCount === 1 ? "assignment" : "assignments"}
                    {p.email ? ` · ${p.email}` : ""}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEditing({ kind: "manage", item: p })}
                    aria-label={`${branch.canEdit ? "Manage" : "View"} ${p.firstName} ${p.lastName}`}
                  >
                    {branch.canEdit ? "Manage" : "View"}
                  </Button>
                  {branch.canEdit && (
                    <>
                      {!p.archived && (
                        <Button
                          variant="secondary"
                          onClick={() => setEditing({ kind: "record", item: p })}
                          aria-label={`Edit ${p.firstName} ${p.lastName}`}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => setArchived(p, !p.archived)}
                        aria-label={`${p.archived ? "Restore" : "Archive"} ${p.firstName} ${p.lastName}`}
                      >
                        {p.archived ? "Restore" : "Archive"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordDialog
        key={editing?.kind === "record" ? (editing.item?.id ?? "new") : "none"}
        open={editing?.kind === "record"}
        item={editing?.kind === "record" ? editing.item : null}
        branchId={branchId}
        onClose={() => setEditing(null)}
        onDone={done}
      />
      <ManageDialog
        key={editing?.kind === "manage" ? editing.item.id : "none-manage"}
        open={editing?.kind === "manage"}
        person={editing?.kind === "manage" ? editing.item : null}
        canEdit={branch.canEdit}
        classes={classes}
        subjects={subjects}
        onClose={() => setEditing(null)}
        onChanged={load}
      />
    </div>
  );
}

function RecordDialog({
  open,
  item,
  branchId,
  onClose,
  onDone,
}: {
  open: boolean;
  item: Staff | null;
  branchId: string;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [f, setF] = useState({
    category: item?.category ?? "TEACHING",
    firstName: item?.firstName ?? "",
    lastName: item?.lastName ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldProblems, setFieldProblems] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof f, value: string) => setF((all) => ({ ...all, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setProblem(null);
    setFieldProblems({});
    setPending(true);
    const body = {
      category: f.category,
      firstName: f.firstName,
      lastName: f.lastName,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
    };
    const reply = item
      ? await sendJson(`/api/v1/staff/${item.id}`, "PATCH", body)
      : await sendJson("/api/v1/staff", "POST", { branchId, ...body });
    setPending(false);
    if (reply.ok) return void (await onDone(`${f.firstName} ${f.lastName} ${item ? "saved" : "added"}.`));
    const found: Record<string, string> = {};
    for (const key of ["firstName", "lastName", "phone", "email"]) {
      const message = problemFor(reply, key);
      if (message) found[key] = message;
    }
    setFieldProblems(found);
    if (Object.keys(found).length === 0) setProblem(say(reply, "That didn't work."));
  }

  return (
    <Dialog open={open} onClose={onClose} title={item ? `Edit ${item.firstName} ${item.lastName}` : "New staff record"}>
      {open && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <SelectField
            label="Kind of staff"
            value={f.category}
            onChange={(e) => set("category", e.target.value)}
            options={[
              { value: "TEACHING", label: "Teaching" },
              { value: "NON_TEACHING", label: "Non-teaching (office, security, driver…)" },
            ]}
            disabled={pending || item?.account.state === "linked"}
            hint={item?.account.state === "linked" ? "This person has a sign-in; change their role on the Users page first." : undefined}
          />
          <TextField
            label="First name"
            value={f.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            error={fieldProblems.firstName}
            maxLength={80}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Last name"
            value={f.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            error={fieldProblems.lastName}
            maxLength={80}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Phone (optional)"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={fieldProblems.phone}
            autoComplete="off"
            disabled={pending}
          />
          <TextField
            label="Email (optional)"
            inputMode="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            error={fieldProblems.email}
            autoComplete="off"
            disabled={pending}
          />
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? "Working…" : item ? "Save" : "Add staff record"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ManageDialog({
  open,
  person,
  canEdit,
  classes,
  subjects,
  onClose,
  onChanged,
}: {
  open: boolean;
  person: Staff | null;
  canEdit: boolean;
  classes: ClassOption[];
  subjects: SubjectOption[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [account, setAccount] = useState<Account | null>(person?.account ?? null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [linkable, setLinkable] = useState<Linkable[]>([]);
  const [pick, setPick] = useState("");
  const [armId, setArmId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = person?.id;

  const refresh = useCallback(async () => {
    if (!id) return;
    const detail = await getJson(`/api/v1/staff/${id}`);
    if (!detail.ok) return setProblem(say(detail, "Couldn't load this person."));
    setAccount((detail.data!.staff as Staff).account);
    setAssignments(detail.data!.assignments as Assignment[]);
    if (canEdit && (detail.data!.staff as Staff).account.state === "none") {
      const l = await getJson(`/api/v1/staff/${id}/account`);
      if (l.ok) setLinkable(l.data!.accounts as Linkable[]);
      else setProblem(say(l, "Couldn't load the members you can link."));
    }
  }, [id, canEdit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the person's detail when the dialog opens is exactly what this effect is for
    if (open) void refresh();
  }, [open, refresh]);

  async function run(
    call: () => Promise<{ ok: boolean; status: number; message?: string; code?: string; data?: Record<string, unknown> }>,
    success: string,
  ) {
    if (pending) return;
    setPending(true);
    setProblem(null);
    setInfo(null);
    const reply = await call();
    setPending(false);
    if (reply.ok) {
      setInfo(success);
      await refresh();
      await onChanged();
    } else setProblem(say(reply as Parameters<typeof say>[0], "That didn't work."));
  }

  const arm = classes
    .flatMap((c) => c.arms.map((a) => ({ ...a, className: c.name, subjectIds: c.subjectIds })))
    .find((a) => a.id === armId);
  const offered = subjects.filter((s) => arm?.subjectIds.includes(s.id));
  const armOptions = classes.flatMap((c) => c.arms.map((a) => ({ value: a.id, label: `${c.name} ${a.name}` })));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={person ? `${person.firstName} ${person.lastName}` : "Staff"}
      description={person ? CATEGORY[person.category] : undefined}
    >
      {person && (
        <div className="space-y-6">
          {problem && <Alert variant="error">{problem}</Alert>}
          <div aria-live="polite" className="empty:hidden">
            {info && <Alert variant="success">{info}</Alert>}
          </div>

          <section aria-labelledby="account-heading" className="space-y-2">
            <h3 id="account-heading" className="text-sm font-semibold text-fg">
              Sign-in
            </h3>
            {account?.state === "linked" ? (
              <>
                <p className="text-sm text-fg-muted">
                  Linked to {account.name ?? account.email ?? "a member"}
                  {account.deactivated ? " (deactivated)" : ""}.
                  {account.roleDiffers ? " Their role on the Users page no longer matches this record." : ""}
                </p>
                {canEdit && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(() => sendJson(`/api/v1/staff/${person.id}/account`, "DELETE"), "Sign-in unlinked.")}
                  >
                    Unlink sign-in
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-fg-muted">No sign-in. This person is recorded but cannot log in.</p>
                {canEdit &&
                  (linkable.length === 0 ? (
                    <p className="text-sm text-fg-muted">
                      No member of this branch with a matching role is free to link. Invite them on the Users page first.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-56 flex-1">
                        <SelectField
                          label="Link to a member"
                          value={pick}
                          onChange={(e) => setPick(e.target.value)}
                          options={[
                            { value: "", label: "Choose a member…" },
                            ...linkable.map((l) => ({ value: l.userId, label: l.name ?? l.email ?? l.userId })),
                          ]}
                          disabled={pending}
                        />
                      </div>
                      <Button
                        disabled={pending || !pick}
                        onClick={() =>
                          run(() => sendJson(`/api/v1/staff/${person.id}/account`, "PUT", { userId: pick }), "Sign-in linked.")
                        }
                      >
                        Link sign-in
                      </Button>
                    </div>
                  ))}
              </>
            )}
          </section>

          <section aria-labelledby="assign-heading" className="space-y-2">
            <h3 id="assign-heading" className="text-sm font-semibold text-fg">
              Teaches
            </h3>
            {assignments === null ? (
              <p className="text-sm text-fg-muted" aria-busy="true">
                Loading…
              </p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-fg-muted">No subjects assigned.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="text-sm text-fg">
                      {a.subjectName} · {a.classGroupName} {a.armName}
                    </span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        aria-label={`Remove ${a.subjectName} in ${a.classGroupName} ${a.armName}`}
                        onClick={() =>
                          run(() => sendJson(`/api/v1/staff/${person.id}/assignments/${a.id}`, "DELETE"), "Assignment removed.")
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <SelectField
                  label="Class and arm"
                  value={armId}
                  onChange={(e) => {
                    setArmId(e.target.value);
                    setSubjectId("");
                  }}
                  options={[{ value: "", label: "Choose…" }, ...armOptions]}
                  disabled={pending}
                />
                <SelectField
                  label="Subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  options={[
                    {
                      value: "",
                      label: armId ? (offered.length ? "Choose…" : "This class studies no subjects yet") : "Choose a class first",
                    },
                    ...offered.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  disabled={pending || !armId}
                />
                <Button
                  disabled={pending || !armId || !subjectId}
                  onClick={() =>
                    run(
                      () => sendJson(`/api/v1/staff/${person.id}/assignments`, "POST", { subjectId, classArmId: armId }),
                      "Subject assigned.",
                    )
                  }
                >
                  Assign
                </Button>
              </div>
            )}
          </section>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
