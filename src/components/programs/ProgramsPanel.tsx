"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { CreateProgramDialog } from "@/components/programs/CreateProgramDialog";
import { ProgramBadge } from "@/components/programs/ProgramBadge";
import { headlineText, type ProgramSummary } from "@/components/programs/model";

// The programs the person may see. Presentation only: the API decides who sees which program and who may create one.

type Branch = { id: string; name: string };

export function ProgramsPanel({ canCreate, isSuperAdmin, branches }: { canCreate: boolean; isSuperAdmin: boolean; branches: Branch[] }) {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="space-y-5">
      {canCreate && enabled && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>New program</Button>
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

      {programs === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : programs !== null && programs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {enabled
            ? canCreate
              ? "No programs yet. Start the first one with “New program”."
              : "You are not part of any program yet. A super admin can name you a program admin."
            : "There is nothing to show while programs are switched off."}
        </p>
      ) : (
        <ul className="space-y-3">
          {(programs ?? []).map((program) => (
            <li key={program.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 font-semibold break-words text-fg">
                  <Link href={`/programs/${program.id}`} className="underline-offset-2 hover:underline">
                    {program.name}
                  </Link>
                </p>
                <ProgramBadge status={program.status} />
              </div>
              <p className="text-sm text-fg-muted">
                {[
                  headlineText(program),
                  program.branches.map((b) => b.name).join(", "),
                  `${program.groupCount} ${program.groupCount === 1 ? "group" : "groups"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canCreate && <CreateProgramDialog open={creating} onClose={() => setCreating(false)} branches={branches} />}
    </div>
  );
}
