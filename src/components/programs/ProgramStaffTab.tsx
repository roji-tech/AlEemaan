"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import type { RunChange } from "@/components/programs/ProgramPage";
import type { ProgramDetail } from "@/components/programs/model";

// Who runs the program. Only a super admin names or ends a program admin (so nobody can promote themselves). Presentation only.

type Candidate = { userId: string; name: string; email: string | null; branchId: string; branchName: string; role: string };
const ROLE_TEXT: Record<string, string> = {
  ADMIN: "Administrator",
  TEACHING_STAFF: "Teaching staff",
  NON_TEACHING_STAFF: "Non-teaching staff",
};

export function ProgramStaffTab({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const [naming, setNaming] = useState(false);
  const [ending, setEnding] = useState<ProgramDetail["staff"][number] | null>(null);
  const admins = program.staff.filter((place) => place.role === "ADMIN");

  return (
    <div className="space-y-5">
      <section aria-labelledby="program-admins" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-admins" className="text-lg font-semibold text-fg">
            Program admins
          </h2>
          {program.can.administer && <Button onClick={() => setNaming(true)}>Name a program admin</Button>}
        </div>
        <p className="text-sm text-fg-muted">
          A program admin runs the program&apos;s structure and details across its branches. They must be a member of staff in one of its
          branches, and lose the role the moment that membership ends. Administrators of a branch can see the program and, in the next step,
          manage their own branch&apos;s people in it.
        </p>
        {admins.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
            No program admin has been named. A super admin runs it for now.
          </p>
        ) : (
          <ul className="space-y-2">
            {admins.map((place) => (
              <li
                key={place.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words text-fg">
                  <span className="font-semibold">{place.name}</span>
                  <span className="text-fg-muted">
                    {place.email ? ` · ${place.email}` : ""} · through {place.branchName}
                  </span>
                </span>
                {program.can.administer && (
                  <Button variant="ghost" aria-label={`End ${place.name}'s place as program admin`} onClick={() => setEnding(place)}>
                    End
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <NameDialog open={naming} onClose={() => setNaming(false)} programId={program.id} run={run} />
      <Dialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={`End ${ending?.name ?? "this person"}'s place?`}
        description="They stop being a program admin at once. It stays in the history."
      >
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setEnding(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const target = ending;
              setEnding(null);
              if (target)
                await run(
                  () => sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/staff/${encodeURIComponent(target.id)}`, "DELETE"),
                  "Their place was ended.",
                  "That didn't work.",
                );
            }}
          >
            End place
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function NameDialog({ open, onClose, programId, run }: { open: boolean; onClose: () => void; programId: string; run: RunChange }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Name a program admin"
      description="Choose a member of staff from the branches the program runs in."
    >
      {open && <NameBody programId={programId} onClose={onClose} run={run} />}
    </Dialog>
  );
}

function NameBody({ programId, onClose, run }: { programId: string; onClose: () => void; run: RunChange }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`/api/v1/programs/${encodeURIComponent(programId)}/staff/candidates`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The list of staff couldn't be loaded."));
      setCandidates(reply.data as unknown as Candidate[]);
    });
    return () => controller.abort();
  }, [programId]);

  const pick = candidates?.find((c) => `${c.userId}|${c.branchId}` === chosen);

  return (
    <div className="mt-5 space-y-4">
      {failed && <Alert variant="error">{failed}</Alert>}
      {candidates === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : candidates !== null && candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">
          There is no one left to name: every member of staff in these branches already runs the program.
        </p>
      ) : candidates !== null ? (
        <SelectField
          label="Member of staff"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          options={[
            { value: "", label: "Choose a person" },
            ...candidates.map((c) => ({
              value: `${c.userId}|${c.branchId}`,
              label: `${c.name} (${ROLE_TEXT[c.role] ?? c.role}, ${c.branchName})`,
            })),
          ]}
        />
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!pick}
          onClick={async () => {
            if (!pick) return;
            onClose();
            await run(
              () =>
                sendJson(`/api/v1/programs/${encodeURIComponent(programId)}/staff`, "POST", {
                  userId: pick.userId,
                  branchId: pick.branchId,
                }),
              `${pick.name} now runs the program.`,
              "That didn't work.",
            );
          }}
        >
          Name program admin
        </Button>
      </div>
    </div>
  );
}
