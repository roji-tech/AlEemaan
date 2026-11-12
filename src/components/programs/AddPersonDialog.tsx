"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import type { ProgramDetail } from "@/components/programs/model";
import { SKIP_TEXT } from "@/components/programs/people-model";

// Adding people to a program (task 0043, slice P2): a pupil or a member of staff (the school's record is LINKED, never typed again), a whole class of pupils (it says who would be
// added and who skipped before anything happens), or a new person (an adult, a guardian or a child). The server decides who may add whom; this only asks and shows what it says.

type Mode = "pupil" | "staff" | "class" | "new";
type Candidate = { id: string; name: string; detail: string; branchId: string; branchName: string; note: string | null };
type ClassOption = { id: string; label: string; branchId: string; branchName: string; pupils: number };
type Plan = {
  arm: { name: string; className: string };
  willAdd: { studentId: string; name: string; note: string | null }[];
  skipped: { name: string; reason: string }[];
  added: number;
};

const MODES = [
  { value: "pupil", label: "A pupil of the school" },
  { value: "staff", label: "A member of staff" },
  { value: "class", label: "A whole class of pupils" },
  { value: "new", label: "A new person (adult, guardian or child)" },
] as const;

export function AddPersonDialog({
  open,
  program,
  onClose,
  onAdded,
}: {
  open: boolean;
  program: ProgramDetail;
  onClose: () => void;
  /// Something was added: the list and the counts reload; `message` is what to say about it.
  onAdded: (message: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add people" description="Choose who is joining, and the group they join.">
      {open && <Body program={program} onClose={onClose} onAdded={onAdded} />}
    </Dialog>
  );
}

function Body({ program, onClose, onAdded }: { program: ProgramDetail; onClose: () => void; onAdded: (message: string) => void }) {
  const groups = program.groups.filter((group) => !group.archived);
  const branches = program.branches.filter((branch) => branch.takingPart && program.manageBranchIds.includes(branch.id));
  const [mode, setMode] = useState<Mode>("pupil");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const groupOptions = groups.map((group) => ({ value: group.id, label: group.path }));

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <Alert variant="warning">This program has no groups yet. Add one on the Structure tab first: everyone is placed in a group.</Alert>
      ) : (
        <>
          <SelectField label="Who are you adding?" value={mode} onChange={(e) => setMode(e.target.value as Mode)} options={MODES} />
          <SelectField
            label="Which group do they join?"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            options={groupOptions}
          />
          {(mode === "pupil" || mode === "staff") && (
            <Find key={mode} kind={mode === "pupil" ? "STUDENT" : "STAFF"} program={program} groupId={groupId} onAdded={onAdded} />
          )}
          {mode === "class" && <WholeClass program={program} groupId={groupId} onAdded={onAdded} onClose={onClose} />}
          {mode === "new" && <NewPerson program={program} groupId={groupId} branches={branches} onAdded={onAdded} />}
        </>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Find({
  kind,
  program,
  groupId,
  onAdded,
}: {
  kind: "STUDENT" | "STAFF";
  program: ProgramDetail;
  groupId: string;
  onAdded: (message: string) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [again, setAgain] = useState(0);
  const word = kind === "STUDENT" ? "pupil" : "member of staff";

  useEffect(() => {
    if (q.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void getJson(
        `/api/v1/programs/${encodeURIComponent(program.id)}/people/candidates?kind=${kind}&q=${encodeURIComponent(q.trim())}`,
        controller.signal,
      ).then((reply) => {
        if (controller.signal.aborted) return;
        if (!reply.ok) return setError(say(reply, "The search didn't work."));
        setError(null);
        setFound(reply.data as unknown as Candidate[]);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, kind, program.id, again]);

  async function add(person: Candidate) {
    setAdding(person.id);
    setError(null);
    const reply = await sendJson(
      `/api/v1/programs/${encodeURIComponent(program.id)}/people`,
      "POST",
      kind === "STUDENT" ? { kind, studentId: person.id, groupId } : { kind, staffRecordId: person.id, groupId },
    );
    setAdding(null);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    setAgain((n) => n + 1);
    onAdded(`${person.name} was added.`);
  }

  return (
    <div className="space-y-3">
      <TextField
        label={`Search for a ${word}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        hint={kind === "STUDENT" ? "A name or an admission number (at least 2 characters)." : "A name (at least 2 characters)."}
        autoComplete="off"
      />
      {error && <Alert variant="error">{error}</Alert>}
      {q.trim().length >= 2 && found.length === 0 && !error && (
        <p className="text-sm text-fg-muted">Nobody found. Only records in a branch you manage, that are not archived, appear here.</p>
      )}
      <ul className="space-y-2">
        {(q.trim().length >= 2 ? found : []).map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="min-w-0 break-words text-fg">
              <span className="font-semibold">{person.name}</span>
              <span className="text-fg-muted">
                {" "}
                · {person.detail} · {person.branchName}
              </span>
              {person.note && <span className="block text-xs text-warn-fg">{person.note}</span>}
            </span>
            <Button
              variant="secondary"
              aria-label={`Add ${person.name}`}
              loading={adding === person.id}
              disabled={person.note?.startsWith("Already") || person.note?.startsWith("Has left")}
              onClick={() => void add(person)}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WholeClass({
  program,
  groupId,
  onAdded,
  onClose,
}: {
  program: ProgramDetail;
  groupId: string;
  onAdded: (message: string) => void;
  onClose: () => void;
}) {
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [armId, setArmId] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`/api/v1/programs/${encodeURIComponent(program.id)}/people/classes`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setError(say(reply, "The classes couldn't be loaded."));
      const list = reply.data as unknown as ClassOption[];
      setClasses(list);
      setArmId(list[0]?.id ?? "");
    });
    return () => controller.abort();
  }, [program.id]);

  async function send(confirm: boolean) {
    setPending(true);
    setError(null);
    const reply: Reply = await sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/people/class`, "POST", {
      classArmId: armId,
      groupId,
      confirm,
    });
    setPending(false);
    if (!reply.ok) return setError(reply.status === 0 ? NETWORK_ERROR : say(reply, "That didn't work."));
    const result = reply.data as unknown as Plan;
    if (!confirm) return setPlan(result);
    onAdded(`${result.added} ${result.added === 1 ? "pupil was" : "pupils were"} added from ${result.arm.className} ${result.arm.name}.`);
    onClose();
  }

  if (classes === null && !error) return <p className="text-sm text-fg-muted">Loading the classes…</p>;
  if (classes && classes.length === 0) return <Alert variant="info">There are no classes in the branches you manage.</Alert>;
  return (
    <div className="space-y-3">
      <SelectField
        label="Which class?"
        value={armId}
        onChange={(e) => {
          setArmId(e.target.value);
          setPlan(null);
        }}
        options={(classes ?? []).map((c) => ({
          value: c.id,
          label: `${c.label} (${c.branchName}, ${c.pupils} ${c.pupils === 1 ? "pupil" : "pupils"})`,
        }))}
      />
      {error && <Alert variant="error">{error}</Alert>}
      {plan ? (
        <div className="space-y-3 rounded-xl border border-line p-3 text-sm">
          <p className="font-semibold text-fg">
            {plan.willAdd.length} {plan.willAdd.length === 1 ? "pupil" : "pupils"} will be added
            {plan.skipped.length > 0 ? `, ${plan.skipped.length} will be skipped` : ""}.
          </p>
          {plan.skipped.length > 0 && (
            <ul className="space-y-1 text-fg-muted" aria-label="Skipped">
              {plan.skipped.map((entry) => (
                <li key={entry.name + entry.reason}>
                  {entry.name}: {SKIP_TEXT[entry.reason] ?? entry.reason}
                </li>
              ))}
            </ul>
          )}
          <Button loading={pending} disabled={plan.willAdd.length === 0} onClick={() => void send(true)}>
            Add {plan.willAdd.length} {plan.willAdd.length === 1 ? "pupil" : "pupils"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" loading={pending} disabled={!armId} onClick={() => void send(false)}>
          See who would be added
        </Button>
      )}
    </div>
  );
}

type Draft = {
  kind: "ADULT" | "GUARDIAN" | "CHILD";
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  guardianName: string;
  guardianPhone: string;
  branchId: string;
};

function NewPerson({
  program,
  groupId,
  branches,
  onAdded,
}: {
  program: ProgramDetail;
  groupId: string;
  branches: ProgramDetail["branches"];
  onAdded: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    kind: "ADULT",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    guardianName: "",
    guardianPhone: "",
    branchId: branches[0]?.id ?? "",
  });
  const [problems, setProblems] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [namesake, setNamesake] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNamesake(null);
    setConfirmed(false);
  };
  const child = draft.kind === "CHILD";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setProblems({});
    setPending(true);
    const blank = (value: string) => (value.trim() === "" ? undefined : value.trim());
    const reply = await sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/people`, "POST", {
      kind: draft.kind,
      firstName: draft.firstName,
      lastName: draft.lastName,
      branchId: draft.branchId,
      groupId,
      dateOfBirth: blank(draft.dateOfBirth),
      phone: blank(draft.phone),
      email: blank(draft.email),
      ...(child ? { guardianName: blank(draft.guardianName), guardianPhone: blank(draft.guardianPhone) } : {}),
      ...(confirmed ? { confirmNamesake: true } : {}),
    });
    setPending(false);
    if (reply.ok) {
      onAdded(`${draft.firstName} ${draft.lastName} was added.`);
      setDraft({ ...draft, firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", guardianName: "", guardianPhone: "" });
      return;
    }
    if (reply.code === "POSSIBLE_DUPLICATE")
      return setNamesake(reply.message ?? "Someone with the same details is already in this program.");
    const fields = ["firstName", "lastName", "dateOfBirth", "phone", "email", "guardianName", "guardianPhone", "branchId"] as const;
    const found = Object.fromEntries(fields.map((f) => [f, problemFor(reply, f)]));
    if (Object.values(found).some(Boolean)) return setProblems(found);
    setError(reply.status === 0 ? NETWORK_ERROR : say(reply, "That didn't work."));
  }

  if (branches.length === 0)
    return <Alert variant="warning">None of this program&apos;s branches is one you manage, so you can&apos;t add a new person.</Alert>;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <SelectField
        label="What kind of person?"
        value={draft.kind}
        onChange={(e) => set("kind", e.target.value)}
        options={[
          { value: "ADULT", label: "An adult" },
          { value: "GUARDIAN", label: "A parent or guardian" },
          { value: "CHILD", label: "A small child" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="First name"
          value={draft.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          error={problems.firstName}
          required
          autoComplete="off"
        />
        <TextField
          label="Last name"
          value={draft.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          error={problems.lastName}
          required
          autoComplete="off"
        />
      </div>
      <TextField
        label={child ? "Date of birth" : "Date of birth (optional)"}
        type="date"
        value={draft.dateOfBirth}
        onChange={(e) => set("dateOfBirth", e.target.value)}
        error={problems.dateOfBirth}
        required={child}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Phone (optional)"
          type="tel"
          value={draft.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={problems.phone}
          autoComplete="off"
        />
        <TextField
          label="E-mail (optional)"
          type="email"
          value={draft.email}
          onChange={(e) => set("email", e.target.value)}
          error={problems.email}
          autoComplete="off"
        />
      </div>
      {child && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Guardian's name"
            value={draft.guardianName}
            onChange={(e) => set("guardianName", e.target.value)}
            error={problems.guardianName}
            required
            autoComplete="off"
          />
          <TextField
            label="Guardian's phone"
            type="tel"
            value={draft.guardianPhone}
            onChange={(e) => set("guardianPhone", e.target.value)}
            error={problems.guardianPhone}
            required
            autoComplete="off"
          />
        </div>
      )}
      <SelectField
        label="Through which branch?"
        value={draft.branchId}
        onChange={(e) => set("branchId", e.target.value)}
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        error={problems.branchId}
      />
      {namesake && (
        <Alert variant="warning">
          {namesake}
          <CheckboxField label="Yes, this is a different person" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" loading={pending} disabled={namesake !== null && !confirmed}>
        Add person
      </Button>
    </form>
  );
}
