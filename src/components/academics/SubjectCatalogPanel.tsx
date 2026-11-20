"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { BookOpenIcon } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/InfoTip";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";
import { Pill } from "@/components/academics/StaffDetails";
import { AddToBranchesDialog, CatalogEntryDialog, TagChips, type CatalogEntry } from "@/components/academics/SubjectCatalogDialogs";
import { subjectCatalogEntity } from "@/lib/bulk/subject-catalog";

// The school's subject catalogue, for a superadmin (task 0119): every subject the school teaches with the branches that offer it, the tags that group them, and the ways to add them to
// branches. Presentation only: the catalogue API refuses anyone who is not a superadmin, and every change comes back in words. The list is loaded whole (it is the school's subjects: tens of
// rows) and searched, filtered and paged here, the same as a branch's own subjects.

const same = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());
type Editing = { kind: "entry"; item: CatalogEntry | null } | null;

export function SubjectCatalogPanel({ branches }: { branches: BranchChoice[] }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [state, setState] = useState<"live" | "archived">("live");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [adding, setAdding] = useState<readonly CatalogEntry[]>([]);
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const layout = useCollectionView("academics-catalogue", { defaultView: "list", page, onPage: setPage });

  const load = useCallback(async () => {
    const reply = await getJson(`/api/v1/subject-catalog${state === "archived" ? "?archived=true" : ""}`);
    if (!reply.ok) return setError(say(reply, "Couldn't load the catalogue."));
    setError(null);
    setEntries(reply.data!.entries as CatalogEntry[]);
    setChosen(new Set());
  }, [state]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when the list shown changes is exactly what this effect is for
    setEntries(null);
    void load();
  }, [load]);

  const tags = useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b)), [entries]);
  const shown = (entries ?? []).filter(
    (e) => (search.trim() === "" || same(e.name, search) || same(e.code ?? "", search)) && (tag === "" || e.tags.includes(tag)),
  );
  const rows = paginate(shown, page, layout.size);
  const allShown = shown.length > 0 && shown.every((e) => chosen.has(e.id));
  const clearFilters = () => (setSearch(""), setTag(""), setPage(1));
  const chosenEntries = (entries ?? []).filter((e) => chosen.has(e.id));

  async function archive(entry: CatalogEntry, archived: boolean) {
    const reply = await sendJson(`/api/v1/subject-catalog/${entry.id}`, "PATCH", { archived });
    setNotice(
      reply.ok
        ? { variant: "success", text: `${entry.name} ${archived ? "archived. The branches keep their own subjects" : "restored"}.` }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    await load();
  }
  const done = async (text: string) => {
    setEditing(null);
    setAdding([]);
    setNotice({ variant: "success", text });
    await load();
  };

  return (
    <section aria-labelledby="catalogue-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="catalogue-heading" className="text-lg font-semibold tracking-tight text-fg">
            Subject catalogue
          </h2>
          <InfoTip tip="academics.subjects" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}>
            Import subjects
          </Button>
          <Button onClick={() => setEditing({ kind: "entry", item: null })}>New subject</Button>
        </div>
      </div>
      <p className="text-sm text-fg-muted">
        The school&apos;s subjects, kept once. Each branch has its own copy, so marks and classes never cross branches; the catalogue only
        says it is the same subject. Add a subject to the branches that teach it.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      <ListToolbar
        searchValue={search}
        onSearch={(v) => (setSearch(v), setPage(1))}
        searchPlaceholder="Search the catalogue by name or code"
        activeCount={(tag === "" ? 0 : 1) + (state === "live" ? 0 : 1)}
        onClear={() => (clearFilters(), setState("live"))}
        trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
      >
        <SelectField
          label="Tag"
          value={tag}
          onChange={(e) => (setTag(e.target.value), setPage(1))}
          options={[{ value: "", label: "All tags" }, ...tags.map((t) => ({ value: t, label: t }))]}
        />
        <SelectField
          label="Show"
          value={state}
          onChange={(e) => (setState(e.target.value as "live" | "archived"), setPage(1))}
          options={[
            { value: "live", label: "Current subjects" },
            { value: "archived", label: "Archived subjects" },
          ]}
        />
      </ListToolbar>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {entries === null
            ? " "
            : `${shown.length} ${shown.length === 1 ? "subject" : "subjects"}${search || tag ? " match" : ""} · ${chosen.size} chosen`}
        </p>
        {state === "live" && entries !== null && shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <CheckboxField
              label={tag ? `Choose all tagged ${tag}` : "Choose all shown"}
              checked={allShown}
              onChange={(e) =>
                setChosen((all) => {
                  const next = new Set(all);
                  for (const s of shown) {
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                  }
                  return next;
                })
              }
            />
            <Button variant="secondary" disabled={chosen.size === 0} onClick={() => setAdding(chosenEntries)}>
              Add chosen to branches
            </Button>
          </div>
        )}
      </div>
      <Collection
        label="Catalogue subjects"
        view={layout.view}
        state={entries === null ? "loading" : entries.length === 0 ? "empty" : shown.length === 0 ? "nomatch" : "ready"}
        emptyText={state === "live" ? "No subjects in the catalogue yet. Import the list, or add one." : "No archived subjects."}
        noMatchText="No subject matches."
        onClear={clearFilters}
      >
        {rows.rows.map((e) => (
          <Item
            key={e.id}
            leading={
              <ItemTile>
                <BookOpenIcon className="h-5 w-5" />
              </ItemTile>
            }
            title={e.name}
            subtitle={e.code ? <span className="font-mono text-xs">{e.code}</span> : undefined}
            badges={e.archivedAt ? <Pill tone="neutral">Archived</Pill> : undefined}
            facts={[
              { label: "Offered by", value: e.liveBranches === 0 ? "No branch yet" : `${e.liveBranches} of ${branches.length} branches` },
            ]}
            actions={
              e.archivedAt
                ? [{ id: "restore", label: "Restore", ariaLabel: `Restore ${e.name}`, onClick: () => void archive(e, false) }]
                : [
                    { id: "edit", label: "Edit", ariaLabel: `Edit ${e.name}`, onClick: () => setEditing({ kind: "entry", item: e }) },
                    { id: "add", label: "Add to branches", ariaLabel: `Add ${e.name} to branches`, onClick: () => setAdding([e]) },
                    {
                      id: "archive",
                      label: "Archive",
                      ariaLabel: `Archive ${e.name}`,
                      variant: "ghost",
                      onClick: () => void archive(e, true),
                    },
                  ]
            }
            below={
              <div className="space-y-2">
                {!e.archivedAt && (
                  <label className="flex items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={chosen.has(e.id)}
                      onChange={(ev) =>
                        setChosen((all) => {
                          const next = new Set(all);
                          if (ev.target.checked) next.add(e.id);
                          else next.delete(e.id);
                          return next;
                        })
                      }
                    />
                    Choose {e.name}
                  </label>
                )}
                <TagChips tags={e.tags} />
                {e.branches.length > 0 && (
                  <ul aria-label={`Branches offering ${e.name}`} className="flex flex-wrap gap-1.5">
                    {e.branches.map((b) => (
                      <li key={b.subjectId}>
                        <Link
                          href={`/academics?tab=subjects&branch=${encodeURIComponent(b.branchId)}&q=${encodeURIComponent(e.name)}`}
                          className="inline-flex items-center rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-fg-2 hover:bg-surface-2"
                        >
                          {b.branchName}
                          <span className="ml-1 font-normal text-fg-muted">
                            {b.live ? `${b.classes} ${b.classes === 1 ? "class" : "classes"}` : "archived there"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            }
          />
        ))}
      </Collection>
      <Pager
        page={rows.page}
        pages={rows.pages}
        onPage={setPage}
        label="Pages of catalogue subjects"
        total={shown.length}
        size={layout.size}
        sizes={layout.sizes}
        onSize={layout.setSize}
      />
      <CatalogEntryDialog
        key={editing?.item?.id ?? (editing ? "new" : "none")}
        entry={editing?.item ?? null}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onDone={done}
      />
      <AddToBranchesDialog
        key={adding.map((a) => a.id).join(",") || "none"}
        entries={adding}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        onClose={() => setAdding([])}
        onDone={done}
      />
      {bulk.open && (
        <BulkImportDialog
          key={bulk.key}
          open
          onClose={() => setBulk((b) => ({ ...b, open: false }))}
          entity={subjectCatalogEntity}
          title="Import subjects into the catalogue"
          description="Columns: Subject, Code (optional) and Tags (optional, separated by semicolons). A subject the catalogue already has is refused. Nothing is saved until you press Save."
          endpoint="/api/v1/subject-catalog/import"
          context={{}}
          noun={{ one: "subject", many: "subjects" }}
          onSaved={async (count) => {
            setNotice({ variant: "success", text: `${count} ${count === 1 ? "subject" : "subjects"} added to the catalogue.` });
            await load();
          }}
        />
      )}
    </section>
  );
}
