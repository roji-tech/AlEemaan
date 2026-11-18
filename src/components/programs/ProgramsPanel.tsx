"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { LayersIcon } from "@/components/ui/icons";
import { Pager, paginate } from "@/components/ui/Pager";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { CreateProgramDialog } from "@/components/programs/CreateProgramDialog";
import { ProgramBadge } from "@/components/programs/ProgramBadge";
import { headlineText, type ProgramSummary } from "@/components/programs/model";

// The programs the person may see. Presentation only: the API decides who sees which program and who may create one. Drawn by the shared list/grid kit (task 0089): cards by default,
// rows if the person chooses, remembered in this browser; the whole item opens the program.

type Branch = { id: string; name: string };

export function ProgramsPanel({ canCreate, isSuperAdmin, branches }: { canCreate: boolean; isSuperAdmin: boolean; branches: Branch[] }) {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const layout = useCollectionView("programs", { defaultView: "grid", page, onPage: setPage });

  const load = useCallback(async (signal?: AbortSignal) => {
    const reply = await getJson("/api/v1/programs", signal);
    if (signal?.aborted) return;
    if (!reply.ok) {
      setFailed(say(reply, "The programs couldn't be loaded."));
      return;
    }
    setFailed(null);
    setEnabled(reply.data?.enabled !== false);
    setPrograms((reply.data?.programs ?? []) as ProgramSummary[]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on arrival
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const hasPrograms = programs !== null && programs.length > 0;
  const showCreate = canCreate && enabled;
  const shown = paginate(programs ?? [], page, layout.size);

  return (
    <div className="space-y-5">
      {(hasPrograms || showCreate) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasPrograms && (
            <p className="text-sm text-fg-muted" aria-live="polite">
              {programs.length} {programs.length === 1 ? "program" : "programs"}
            </p>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {hasPrograms && <ViewToggle view={layout.view} onChange={layout.setView} />}
            {showCreate && <Button onClick={() => setCreating(true)}>New program</Button>}
          </div>
        </div>
      )}

      {!enabled && (
        <Alert variant="warning">
          Programs are switched off for the school.{" "}
          {isSuperAdmin ? (
            <Link href="/settings" className="font-semibold underline">
              Switch them on in Settings, under Programs.
            </Link>
          ) : (
            "Nothing can be changed until a super admin switches them on."
          )}
        </Alert>
      )}
      {failed && <Alert variant="error">{failed}</Alert>}

      {(programs !== null || !failed) && (
        <Collection
          label="Programs"
          view={layout.view}
          state={programs === null ? "loading" : programs.length === 0 ? "empty" : "ready"}
          emptyText={
            enabled
              ? canCreate
                ? "No programs yet. Start the first one with “New program”."
                : "You are not part of any program yet. A super admin can name you a program admin."
              : "There is nothing to show while programs are switched off."
          }
        >
          {shown.rows.map((program) => {
            const branchNames = program.branches.map((b) => b.name).join(", ");
            return (
              <Item
                key={program.id}
                leading={
                  <ItemTile>
                    <LayersIcon className="h-5 w-5" />
                  </ItemTile>
                }
                title={program.name}
                href={`/programs/${program.id}`}
                subtitle={headlineText(program)}
                badges={<ProgramBadge status={program.status} />}
                facts={[
                  ...(branchNames ? [{ label: "Branches", value: branchNames }] : []),
                  { label: "Groups", value: program.groupCount },
                ]}
              />
            );
          })}
        </Collection>
      )}
      {programs !== null && (
        <Pager
          page={shown.page}
          pages={shown.pages}
          onPage={setPage}
          label="Pages of programs"
          total={programs.length}
          size={layout.size}
          sizes={layout.sizes}
          onSize={layout.setSize}
        />
      )}

      {canCreate && <CreateProgramDialog open={creating} onClose={() => setCreating(false)} branches={branches} />}
    </div>
  );
}
