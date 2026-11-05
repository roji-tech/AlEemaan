"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import type { RunChange } from "@/components/programs/ProgramPage";
import type { ProgramDetail } from "@/components/programs/model";

// Who runs the program and who works in it (task 0043, slices P1 and P3). Only a super admin names or ends a program admin (so nobody can promote themselves); a super admin or a
// program admin names supervisors, teachers and recorders and says which groups a teacher or a recorder takes attendance for. Presentation only.

type Candidate = { userId: string; name: string; email: string | null; branchId: string; branchName: string; role: string };
type Place = ProgramDetail["staff"][number];
type RoleKey = "ADMIN" | "SUPERVISOR" | "TEACHER" | "RECORDER";

const ROLE_TEXT: Record<string, string> = {
  ADMIN: "Administrator",
  TEACHING_STAFF: "Teaching staff",
  NON_TEACHING_STAFF: "Non-teaching staff",
};

const SECTIONS: {
  role: RoleKey;
  id: string;
  title: string;
  one: string;
  help: string;
  empty: string;
  name: string;
  named: (name: string) => string;
}[] = [
  {
    role: "ADMIN",
    id: "program-admins",
    title: "Program admins",
    one: "program admin",
    help: "A program admin runs the program's structure and details across its branches. They must be a member of staff in one of its branches, and lose the role the moment that membership ends. Administrators of a branch can see the program and manage their own branch's people in it.",
    empty: "No program admin has been named. A super admin runs it for now.",
    name: "Name a program admin",
    named: (name) => `${name} now runs the program.`,
  },
  {
    role: "SUPERVISOR",
    id: "program-supervisors",
    title: "Supervisors",
    one: "supervisor",
    help: "A supervisor reads the attendance of every group and corrects a mark, always with a reason. They cannot take attendance themselves.",
    empty: "No supervisor has been named.",
    name: "Name a supervisor",
    named: (name) => `${name} is now a supervisor.`,
  },
  {
    role: "TEACHER",
    id: "program-teachers",
    title: "Teachers",
    one: "teacher",
    help: "A teacher takes attendance for the groups they are assigned to, and for the groups inside them: for today and the 6 days before. A teacher with no group sees nothing.",
    empty: "No teacher has been named.",
    name: "Name a teacher",
    named: (name) => `${name} is now a teacher.`,
  },
  {
    role: "RECORDER",
    id: "program-recorders",
    title: "Recorders",
    one: "recorder",
    help: "A recorder takes attendance for the groups they are assigned to, like a teacher, and will enter scores and entries for them in later slices. A recorder with no group sees nothing.",
    empty: "No recorder has been named.",
    name: "Name a recorder",
    named: (name) => `${name} is now a recorder.`,
  },
];

export function ProgramStaffTab({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const [naming, setNaming] = useState<RoleKey | null>(null);
  const [ending, setEnding] = useState<Place | null>(null);
  const [assigning, setAssigning] = useState<Place | null>(null);
  const manage = program.can.editDetails;
  const groupName = (id: string) => program.groups.find((group) => group.id === id)?.path ?? "A group that no longer exists";

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const places = program.staff.filter((place) => place.role === section.role);
        const may = section.role === "ADMIN" ? program.can.administer : manage;
        const takesGroups = section.role === "TEACHER" || section.role === "RECORDER";
        return (
          <section key={section.role} aria-labelledby={section.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id={section.id} className="text-lg font-semibold text-fg">
                {section.title}
              </h2>
              {may && <Button onClick={() => setNaming(section.role)}>{section.name}</Button>}
            </div>
            <p className="text-sm text-fg-muted">{section.help}</p>
            {places.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">{section.empty}</p>
            ) : (
              <ul className="space-y-2">
                {places.map((place) => (
                  <li key={place.id} className="space-y-1 rounded-xl border border-line px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-fg">
                        <span className="font-semibold">{place.name}</span>
                        <span className="text-fg-muted">
                          {place.email ? ` · ${place.email}` : ""} · through {place.branchName}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {may && takesGroups && (
                          <Button variant="ghost" aria-label={`Choose the groups of ${place.name}`} onClick={() => setAssigning(place)}>
                            Groups
                          </Button>
                        )}
                        {may && (
                          <Button
                            variant="ghost"
                            aria-label={`End ${place.name}'s place as ${section.one}`}
                            onClick={() => setEnding(place)}
                          >
                            End
                          </Button>
                        )}
                      </span>
                    </div>
                    {takesGroups && (
                      <p className="break-words text-xs text-fg-muted">
                        {place.groupIds.length === 0
                          ? "No groups yet: they see nothing."
                          : `Takes attendance for ${place.groupIds.map(groupName).join(", ")}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <NameDialog role={naming} onClose={() => setNaming(null)} programId={program.id} run={run} />
      <GroupsDialog place={assigning} program={program} onClose={() => setAssigning(null)} run={run} />
      <Dialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={`End ${ending?.name ?? "this person"}'s place?`}
        description={`They stop being ${ending ? (ending.role === "ADMIN" ? "a program admin" : `a ${ending.role.toLowerCase()}`) : "on the staff"} at once. It stays in the history.`}
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

function NameDialog({ role, onClose, programId, run }: { role: RoleKey | null; onClose: () => void; programId: string; run: RunChange }) {
  const section = SECTIONS.find((candidate) => candidate.role === role);
  return (
    <Dialog
      open={role !== null}
      onClose={onClose}
      title={section?.name ?? "Name a member of staff"}
      description="Choose a member of staff from the branches the program runs in."
    >
      {section && <NameBody key={section.role} section={section} programId={programId} onClose={onClose} run={run} />}
    </Dialog>
  );
}

function NameBody({
  section,
  programId,
  onClose,
  run,
}: {
  section: (typeof SECTIONS)[number];
  programId: string;
  onClose: () => void;
  run: RunChange;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`/api/v1/programs/${encodeURIComponent(programId)}/staff/candidates?role=${section.role}`, controller.signal).then(
      (reply) => {
        if (controller.signal.aborted) return;
        if (!reply.ok) return setFailed(say(reply, "The list of staff couldn't be loaded."));
        setCandidates(reply.data as unknown as Candidate[]);
      },
    );
    return () => controller.abort();
  }, [programId, section.role]);

  const pick = candidates?.find((c) => `${c.userId}|${c.branchId}` === chosen);

  return (
    <div className="mt-5 space-y-4">
      {failed && <Alert variant="error">{failed}</Alert>}
      {candidates === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : candidates !== null && candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {section.role === "ADMIN"
            ? "There is no one left to name: every member of staff in these branches already runs the program."
            : `There is no one left to name as a ${section.one}: every member of staff in these branches already is one.`}
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
                  role: section.role,
                }),
              section.named(pick.name),
              "That didn't work.",
            );
          }}
        >
          {section.role === "ADMIN" ? "Name program admin" : `Name ${section.one}`}
        </Button>
      </div>
    </div>
  );
}

function GroupsDialog({
  place,
  program,
  onClose,
  run,
}: {
  place: Place | null;
  program: ProgramDetail;
  onClose: () => void;
  run: RunChange;
}) {
  return (
    <Dialog
      open={place !== null}
      onClose={onClose}
      title={place ? `Groups of ${place.name}` : "Groups"}
      description="They take attendance for these groups and for the groups inside them. Pick none and they see nothing."
    >
      {place && <GroupsBody key={place.id} place={place} program={program} onClose={onClose} run={run} />}
    </Dialog>
  );
}

function GroupsBody({ place, program, onClose, run }: { place: Place; program: ProgramDetail; onClose: () => void; run: RunChange }) {
  const live = program.groups.filter((group) => !group.archived);
  const [picked, setPicked] = useState<Set<string>>(new Set(place.groupIds.filter((id) => live.some((group) => group.id === id))));

  return (
    <div className="mt-5 space-y-4">
      {live.length === 0 ? (
        <p className="text-sm text-fg-muted">The program has no group yet. Add groups in the Structure tab first.</p>
      ) : (
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto" aria-label="Groups">
          {live.map((group) => (
            <li key={group.id}>
              <CheckboxField
                label={group.path}
                checked={picked.has(group.id)}
                onChange={(e) =>
                  setPicked((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(group.id);
                    else next.delete(group.id);
                    return next;
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            onClose();
            await run(
              () =>
                sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/staff/${encodeURIComponent(place.id)}/groups`, "PUT", {
                  groupIds: [...picked],
                }),
              `The groups of ${place.name} were saved.`,
              "That didn't work.",
            );
          }}
        >
          Save groups
        </Button>
      </div>
    </div>
  );
}
