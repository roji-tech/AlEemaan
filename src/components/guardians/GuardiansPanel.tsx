"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Collection, Item, ItemInitials } from "@/components/ui/Collection";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pager } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { TONE } from "@/components/ui/tone";
import { usePagedList } from "@/components/ui/usePagedList";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { initialsOf } from "@/components/shell/nav";
import { GuardianDialog } from "./GuardianDialog";
import { codeText, type GuardianCard } from "./model";

// Users > Guardians (task 0113 D10; the maintainer 2026-11-19: "add Guardian to /users, and I wanna see all the children under a guardian when I click on it"). The guardians in reach,
// searched by name, phone or e-mail; a card says how many children (and how many more in branches the viewer does not run), whether a code was made, and from how many children the
// guardian is blocked. Opening one shows their children, with Block and Unblock (GuardianDialog).

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[tone].chip}`}>{children}</span>
  );
}

export function GuardiansPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const layout = useCollectionView("users-guardians", { defaultView: "grid" });
  const list = usePagedList<GuardianCard>({ endpoint: "/api/v1/guardians", key: "guardians", filters: { q, status }, limit: layout.size });

  useEffect(() => {
    if (searchText.trim() === q) return;
    const timer = setTimeout(() => setQ(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText, q]);

  const clear = () => {
    setSearchText("");
    setQ("");
    setStatus("");
  };
  const filtered = Boolean(q || status);

  return (
    <div className="space-y-4">
      <ListToolbar
        searchValue={searchText}
        onSearch={setSearchText}
        searchPlaceholder="Search by name, phone or email"
        searchLabel="Search guardians"
        activeCount={status ? 1 : 0}
        onClear={clear}
        trailing={<ViewToggle view={layout.view} onChange={layout.setView} />}
      >
        <SelectField
          label="Access"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "Everyone" },
            { value: "blocked", label: "Blocked from a child" },
            { value: "nocode", label: "No code yet" },
          ]}
        />
      </ListToolbar>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {list.meta ? `${list.meta.total} ${list.meta.total === 1 ? "guardian" : "guardians"}${filtered ? " match" : ""}` : " "}
      </p>
      {list.error ? (
        <Alert variant="error">{list.error}</Alert>
      ) : (
        <Collection
          label="Guardians"
          view={layout.view}
          state={list.items === null ? "loading" : list.items.length === 0 ? (filtered ? "nomatch" : "empty") : "ready"}
          loadingText="Loading guardians…"
          emptyText="No guardians yet. A guardian is added with a pupil: on the pupil's form, or under Guardians in the pupil's Actions list."
          noMatchText="No guardian matches."
          onClear={clear}
        >
          {(list.items ?? []).map((g) => (
            <Item
              key={g.id}
              leading={<ItemInitials text={initialsOf(g.name, g.email ?? g.name)} />}
              title={
                <button
                  type="button"
                  onClick={() => setOpen(g.id)}
                  className="rounded text-left after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {g.name}
                </button>
              }
              name={g.name}
              subtitle={[g.phone, g.email].filter(Boolean).join(" · ") || "No phone or email"}
              badges={
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="neutral">
                    {g.children} {g.children === 1 ? "child" : "children"}
                    {g.otherBranches > 0 ? ` (+${g.otherBranches} elsewhere)` : ""}
                  </Chip>
                  <Chip tone={g.codeAt ? "ok" : "warn"}>{codeText(g.codeAt)}</Chip>
                  {g.blocked > 0 && <Chip tone="danger">Blocked from {g.blocked}</Chip>}
                </div>
              }
              actions={[{ id: "open", label: "Open", ariaLabel: `Open ${g.name}`, variant: "secondary", onClick: () => setOpen(g.id) }]}
            />
          ))}
        </Collection>
      )}
      {list.meta && (
        <Pager
          page={list.page}
          pages={list.meta.pages}
          onPage={list.setPage}
          label="Pages of guardians"
          total={list.meta.total}
          size={layout.size}
          sizes={layout.sizes}
          onSize={layout.setSize}
        />
      )}
      <GuardianDialog
        guardianId={open}
        onClose={() => setOpen(null)}
        onChanged={(text) => {
          onNotice(text);
          list.reload();
        }}
      />
    </div>
  );
}
