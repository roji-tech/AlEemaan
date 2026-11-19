"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { Collection, Item, ItemInitials, type ItemAction } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { initialsOf } from "@/components/shell/nav";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { staffEntity } from "@/lib/bulk/staff";
import { StandingBadge } from "@/components/standing/StandingBadge";
import { StandingDialog, type StandingAsk } from "@/components/standing/StandingDialog";
import { StandingHistoryDialog } from "@/components/standing/StandingHistoryDialog";
import { KIND_TEXT, kindsFor, type StandingValue } from "@/components/standing/model";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { BookOpenIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { STAFF_TITLE_SUGGESTIONS } from "@/lib/academics/staff-rules";
import {
  FILTER_OPTIONS,
  NO_STAFF_FILTERS,
  activeStaffFilters,
  displayName,
  filterStaff,
  roleLine,
  type StaffFilters,
} from "@/components/academics/staff-model";
import { StaffDetailsDialog, corpsPill, kindPill } from "@/components/academics/StaffDetails";

// The branch's staff and who teaches what (Slice P1d, over the P1c API). A record is how the branch knows a person - including someone who never signs in; a
// sign-in account is an existing member it can be linked to. Presentation only: the API decides who may read and change what.

type Account =
  | { state: "none" }
  | { state: "linked"; userId: string; name: string | null; email: string | null; deactivated: boolean; roleDiffers: boolean };
type Staff = {
  id: string;
  category: "TEACHING" | "NON_TEACHING";
  /// Task 0111: Mr, Mrs, Dr…; gender; the job title (`designation`); the qualification; the NYSC corps member flag.
  title: string | null;
  firstName: string;
  lastName: string;
  gender: "MALE" | "FEMALE" | null;
  designation: string | null;
  qualification: string | null;
  corpsMember: boolean;
  phone: string | null;
  email: string | null;
  archived: boolean;
  standing: Exclude<StandingValue, "EXPELLED">;
  standingUntil: string | null;
  account: Account;
  assignmentCount: number;
};
type Assignment = { id: string; subjectId: string; subjectName: string; classArmId: string; armName: string; classGroupName: string };
type Linkable = { userId: string; name: string | null; email: string | null };
type ClassOption = { id: string; name: string; subjectIds: string[]; arms: { id: string; name: string }[] };
type SubjectOption = { id: string; name: string };
type Editing = { kind: "record"; item: Staff | null } | { kind: "manage"; item: Staff } | null;

// The kit's Item keeps its actions at z-10, in a card at the left of the footer. An Actions list opened there would sit under the next item's own actions and, from `md`, run off the
// card's left edge (it opens leftwards from the button). Until Item handles it, the item that holds an open list is raised and a card's footer is right-aligned (reported to the kit's owner).
const MENU_ROOM = "[&_li:has([aria-expanded=true])]:z-20 [&_li>div.border-t]:justify-end";

export function StaffPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [status, setStatus] = useState<"live" | "archived">("live");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered for this list (task 0089). The branch's staff all come in one answer, so the pages are cut here.
  const layout = useCollectionView("academics-staff", { defaultView: "list", page, onPage: setPage });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(null);
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [standingAsk, setStandingAsk] = useState<StandingAsk | null>(null);
  const [historyOf, setHistoryOf] = useState<{ endpoint: string; name: string } | null>(null);
  // Task 0111: the filters beyond Show (kind, gender, corps member, sign-in, standing), applied here; and the record whose details are open.
  const [filters, setFilters] = useState<StaffFilters>(NO_STAFF_FILTERS);
  const [viewing, setViewing] = useState<Staff | null>(null);
  const can = branch.standing ?? { suspend: false, remove: false };

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

  const filterCount = activeStaffFilters(filters) + (status === "live" ? 0 : 1);
  const filtered = q !== "" || filterCount > 0;
  const clearFilters = () => {
    setQ("");
    setStatus("live");
    setFilters(NO_STAFF_FILTERS);
    setPage(1);
  };
  const setFilter = <K extends keyof StaffFilters>(key: K, value: StaffFilters[K]) => {
    setFilters((all) => ({ ...all, [key]: value }));
    setPage(1);
  };
  const list = staff === null ? null : filterStaff(staff, filters);
  const shown = paginate(list ?? [], page, layout.size);

  return (
    <div className="space-y-6">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setNotice(null);
          setStaff(null);
          setPage(1);
          setBranchId(id);
        }}
      />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="staff-heading" className={`space-y-4 ${MENU_ROOM}`}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="staff-heading" className="text-lg font-semibold tracking-tight text-fg">
              Staff
            </h2>
            {branch.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
                  Add many
                </Button>
                <Button onClick={() => setEditing({ kind: "record", item: null })}>New staff record</Button>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Everyone the branch employs, whether or not they sign in. A record does not create a login.
          </p>
        </div>
        <ListToolbar
          searchLabel="Search staff"
          searchValue={q}
          onSearch={(v) => (setQ(v), setPage(1))}
          searchPlaceholder="Name, email or phone"
          searchMaxLength={100}
          activeCount={filterCount}
          onClear={clearFilters}
          trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
        >
          <SelectField
            label="Show"
            value={status}
            onChange={(e) => (setStatus(e.target.value as "live" | "archived"), setPage(1))}
            options={[
              { value: "live", label: "Current staff" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <SelectField
            label="Kind of staff"
            value={filters.kind}
            onChange={(e) => setFilter("kind", e.target.value as StaffFilters["kind"])}
            options={FILTER_OPTIONS.kind}
          />
          <SelectField
            label="Gender"
            value={filters.gender}
            onChange={(e) => setFilter("gender", e.target.value as StaffFilters["gender"])}
            options={FILTER_OPTIONS.gender}
          />
          <SelectField
            label="NYSC corps member"
            value={filters.corps}
            onChange={(e) => setFilter("corps", e.target.value as StaffFilters["corps"])}
            options={FILTER_OPTIONS.corps}
          />
          <SelectField
            label="Sign-in"
            value={filters.signIn}
            onChange={(e) => setFilter("signIn", e.target.value as StaffFilters["signIn"])}
            options={FILTER_OPTIONS.signIn}
          />
          <SelectField
            label="Standing"
            value={filters.standing}
            onChange={(e) => setFilter("standing", e.target.value as StaffFilters["standing"])}
            options={FILTER_OPTIONS.standing}
          />
        </ListToolbar>
        <p className="text-sm text-fg-muted" aria-live="polite">
          {list === null ? " " : `${list.length} staff ${list.length === 1 ? "record" : "records"}${filtered ? " match" : ""}`}
        </p>
        <Collection
          label="Staff"
          view={layout.view}
          state={list === null ? "loading" : list.length === 0 ? (filtered ? "nomatch" : "empty") : "ready"}
          emptyText="No staff records yet."
          noMatchText="No staff match."
          onClear={clearFilters}
        >
          {shown.rows.map((p) => {
            const who = `${p.firstName} ${p.lastName}`;
            const contact = [p.email, p.phone].filter(Boolean).join(" · ");
            const linked = p.account.state === "linked";
            // Manage (or View) and Edit stay as buttons; the rest of what can be done to a record is one Actions list, so a row never runs six buttons wide (the kit's rule for many actions).
            const buttons: ItemAction[] = [
              {
                id: branch.canEdit ? "manage" : "view",
                label: branch.canEdit ? "Manage" : "View",
                ariaLabel: `${branch.canEdit ? "Manage" : "View"} ${who}`,
                onClick: () => setEditing({ kind: "manage", item: p }),
              },
            ];
            if (branch.canEdit && !p.archived) {
              buttons.push({ id: "edit", label: "Edit", ariaLabel: `Edit ${who}`, onClick: () => setEditing({ kind: "record", item: p }) });
            }
            const more = branch.canEdit
              ? [
                  ...kindsFor("staff", p.standing, can).map((kind) => ({
                    id: kind,
                    label: KIND_TEXT[kind],
                    ariaLabel: `${KIND_TEXT[kind]} ${who}`,
                    onSelect: () =>
                      setStandingAsk({
                        kind,
                        subject: "staff",
                        endpoint: `/api/v1/staff/${p.id}/standing`,
                        name: who,
                        canSchoolWide: can.remove && p.account.state === "linked",
                      }),
                  })),
                  {
                    id: "history",
                    label: "History",
                    ariaLabel: `Standing history of ${who}`,
                    onSelect: () => setHistoryOf({ endpoint: `/api/v1/staff/${p.id}/standing`, name: who }),
                  },
                  ...(p.standing !== "TERMINATED"
                    ? [
                        {
                          id: "archive",
                          label: p.archived ? "Restore" : "Archive",
                          ariaLabel: `${p.archived ? "Restore" : "Archive"} ${who}`,
                          onSelect: () => setArchived(p, !p.archived),
                        },
                      ]
                    : []),
                ]
              : [];
            return (
              <Item
                key={p.id}
                leading={<ItemInitials text={initialsOf(who, p.email)} />}
                name={who}
                // The name opens everything about the person (task 0111).
                title={
                  <button
                    type="button"
                    onClick={() => setViewing(p)}
                    aria-label={`Details of ${who}`}
                    className="rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {displayName(p)}
                  </button>
                }
                subtitle={
                  <>
                    <span className="block text-fg-2">{roleLine(p)}</span>
                    {contact && (
                      <span className="block truncate" title={contact}>
                        {contact}
                      </span>
                    )}
                  </>
                }
                badges={
                  <>
                    {kindPill(p.category)}
                    {p.corpsMember && corpsPill()}
                    {p.standing !== "ACTIVE" && <StandingBadge standing={p.standing} until={p.standingUntil} />}
                  </>
                }
                factsStyle="stats"
                facts={[
                  {
                    label: linked ? "Can sign in" : "No sign-in",
                    value: linked ? "Yes" : "No",
                    icon: <ShieldCheckIcon className="h-4 w-4" />,
                    tone: linked ? "ok" : undefined,
                  },
                  {
                    label: p.assignmentCount === 1 ? "Assignment" : "Assignments",
                    value: p.assignmentCount,
                    icon: <BookOpenIcon className="h-4 w-4" />,
                    tone: p.assignmentCount > 0 ? "info" : undefined,
                  },
                ]}
                actions={buttons}
                menu={{ name: who, actions: more }}
              />
            );
          })}
        </Collection>
        <Pager
          page={shown.page}
          pages={shown.pages}
          onPage={setPage}
          label="Pages of staff"
          total={staff?.length ?? 0}
          size={layout.size}
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
      <StaffDetailsDialog
        person={viewing}
        onClose={() => setViewing(null)}
        onEdit={
          viewing && branch.canEdit && !viewing.archived
            ? () => (setEditing({ kind: "record", item: viewing }), setViewing(null))
            : undefined
        }
        onManage={() => viewing && (setEditing({ kind: "manage", item: viewing }), setViewing(null))}
        manageLabel={branch.canEdit ? "Manage" : "View"}
      />
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
      {branch.canEdit && (
        <BulkImportDialog
          branchName={branch.name}
          branchChoices={branches.filter((b) => b.canEdit)}
          branchId={branchId}
          onBranchChange={(id) => {
            setNotice(null);
            setStaff(null);
            setPage(1);
            setBranchId(id);
          }}
          key={bulk.key}
          open={bulk.open}
          onClose={() => setBulk((b) => ({ ...b, open: false }))}
          entity={staffEntity}
          title="Add staff in bulk"
          description={`Into ${branch.name}. Nothing is saved until you press Save, and a record never creates a sign-in.`}
          endpoint="/api/v1/staff/import"
          context={{ branchId }}
          noun={{ one: "staff record", many: "staff records" }}
          onSaved={async (count) => {
            setNotice({ variant: "success", text: `${count} staff ${count === 1 ? "record" : "records"} added.` });
            await load();
          }}
        />
      )}
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
    title: item?.title ?? "",
    firstName: item?.firstName ?? "",
    lastName: item?.lastName ?? "",
    gender: item?.gender ?? "",
    designation: item?.designation ?? "",
    qualification: item?.qualification ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
  });
  const [corpsMember, setCorpsMember] = useState(item?.corpsMember ?? false);
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
      title: f.title.trim() || null,
      firstName: f.firstName,
      lastName: f.lastName,
      gender: f.gender || null,
      // The job title is asked for non-teaching staff only (the maintainer); a teacher's stays as it was.
      ...(f.category === "NON_TEACHING" ? { designation: f.designation.trim() || null } : {}),
      qualification: f.qualification.trim() || null,
      corpsMember,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
    };
    const reply = item
      ? await sendJson(`/api/v1/staff/${item.id}`, "PATCH", body)
      : await sendJson("/api/v1/staff", "POST", { branchId, ...body });
    setPending(false);
    if (reply.ok) return void (await onDone(`${f.firstName} ${f.lastName} ${item ? "saved" : "added"}.`));
    const found: Record<string, string> = {};
    for (const key of ["title", "firstName", "lastName", "gender", "designation", "qualification", "phone", "email"]) {
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
            label="Title (optional)"
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            error={fieldProblems.title}
            hint="Mr, Mrs, Miss, Dr, Mallam…"
            list="staff-title-suggestions"
            maxLength={30}
            autoComplete="off"
            disabled={pending}
          />
          <datalist id="staff-title-suggestions">
            {STAFF_TITLE_SUGGESTIONS.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
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
          <SelectField
            label="Gender (optional)"
            value={f.gender}
            onChange={(e) => set("gender", e.target.value)}
            options={[
              { value: "", label: "Not given" },
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
            ]}
            error={fieldProblems.gender}
            disabled={pending}
          />
          {f.category === "NON_TEACHING" && (
            <TextField
              label="Job title (optional)"
              value={f.designation}
              onChange={(e) => set("designation", e.target.value)}
              error={fieldProblems.designation}
              hint="For example Bursar, Driver, Security, Cook, Secretary."
              maxLength={120}
              autoComplete="off"
              disabled={pending}
            />
          )}
          <TextField
            label="Qualification (optional)"
            value={f.qualification}
            onChange={(e) => set("qualification", e.target.value)}
            error={fieldProblems.qualification}
            hint="For example B.Ed. Mathematics, NCE, OND."
            maxLength={120}
            autoComplete="off"
            disabled={pending}
          />
          <CheckboxField
            label="NYSC corps member"
            checked={corpsMember}
            onChange={(e) => setCorpsMember(e.target.checked)}
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
      description={person ? roleLine(person) : undefined}
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
