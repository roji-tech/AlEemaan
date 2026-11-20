"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TONE } from "@/components/ui/tone";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { outcomeText, type SchoolTemplateView } from "@/components/results/school-template-types";
import { STATE_LABEL } from "@/lib/results/school-templates-rules";

// "Update branches" and "Add to branches" for one school template (task 0120): pick the branches, run it, read what happened to each. Each branch is its own transaction on the server, so a branch that
// cannot be changed says why and the others still are. A branch whose row says "Customised here" is skipped unless "Replace local changes" is ticked for it. Presentation only.
type Outcome = { branchId: string; status: string; reason?: string };
export type BranchesMode = "update" | "add";

export function SchoolTemplateBranchesDialog({
  template,
  mode,
  onClose,
  onDone,
}: {
  template: SchoolTemplateView;
  mode: BranchesMode;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const candidates =
    mode === "update"
      ? template.branches.map((b) => ({ id: b.branchId, name: b.branchName, state: b.state }))
      : template.missingBranches.map((b) => ({ id: b.id, name: b.name, state: null }));
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(mode === "update" ? candidates.filter((c) => c.state !== "up-to-date").map((c) => c.id) : []),
  );
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const nameOf = (id: string) => candidates.find((c) => c.id === id)?.name ?? id;
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  async function run() {
    if (busy || picked.size === 0) return;
    setBusy(true);
    setError(null);
    const body =
      mode === "update"
        ? { branchIds: [...picked], replaceLocal: [...replace].filter((id) => picked.has(id)) }
        : { branchIds: [...picked] };
    const reply = await sendJson(
      `/api/v1/school-templates/${encodeURIComponent(template.id)}/${mode === "update" ? "sync" : "branches"}`,
      "POST",
      body,
    );
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    setResults((reply.data as { results: Outcome[] }).results);
  }

  const good = results?.filter((r) => r.status === "ok" || r.status === "added").length ?? 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "update" ? `Update branches to ${template.name} version ${template.version}` : `Add ${template.name} to branches`}
      description={
        mode === "update"
          ? "Each chosen branch gets this version's look, marks, grade scale and trait sections. Class assignments are never touched, and results already entered keep the structure they were entered under."
          : "Each chosen branch gets its own copy that follows this template. A branch that already has a template with this name of its own is skipped."
      }
    >
      {results === null ? (
        <div className="mt-4 space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-fg-muted">
              {mode === "update" ? "No branch follows this template yet. Add it to a branch first." : "Every branch already has it."}
            </p>
          ) : (
            <ul aria-label="Branches" className="space-y-2">
              {candidates.map((c) => (
                <li key={c.id} className="rounded-xl border border-line p-2">
                  <CheckboxField
                    label={c.state ? `${c.name} (${STATE_LABEL[c.state]})` : c.name}
                    checked={picked.has(c.id)}
                    onChange={(e) => setPicked((s) => toggle(s, c.id, e.target.checked))}
                  />
                  {mode === "update" && (c.state === "customised" || c.state === "customised-behind") && picked.has(c.id) && (
                    <div className="ml-8">
                      <CheckboxField
                        label={`Replace local changes in ${c.name}`}
                        checked={replace.has(c.id)}
                        onChange={(e) => setReplace((s) => toggle(s, c.id, e.target.checked))}
                      />
                      <p className="text-xs text-fg-muted">Someone in this branch changed it. Without this, the branch is skipped.</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void run()} loading={busy} disabled={picked.size === 0}>
              {busy ? "Working…" : mode === "update" ? "Update branches" : "Add to branches"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ul aria-label="What happened" className="space-y-2">
            {results.map((r) => {
              const o = outcomeText(r.status, r.reason);
              return (
                <li
                  key={r.branchId}
                  className={`rounded-xl border px-3 py-2 text-sm ${o.tone === "ok" ? TONE.ok.chip : o.tone === "bad" ? TONE.danger.chip : TONE.neutral.chip}`}
                >
                  <strong>{nameOf(r.branchId)}:</strong> {o.text}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                void onDone(
                  `${good} of ${results.length} ${results.length === 1 ? "branch" : "branches"} ${mode === "update" ? "updated" : "added"}.`,
                )
              }
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
