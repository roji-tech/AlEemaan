"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Role } from "@prisma/client";
import { Collection, Item, ItemInitials } from "@/components/ui/Collection";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { useNotice } from "@/components/ui/Toaster";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ArrowLeftIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { BranchDeleteDialog, BranchRenameDialog } from "@/components/branches/BranchDialogs";
import type { Holding } from "@/lib/branches/holdings";

type Branch = { id: string; name: string; code: string; createdAt: string };

type Person = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  status: "active" | "deactivated" | "suspended" | "terminated";
};
const STATUS_TEXT: Record<Person["status"], string> = {
  active: "Active",
  deactivated: "Deactivated",
  suspended: "Suspended",
  terminated: "Terminated",
};

export function BranchDetailView({
  branch,
  holdings,
  onlyBranch,
  people,
}: {
  branch: Branch;
  holdings: Holding[];
  onlyBranch: boolean;
  people: Person[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // What just happened is a toast (task 0096).
  const [notice, setNotice] = useNotice();

  const active = holdings.filter((h) => h.blocks);
  const setUp = holdings.filter((h) => !h.blocks);

  return (
    <div className="space-y-6">
      <Link
        href="/branches"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        All branches
      </Link>
      <PageHeader
        title={branch.name}
        description={`Code ${branch.code} · created ${new Date(branch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              <PencilIcon className="h-4 w-4" />
              Rename
            </Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              <TrashIcon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      <Card>
        <h2 className="text-lg font-semibold text-fg">What this branch holds</h2>
        {holdings.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Nothing yet: no people, classes, records or settings.</p>
        ) : (
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <HoldingList title="People and records" items={active} empty="None." />
            <HoldingList title="Set-up" items={setUp} empty="None." />
          </div>
        )}
        <p className="mt-4 text-sm text-fg-muted">
          {onlyBranch
            ? "This is the school's only branch, so it cannot be deleted."
            : active.length > 0
              ? "A branch with people or records in it cannot be deleted. Move or remove them first."
              : "This branch holds no people or records, so it can be deleted."}
        </p>
      </Card>

      <PeopleCard people={people} />

      <BranchRenameDialog
        branch={branch}
        code={branch.code}
        open={renaming}
        onClose={() => setRenaming(false)}
        onSaved={(name) => {
          setRenaming(false);
          setNotice({ variant: "success", text: `The branch is now called “${name}”.` });
          router.refresh();
        }}
      />
      <BranchDeleteDialog
        branch={branch}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={(name) => {
          setDeleting(false);
          router.replace(`/branches?deleted=${encodeURIComponent(name)}`);
        }}
      />
    </div>
  );
}

function HoldingList({ title, items, empty }: { title: string; items: Holding[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg-2">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-fg">
          {items.map((h) => (
            <li key={h.label}>
              <span className="font-semibold tabular-nums">{h.count}</span> {h.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/// "HB" for Hauwa Bello (the first letters of the first and the last word of the name); a person with no name is the first letter of their email.
function initialsOfPerson(p: Person): string {
  const words = (p.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (Array.from((p.email ?? "").trim())[0] ?? "?").toUpperCase();
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return `${first}${last}`.toUpperCase();
}

/// Who belongs to this branch: a search, a role filter, a list or a grid (ten to a page in the list, as it always was), each person with their role and status. Read only: people are changed
/// on the Users page.
function PeopleCard({ people }: { people: Person[] }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered in this browser (task 0089).
  const layout = useCollectionView("branch-people", { defaultView: "list", page, onPage: setPage });
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(
      (p) => (!role || p.role === role) && (!q || (p.name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)),
    );
  }, [people, search, role]);
  const view = paginate(found, page, layout.size);
  const roles = [...new Set(people.map((p) => p.role))];
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">People in this branch</h2>
        <p className="text-sm text-fg-muted">
          {people.length === 0 ? "No one yet" : `${people.length} ${people.length === 1 ? "person" : "people"}`}
        </p>
      </div>
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Nobody belongs to this branch yet. Invite people from the Users page.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <ListToolbar
            searchValue={search}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            searchPlaceholder="Search by name or email"
            activeCount={role ? 1 : 0}
            onClear={() => {
              setSearch("");
              setRole("");
              setPage(1);
            }}
            trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
          >
            <SelectField
              label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
              options={[{ value: "", label: "Every role" }, ...roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
            />
          </ListToolbar>
          <Collection
            label="People in this branch"
            view={layout.view}
            state={found.length === 0 ? "nomatch" : "ready"}
            noMatchText="No one matches these filters."
          >
            {view.rows.map((p) => (
              <Item
                key={p.id}
                leading={<ItemInitials text={initialsOfPerson(p)} />}
                title={p.name?.trim() || p.email || "Unnamed person"}
                subtitle={p.name?.trim() && p.email ? p.email : undefined}
                badges={
                  <>
                    <span className="inline-flex rounded-full border border-line-strong bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg-2">
                      {ROLE_LABELS[p.role]}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "active" ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg"}`}
                    >
                      {STATUS_TEXT[p.status]}
                    </span>
                  </>
                }
              />
            ))}
          </Collection>
          <Pager
            page={view.page}
            pages={view.pages}
            onPage={setPage}
            label="Pages of people"
            total={found.length}
            size={layout.size}
            sizes={layout.sizes}
            onSize={layout.setSize}
          />
        </div>
      )}
      <Link href="/users" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-fg hover:underline">
        Manage people on the Users page
      </Link>
    </Card>
  );
}
