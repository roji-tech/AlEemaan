"use client";

import { useCallback, useEffect, useState } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";

// Department review (task 0101 F, the maintainer: heads of department approving results). Where a branch asks for it, the head of a department (or an administrator) sees the SUBMITTED results of
// that department's subjects for a term, grouped by arm and subject, and passes them (so they can be approved) or sends them back to the teacher with a reason. This screen never approves or
// publishes: that is the Review tab, unchanged. Presentation only: the API decides who may do what.

type Group = {
  departmentId: string;
  departmentName: string;
  classArmId: string;
  armName: string;
  subjectId: string;
  subjectName: string;
  waiting: string[];
  reviewed: number;
};
type Term = { id: string; label: string; session: string; isCurrent: boolean };

export function DepartmentReviewPanel({
  branches,
  selectedBranchId,
  onSelectBranch,
}: {
  /// The branches where the switch is on and this person may review (the page chose them).
  branches: BranchChoice[];
  selectedBranchId?: string;
  onSelectBranch?: (id: string) => void;
}) {
  const mine = branches.filter((b) => b.headReview);
  const branchId = mine.some((b) => b.id === selectedBranchId) ? selectedBranchId! : (mine[0]?.id ?? "");
  const [terms, setTerms] = useState<Term[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [queue, setQueue] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const [pending, setPending] = useState<string | null>(null);
  const [returning, setReturning] = useState<Group | null>(null);

  useEffect(() => {
    if (!branchId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the terms on a branch change is exactly what this effect is for
    setQueue(null);
    void getJson(`/api/v1/academics/result-sheets/options?branchId=${encodeURIComponent(branchId)}`).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(say(r, "Couldn't load the terms."));
      setError(null);
      const periods = (r.data as unknown as { periods: Term[] }).periods;
      setTerms(periods);
      setPeriodId((periods.find((p) => p.isCurrent) ?? periods[0])?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [branchId]);

  const load = useCallback(async () => {
    if (!branchId || !periodId) return setQueue([]);
    const r = await getJson(`/api/v1/academics/results/department-review?branchId=${encodeURIComponent(branchId)}&periodId=${periodId}`);
    if (!r.ok) return setError(say(r, "Couldn't load the department review."));
    setError(null);
    setQueue((r.data as unknown as { queue: Group[] }).queue);
  }, [branchId, periodId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the queue when the term changes is exactly what this effect is for
    void load();
  }, [load]);

  async function act(group: Group, action: "pass" | "return", reason?: string) {
    const key = `${group.classArmId}|${group.subjectId}|${action}`;
    setPending(key);
    const reply = await sendJson("/api/v1/academics/results/department-review", "POST", {
      action,
      resultIds: group.waiting,
      ...(reason ? { reason } : {}),
    });
    setPending(null);
    if (!reply.ok) return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    const n = group.waiting.length;
    setNotice({
      variant: "success",
      text:
        action === "pass"
          ? `${n} ${n === 1 ? "result" : "results"} of ${group.subjectName} in ${group.armName} passed. They can now be approved.`
          : `${n} ${n === 1 ? "result" : "results"} of ${group.subjectName} in ${group.armName} sent back to the teacher.`,
    });
    setReturning(null);
    await load();
  }

  if (mine.length === 0) return null;
  const waitingTotal = (queue ?? []).reduce((sum, g) => sum + g.waiting.length, 0);
  return (
    <div className="space-y-4">
      <BranchPicker
        branches={mine}
        value={branchId}
        onChange={(id) => {
          setNotice(null);
          onSelectBranch?.(id);
        }}
      />
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      <section aria-labelledby="dept-review-heading" className="space-y-4">
        <div>
          <h2 id="dept-review-heading" className="text-lg font-semibold tracking-tight text-fg">
            Department review
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Submitted results of your departments&apos; subjects wait here for your review before an approver can approve them. Passing a
            group does not approve or publish anything.
          </p>
        </div>
        {terms.length > 0 && (
          <SelectField
            label="Term"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            options={terms.map((p) => ({ value: p.id, label: `${p.label} · ${p.session}` }))}
          />
        )}
        <p className="text-sm text-fg-muted" aria-live="polite">
          {queue === null
            ? " "
            : waitingTotal === 0
              ? "Nothing is waiting for your review."
              : `${waitingTotal} ${waitingTotal === 1 ? "result is" : "results are"} waiting.`}
        </p>
        <ul aria-label="Results to review" className="space-y-3">
          {(queue ?? []).map((g) => {
            const key = `${g.classArmId}|${g.subjectId}`;
            return (
              <li key={key} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">
                      {g.subjectName} · {g.armName}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {g.departmentName}: {g.waiting.length} waiting{g.reviewed > 0 ? `, ${g.reviewed} already passed` : ""}
                    </p>
                  </div>
                  {g.waiting.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        loading={pending === `${key}|pass`}
                        disabled={pending !== null}
                        onClick={() => void act(g, "pass")}
                        aria-label={`Pass ${g.waiting.length} results of ${g.subjectName} in ${g.armName}`}
                      >
                        Pass review
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pending !== null}
                        onClick={() => setReturning(g)}
                        aria-label={`Return the results of ${g.subjectName} in ${g.armName} to the teacher`}
                      >
                        Return to teacher
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <ReturnDialog
        key={returning ? `${returning.classArmId}|${returning.subjectId}` : "no-return"}
        group={returning}
        busy={pending?.endsWith("|return") === true}
        onClose={() => setReturning(null)}
        onSend={(reason) => returning && act(returning, "return", reason)}
      />
    </div>
  );
}

function ReturnDialog({
  group,
  busy,
  onClose,
  onSend,
}: {
  group: Group | null;
  busy: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (!group) return null;
  const short = reason.trim().length < 5;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Return ${group.subjectName} in ${group.armName}`}
      description="The teacher gets the marks back as drafts to correct and submit again. Say what needs another look."
    >
      <div className="mt-4 space-y-4">
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} hint="At least 5 characters." />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={short} onClick={() => onSend(reason.trim())}>
            Return to teacher
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
