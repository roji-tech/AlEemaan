"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { BookOpenIcon, BuildingIcon, UsersIcon } from "@/components/ui/icons";
import { getJson, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { DepartmentDialog, type Department } from "@/components/academics/DepartmentDialog";
import { Pill } from "@/components/academics/StaffDetails";
import { DEPARTMENT_DESCRIPTION_MAX, DEPARTMENT_NAME_MAX, headLine } from "@/lib/academics/department-rules";

// The Departments tab of Academics (task 0101 D7): a branch's departments as cards, each with its head, its members and its subjects. The tab is for a branch that has turned departments on (an
// administrator can do that here); a branch that has not sees "Departments are off for this branch". Presentation only: the departments API decides who may read and change what.

type Editing = { kind: "new" } | { kind: "edit"; item: Department } | { kind: "off" } | null;

const same = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

export function DepartmentsPanel({
  branches,
  branchId,
  onBranchChange,
  onSwitched,
}: {
  branches: BranchChoice[];
  branchId: string;
  onBranchChange: (id: string) => void;
  /// The branch's switch was turned on or off here: the staff list (another tab) shows the department labels only while it is on.
  onSwitched: (branchId: string, on: boolean) => void;
}) {
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [editing, setEditing] = useState<Editing>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const layout = useCollectionView("academics-departments", { defaultView: "grid", page, onPage: setPage });

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/academics/departments?branchId=${encodeURIComponent(branchId)}&includeArchived=${archived}`);
    if (!reply.ok) return setError(say(reply, "Couldn't load the departments."));
    setError(null);
    setEnabled(reply.data!.enabled as boolean);
    setDepartments(reply.data!.departments as Department[]);
  }, [branchId, archived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on a branch change is exactly what this effect is for
    setEnabled(null);
    setDepartments(null);
    void load();
  }, [load]);

  const done = async (text: string) => {
    setEditing(null);
    setNotice({ variant: "success", text });
    await load();
  };
  async function turn(on: boolean) {
    const reply = await sendJson("/api/v1/settings/departments", "PUT", { branchId, enabled: on });
    if (!reply.ok) return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    onSwitched(branchId, on);
    await done(on ? `Departments are on for ${branch.name}.` : `Departments are off for ${branch.name}. Nothing was deleted.`);
  }
  async function setArchivedState(item: Department, value: boolean) {
    const reply = await sendJson(`/api/v1/academics/departments/${item.id}`, "PATCH", { archived: value });
    setNotice(
      reply.ok
        ? { variant: "success", text: `${item.name} ${value ? "archived" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }

  const clearFilters = () => {
    setSearch("");
    setArchived(false);
    setPage(1);
  };
  const filtered = search.trim() !== "" || archived;
  const shown = (departments ?? []).filter(
    (d) =>
      d.archived === archived &&
      (search.trim() === "" ||
        same(d.name, search) ||
        same(d.head?.name ?? "", search) ||
        d.members.some((m) => same(m.name, search)) ||
        d.subjects.some((s) => same(s.name, search))),
  );
  const rows = paginate(shown, page, layout.size);
  const open = departments?.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setNotice(null);
          clearFilters();
          onBranchChange(id);
        }}
      />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <section aria-labelledby="departments-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="departments-heading" className="text-lg font-semibold tracking-tight text-fg">
            Departments
          </h2>
          {branch.canEdit && enabled === true && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => setEditing({ kind: "off" })}>
                Turn off departments
              </Button>
              <Button onClick={() => setEditing({ kind: "new" })}>New department</Button>
            </div>
          )}
        </div>

        {enabled === false ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-line-strong p-8 text-center">
            <p className="text-sm font-semibold text-fg">Departments are off for this branch.</p>
            {branch.canEdit ? (
              <>
                <p className="text-sm text-fg-muted">
                  Turn them on to group the staff into departments such as Sciences or Languages, give each a head of department, and say
                  which subjects belong to it.
                </p>
                <Button onClick={() => void turn(true)}>Turn on departments</Button>
              </>
            ) : (
              <p className="text-sm text-fg-muted">This branch does not use departments.</p>
            )}
          </div>
        ) : (
          <>
            <ListToolbar
              searchValue={search}
              onSearch={(v) => (setSearch(v), setPage(1))}
              searchLabel="Search departments"
              searchPlaceholder="Search departments, people or subjects"
              activeCount={archived ? 1 : 0}
              onClear={clearFilters}
              trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
            >
              <SelectField
                label="Show"
                value={archived ? "archived" : "current"}
                onChange={(e) => (setArchived(e.target.value === "archived"), setPage(1))}
                options={[
                  { value: "current", label: "Current departments" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </ListToolbar>
            <p className="text-sm text-fg-muted" aria-live="polite">
              {departments === null
                ? " "
                : `${shown.length} ${shown.length === 1 ? "department" : "departments"}${filtered ? " match" : ""}`}
            </p>
            <Collection
              label="Departments"
              view={layout.view}
              state={departments === null ? "loading" : shown.length === 0 ? (filtered ? "nomatch" : "empty") : "ready"}
              emptyText="No departments yet."
              noMatchText={archived && search.trim() === "" ? "No archived departments." : "No department matches."}
              onClear={clearFilters}
            >
              {rows.rows.map((d) => {
                const members = d.members.length;
                const subjects = d.subjects.length;
                const verb = d.canManage ? "Manage" : "View";
                return (
                  <Item
                    key={d.id}
                    name={d.name}
                    leading={
                      <ItemTile>
                        <BuildingIcon className="h-5 w-5" />
                      </ItemTile>
                    }
                    title={
                      <button
                        type="button"
                        onClick={() => setOpenId(d.id)}
                        aria-label={`Open ${d.name}`}
                        className="rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {d.name}
                      </button>
                    }
                    subtitle={headLine(d.head?.name ?? null)}
                    badges={d.archived ? <Pill tone="neutral">Archived</Pill> : undefined}
                    factsStyle="stats"
                    facts={[
                      {
                        label: members === 1 ? "member" : "members",
                        value: members,
                        tone: "info",
                        icon: <UsersIcon className="h-4 w-4" />,
                      },
                      {
                        label: subjects === 1 ? "subject" : "subjects",
                        value: subjects,
                        tone: "brand",
                        icon: <BookOpenIcon className="h-4 w-4" />,
                      },
                    ]}
                    actions={[
                      { id: "open", label: verb, ariaLabel: `${verb} ${d.name}`, onClick: () => setOpenId(d.id) },
                      ...(branch.canEdit
                        ? [
                            ...(d.archived
                              ? []
                              : [
                                  {
                                    id: "edit",
                                    label: "Rename",
                                    ariaLabel: `Rename ${d.name}`,
                                    onClick: () => setEditing({ kind: "edit" as const, item: d }),
                                  },
                                ]),
                            {
                              id: d.archived ? "restore" : "archive",
                              label: d.archived ? "Restore" : "Archive",
                              ariaLabel: `${d.archived ? "Restore" : "Archive"} ${d.name}`,
                              variant: "ghost" as const,
                              onClick: () => void setArchivedState(d, !d.archived),
                            },
                          ]
                        : []),
                    ]}
                  />
                );
              })}
            </Collection>
            <Pager
              page={rows.page}
              pages={rows.pages}
              onPage={setPage}
              label="Pages of departments"
              total={shown.length}
              size={layout.size}
              sizes={layout.sizes}
              onSize={layout.setSize}
            />
          </>
        )}
      </section>

      <DepartmentForm
        key={editing?.kind === "edit" ? editing.item.id : editing?.kind === "new" ? "new" : "closed"}
        open={editing?.kind === "new" || editing?.kind === "edit"}
        item={editing?.kind === "edit" ? editing.item : null}
        onClose={() => setEditing(null)}
        onSubmit={async (name, description) => {
          const item = editing?.kind === "edit" ? editing.item : null;
          const reply = item
            ? await sendJson(`/api/v1/academics/departments/${item.id}`, "PATCH", { name, description })
            : await sendJson("/api/v1/academics/departments", "POST", { branchId, name, description });
          if (reply.ok) await done(`${name} ${item ? "saved" : "created"}.`);
          return reply;
        }}
      />
      <Dialog
        open={editing?.kind === "off"}
        onClose={() => setEditing(null)}
        title="Turn off departments"
        description={`${branch.name} will stop showing departments. Nothing is deleted: the departments, their members and heads come back when you turn them on again.`}
      >
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setEditing(null)}>
            Keep departments
          </Button>
          <Button variant="danger" onClick={() => void turn(false)}>
            Turn off departments
          </Button>
        </div>
      </Dialog>
      <DepartmentDialog
        department={open}
        isAdmin={branch.canEdit}
        branchId={branchId}
        onClose={() => setOpenId(null)}
        onChanged={async (text) => {
          if (text) setNotice({ variant: "success", text });
          await load();
        }}
      />
    </div>
  );
}

/// New department, or rename one: a name and an optional line about it.
function DepartmentForm({
  open,
  item,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: Department | null;
  onClose: () => void;
  onSubmit: (name: string, description: string | null) => Promise<Reply | null>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={item ? `Rename ${item.name}` : "New department"}>
      {open && <DepartmentFormBody item={item} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function DepartmentFormBody({
  item,
  onClose,
  onSubmit,
}: {
  item: Department | null;
  onClose: () => void;
  onSubmit: (name: string, description: string | null) => Promise<Reply | null>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) return setProblem("Give a name.");
    setProblem(null);
    setGeneral(null);
    setPending(true);
    const reply = await onSubmit(trimmed, description.trim() === "" ? null : description.trim());
    setPending(false);
    if (reply && !reply.ok) {
      const field = problemFor(reply, "name");
      if (field) setProblem(field);
      else if (reply.status === 409) setProblem(reply.message ?? "That name is taken.");
      else setGeneral(say(reply, "That didn't work."));
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Department name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={problem}
        maxLength={DEPARTMENT_NAME_MAX}
        disabled={pending}
        autoComplete="off"
      />
      <TextField
        label="About it (optional)"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={DEPARTMENT_DESCRIPTION_MAX}
        disabled={pending}
        autoComplete="off"
      />
      {general && <Alert variant="error">{general}</Alert>}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Working…" : item ? "Save" : "Create department"}
        </Button>
      </div>
    </form>
  );
}
