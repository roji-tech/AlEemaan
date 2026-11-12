"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { problemFor, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import type { RunChange } from "@/components/programs/ProgramPage";
import { KIND_TEXT, dayText, historyText, periodText, when, type ProgramDetail } from "@/components/programs/model";

// The details of a program, where it runs, and its history. Presentation only.

export function ProgramOverview({
  program,
  allBranches,
  run,
}: {
  program: ProgramDetail;
  allBranches: { id: string; name: string }[];
  run: RunChange;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProgramDetail["branches"][number] | null>(null);
  const offBranches = program.branches.filter((branch) => !branch.takingPart);
  const notYet = allBranches.filter((branch) => !program.branches.some((b) => b.id === branch.id));

  return (
    <div className="space-y-6">
      <section aria-labelledby="program-details" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-details" className="text-lg font-semibold text-fg">
            Details
          </h2>
          {program.can.editDetails && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-fg-muted">Kind</dt>
          <dd className="text-fg">{KIND_TEXT[program.kind]}</dd>
          <dt className="text-fg-muted">Runs</dt>
          <dd className="text-fg">{periodText(program)}</dd>
          <dt className="text-fg-muted">Created</dt>
          <dd className="text-fg">{dayText(program.createdAt.slice(0, 10))}</dd>
          {program.description && (
            <>
              <dt className="text-fg-muted">About</dt>
              <dd className="break-words whitespace-pre-line text-fg">{program.description}</dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby="program-branches" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-branches" className="text-lg font-semibold text-fg">
            Branches
          </h2>
          {program.can.administer && notYet.length > 0 && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add a branch
            </Button>
          )}
        </div>
        {offBranches.length > 0 && (
          <Alert variant="warning">
            {offBranches.map((branch) => branch.name).join(", ")} has switched programs off, so nobody there can be added until it switches
            them on again.
          </Alert>
        )}
        <ul className="space-y-2">
          {program.branches.map((branch) => (
            <li key={branch.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-fg">
                {branch.name}
                {branch.own && (
                  <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold text-fg-2">
                    Its own branch
                  </span>
                )}
              </span>
              {program.can.administer && !branch.own && program.branches.length > 1 && (
                <Button variant="ghost" aria-label={`Remove ${branch.name} from the program`} onClick={() => setRemoving(branch)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {program.audit && (
        <section aria-labelledby="program-history" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <h2 id="program-history" className="text-lg font-semibold text-fg">
            History
          </h2>
          {program.audit.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing has happened yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {program.audit.map((entry) => (
                <li key={entry.id} className="text-fg-2">
                  <span className="font-semibold text-fg">{entry.actor}</span> {historyText(entry.action)}{" "}
                  <span className="text-fg-muted">· {when(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <EditDialog open={editing} onClose={() => setEditing(false)} program={program} run={run} />
      <AddBranchDialog open={adding} onClose={() => setAdding(false)} programId={program.id} choices={notYet} run={run} />
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? "this branch"}?`}
        description="The program stops running in this branch. Nothing else is deleted."
      >
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const target = removing;
              setRemoving(null);
              if (target)
                await run(
                  () => sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/branches/${encodeURIComponent(target.id)}`, "DELETE"),
                  "The branch was removed.",
                  "The branch couldn't be removed.",
                );
            }}
          >
            Remove branch
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function EditDialog({ open, onClose, program, run }: { open: boolean; onClose: () => void; program: ProgramDetail; run: RunChange }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit details">
      {open && <EditBody program={program} onClose={onClose} run={run} />}
    </Dialog>
  );
}

function EditBody({ program, onClose, run }: { program: ProgramDetail; onClose: () => void; run: RunChange }) {
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description ?? "");
  const [startsOn, setStartsOn] = useState(program.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(program.endsOn ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fixed = program.kind === "FIXED_TERM";

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setFields({});
    const body: Record<string, unknown> = { name, description: description.trim() || null, startsOn: startsOn || null };
    if (fixed) body.endsOn = endsOn || null;
    const reply = await sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}`, "PATCH", body);
    setPending(false);
    if (!reply.ok) {
      const found: Record<string, string> = {};
      for (const field of ["name", "description", "startsOn", "endsOn"]) {
        const text = problemFor(reply, field);
        if (text) found[field] = text;
      }
      setFields(found);
      setMessage(Object.keys(found).length > 0 ? "Please check the fields marked below." : say(reply, "The details couldn't be saved."));
      return;
    }
    onClose();
    await run(async () => reply, "The details were saved.", "");
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-4" noValidate>
      {message && <Alert variant="error">{message}</Alert>}
      <TextField label="Program name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required error={fields.name} />
      <TextAreaField
        label="What it is (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        rows={3}
        error={fields.description}
      />
      <TextField
        label={fixed ? "Starts on" : "Starts on (optional)"}
        type="date"
        value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)}
        error={fields.startsOn}
      />
      {fixed && (
        <TextField
          label="Ends on (the last day)"
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          error={fields.endsOn}
        />
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function AddBranchDialog({
  open,
  onClose,
  programId,
  choices,
  run,
}: {
  open: boolean;
  onClose: () => void;
  programId: string;
  choices: { id: string; name: string }[];
  run: RunChange;
}) {
  const [branchId, setBranchId] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Add a branch" description="The program will run in this branch as well.">
      {open && (
        <div className="mt-5 space-y-4">
          <SelectField
            label="Branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={[{ value: "", label: "Choose a branch" }, ...choices.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!branchId}
              onClick={async () => {
                const chosen = branchId;
                setBranchId("");
                onClose();
                await run(
                  () => sendJson(`/api/v1/programs/${encodeURIComponent(programId)}/branches`, "POST", { branchId: chosen }),
                  "The branch was added.",
                  "The branch couldn't be added.",
                );
              }}
            >
              Add branch
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
