"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { problemFor, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import type { RunChange } from "@/components/programs/ProgramPage";
import { buildTree, type TreeGroup } from "@/lib/programs/rules";
import type { ProgramDetail } from "@/components/programs/model";

// The program's own level names and its tree of groups (JSS - 2 - C, Juz A - Group 3). Presentation only: the API checks every rule again.

type Group = ProgramDetail["groups"][number];
type Node = TreeGroup<Group>;
const MAX_LEVELS = 4;

type Dialogs = { kind: "add"; parent: Group | null } | { kind: "rename"; group: Group } | { kind: "levels" } | null;

export function ProgramStructure({ program, run }: { program: ProgramDetail; run: RunChange }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [showArchived, setShowArchived] = useState(false);
  const labels = program.levelLabels;
  const edit = program.can.editStructure;
  const groups = useMemo(() => (showArchived ? program.groups : program.groups.filter((g) => !g.archived)), [program.groups, showArchived]);
  const tree = useMemo(() => buildTree(groups), [groups]);
  const archivedCount = program.groups.filter((g) => g.archived).length;

  const patch = (group: Group, body: unknown, done: string) =>
    run(
      () => sendJson(`/api/v1/programs/${encodeURIComponent(program.id)}/groups/${encodeURIComponent(group.id)}`, "PATCH", body),
      done,
      "That didn't work.",
    );

  function renderNode(node: Node, siblings: Node[]) {
    const childLabel = labels[node.levelIndex + 1];
    const live = siblings.filter((s) => !s.archived);
    const liveIndex = live.findIndex((s) => s.id === node.id);
    return (
      <li key={node.id} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
          <p className="min-w-0 text-sm break-words text-fg">
            <span className={node.archived ? "text-fg-muted line-through" : "font-semibold"}>{node.name}</span>{" "}
            <span className="text-fg-muted">
              · {labels[node.levelIndex] ?? "Level"}
              {node.archived ? " · archived" : ""}
              {!node.archived && node.people > 0 ? ` · ${node.people} ${node.people === 1 ? "person" : "people"}` : ""}
            </span>
          </p>
          {edit && (
            <div className="flex flex-wrap items-center gap-1">
              {node.archived ? (
                <Button
                  variant="ghost"
                  aria-label={`Restore ${node.name}`}
                  onClick={() => void patch(node, { archived: false }, `${node.name} was restored.`)}
                >
                  Restore
                </Button>
              ) : (
                <>
                  {childLabel && (
                    <Button
                      variant="ghost"
                      aria-label={`Add a ${childLabel} inside ${node.name}`}
                      onClick={() => setDialog({ kind: "add", parent: node })}
                    >
                      Add {childLabel}
                    </Button>
                  )}
                  <Button variant="ghost" aria-label={`Rename ${node.name}`} onClick={() => setDialog({ kind: "rename", group: node })}>
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Move ${node.name} up`}
                    disabled={liveIndex <= 0}
                    onClick={() => void patch(node, { move: "up" }, `${node.name} moved up.`)}
                  >
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Move ${node.name} down`}
                    disabled={liveIndex < 0 || liveIndex >= live.length - 1}
                    onClick={() => void patch(node, { move: "down" }, `${node.name} moved down.`)}
                  >
                    Down
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Archive ${node.name}`}
                    onClick={() => void patch(node, { archived: true }, `${node.name} was archived.`)}
                  >
                    Archive
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {node.children.length > 0 && (
          <ul className="ml-3 space-y-2 border-l border-line pl-3 sm:ml-5 sm:pl-4" aria-label={`Inside ${node.name}`}>
            {node.children.map((child) => renderNode(child, node.children))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="program-levels" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-levels" className="text-lg font-semibold text-fg">
            Level names
          </h2>
          {edit && (
            <Button variant="secondary" onClick={() => setDialog({ kind: "levels" })}>
              Change level names
            </Button>
          )}
        </div>
        <ol className="flex flex-wrap gap-2 text-sm">
          {labels.map((label, i) => (
            <li key={label} className="rounded-full border border-line-strong px-3 py-1 text-fg-2">
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        <p className="text-sm text-fg-muted">
          A group is placed at one level and sits inside a group of the level above. Its path reads like JSS–2–C or Juz A–Group 3.
        </p>
      </section>

      <section aria-labelledby="program-groups" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="program-groups" className="text-lg font-semibold text-fg">
            Groups
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {archivedCount > 0 && (
              <CheckboxField
                label={`Show archived (${archivedCount})`}
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            )}
            {edit && labels[0] && <Button onClick={() => setDialog({ kind: "add", parent: null })}>Add {labels[0]}</Button>}
          </div>
        </div>
        {tree.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
            {edit ? `No groups yet. Start with “Add ${labels[0] ?? "a group"}”.` : "No groups yet."}
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Groups of the program">
            {tree.map((node) => renderNode(node, tree))}
          </ul>
        )}
      </section>

      <GroupDialog dialog={dialog} programId={program.id} labels={labels} onClose={() => setDialog(null)} run={run} />
      <LevelsDialog open={dialog?.kind === "levels"} labels={labels} programId={program.id} onClose={() => setDialog(null)} run={run} />
    </div>
  );
}

function GroupDialog({
  dialog,
  programId,
  labels,
  onClose,
  run,
}: {
  dialog: Dialogs;
  programId: string;
  labels: string[];
  onClose: () => void;
  run: RunChange;
}) {
  const open = dialog?.kind === "add" || dialog?.kind === "rename";
  const level =
    dialog?.kind === "add" ? (dialog.parent ? dialog.parent.levelIndex + 1 : 0) : dialog?.kind === "rename" ? dialog.group.levelIndex : 0;
  const noun = labels[level] ?? "group";
  const title =
    dialog?.kind === "rename"
      ? `Rename ${dialog.group.name}`
      : dialog?.kind === "add" && dialog.parent
        ? `Add a ${noun} inside ${dialog.parent.name}`
        : `Add a ${noun}`;
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && dialog && (
        <GroupBody
          key={dialog.kind === "rename" ? dialog.group.id : dialog.kind === "add" ? (dialog.parent?.id ?? "top") : "x"}
          dialog={dialog}
          programId={programId}
          noun={noun}
          onClose={onClose}
          run={run}
        />
      )}
    </Dialog>
  );
}

function GroupBody({
  dialog,
  programId,
  noun,
  onClose,
  run,
}: {
  dialog: NonNullable<Dialogs>;
  programId: string;
  noun: string;
  onClose: () => void;
  run: RunChange;
}) {
  const [name, setName] = useState(dialog.kind === "rename" ? dialog.group.name : "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const reply =
      dialog.kind === "rename"
        ? await sendJson(`/api/v1/programs/${encodeURIComponent(programId)}/groups/${encodeURIComponent(dialog.group.id)}`, "PATCH", {
            name,
          })
        : await sendJson(`/api/v1/programs/${encodeURIComponent(programId)}/groups`, "POST", {
            parentId: dialog.kind === "add" ? (dialog.parent?.id ?? null) : null,
            name,
          });
    setPending(false);
    if (!reply.ok) {
      const field = problemFor(reply, "name");
      if (field) setError(field);
      else setMessage(say(reply, "That didn't work."));
      return;
    }
    onClose();
    await run(async () => reply, dialog.kind === "rename" ? "The group was renamed." : `The ${noun.toLowerCase()} was added.`, "");
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-4" noValidate>
      {message && <Alert variant="error">{message}</Alert>}
      <TextField label={`${noun} name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required error={error} />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {dialog.kind === "rename" ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function LevelsDialog({
  open,
  labels,
  programId,
  onClose,
  run,
}: {
  open: boolean;
  labels: string[];
  programId: string;
  onClose: () => void;
  run: RunChange;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Level names"
      description="Top level first. A level can't be taken away while groups are at it."
    >
      {open && <LevelsBody labels={labels} programId={programId} onClose={onClose} run={run} />}
    </Dialog>
  );
}

function LevelsBody({ labels, programId, onClose, run }: { labels: string[]; programId: string; onClose: () => void; run: RunChange }) {
  const [draft, setDraft] = useState<string[]>(labels);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const reply = await sendJson(`/api/v1/programs/${encodeURIComponent(programId)}/levels`, "PUT", { labels: draft });
    setPending(false);
    if (!reply.ok) return setMessage(say(reply, "The level names couldn't be saved."));
    onClose();
    await run(async () => reply, "The level names were saved.", "");
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-4" noValidate>
      {message && <Alert variant="error">{message}</Alert>}
      {draft.map((label, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={`Level ${index + 1}`}
              value={label}
              maxLength={40}
              onChange={(e) => setDraft(draft.map((l, i) => (i === index ? e.target.value : l)))}
            />
          </div>
          {draft.length > 1 && (
            <Button variant="ghost" aria-label={`Remove level ${index + 1}`} onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {draft.length < MAX_LEVELS && (
        <Button variant="secondary" onClick={() => setDraft([...draft, ""])}>
          Add a level
        </Button>
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
