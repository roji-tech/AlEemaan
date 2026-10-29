"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Review (Slice P2d, administrators): the term's queue - each arm and subject with how many results are in each status - and the actions for a whole group. The
// server decides every rule (including "not your own entries"); a refusal is shown in its own words. Presentation only.

type Group = {
  classArmId: string;
  armName: string;
  subjectId: string;
  subjectName: string;
  counts: Record<string, number>;
  ids: Record<string, string[]>;
};
type Term = { id: string; label: string; session: string; isCurrent: boolean };
const ORDER = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED", "LOCKED"] as const;
const LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  LOCKED: "Locked",
};
/// Which actions apply to results in each status, in the order offered.
const ACTIONS: Record<string, { action: string; label: string; variant: "primary" | "secondary" | "ghost" }[]> = {
  SUBMITTED: [
    { action: "approve", label: "Approve", variant: "primary" },
    { action: "return", label: "Return to teacher", variant: "secondary" },
  ],
  APPROVED: [
    { action: "publish", label: "Publish", variant: "primary" },
    { action: "revert", label: "Send back for review", variant: "secondary" },
  ],
  PUBLISHED: [
    { action: "lock", label: "Lock", variant: "secondary" },
    { action: "unlock", label: "Unlock…", variant: "ghost" },
  ],
  LOCKED: [{ action: "unlock", label: "Unlock…", variant: "ghost" }],
};

export function ReviewPanel({
  branches,
  selectedBranchId,
  onSelectBranch,
}: {
  branches: BranchChoice[];
  selectedBranchId?: string;
  onSelectBranch?: (id: string) => void;
}) {
  // The branches this person reviews in: the ones they administer and the ones where they are an approver (task 0039).
  const admin = branches.filter((b) => b.canEdit || b.canApprove);
  const [internalBranchId, setInternalBranchId] = useState((admin[0] ?? branches[0]).id);
  const branchId = selectedBranchId ?? internalBranchId;
  // Unlock is an administrator's alone: an approver is not shown it (the server refuses it too).
  const mayUnlock = branches.find((b) => b.id === branchId)?.canEdit ?? false;
  const actionsFor = (status: string) => (ACTIONS[status] ?? []).filter((a) => a.action !== "unlock" || mayUnlock);
  const setBranchId = (id: string) => {
    setInternalBranchId(id);
    onSelectBranch?.(id);
  };
  const [terms, setTerms] = useState<Term[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [queue, setQueue] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [unlocking, setUnlocking] = useState<{ group: Group; status: string } | null>(null);
  const [historyGroup, setHistoryGroup] = useState<Group | null>(null);

  useEffect(() => {
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
    if (!periodId) return setQueue([]);
    const r = await getJson(`/api/v1/academics/results/queue?branchId=${encodeURIComponent(branchId)}&periodId=${periodId}`);
    if (!r.ok) return setError(say(r, "Couldn't load the review queue."));
    setError(null);
    setQueue((r.data as unknown as { queue: Group[] }).queue);
  }, [branchId, periodId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the queue when the choice changes is exactly what this effect is for
    void load();
  }, [load]);

  async function run(group: Group, status: string, action: string, reason?: string) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const ids = group.ids[status] ?? [];
    const reply = await sendJson("/api/v1/academics/results/transition", "POST", { action, resultIds: ids, ...(reason ? { reason } : {}) });
    setPending(false);
    setNotice(
      reply.ok
        ? {
            variant: "success",
            text: `${group.armName} · ${group.subjectName}: ${ids.length} ${ids.length === 1 ? "result" : "results"} — ${action} done.`,
          }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    setUnlocking(null);
    await load();
  }

  return (
    <div className="space-y-6">
      {admin.length > 1 && (
        <SelectField
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setNotice(null);
            setBranchId(e.target.value);
          }}
          options={admin.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {terms.length > 0 && (
        <SelectField
          label="Term"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={terms.map((p) => ({ value: p.id, label: `${p.label} · ${p.session}` }))}
        />
      )}

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="text-lg font-semibold tracking-tight text-fg">
          Results waiting for you
        </h2>
        {queue === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : queue.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No results have been entered for this term yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {queue.map((g) => (
              <li key={`${g.classArmId}|${g.subjectId}`} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-fg">
                    {g.armName} · {g.subjectName}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => setHistoryGroup(g)}
                    aria-label={`View audit history for ${g.armName} ${g.subjectName}`}
                  >
                    View history
                  </Button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {ORDER.filter((s) => g.counts[s]).map((s) => (
                    <li key={s} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-2">
                      {LABEL[s]} · {g.counts[s]}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-2">
                  {ORDER.filter((s) => g.counts[s] && actionsFor(s).length > 0).map((s) => (
                    <div key={s} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-muted">
                        {g.counts[s]} {LABEL[s].toLowerCase()}:
                      </span>
                      {actionsFor(s).map((a) => (
                        <Button
                          key={a.action}
                          variant={a.variant}
                          disabled={pending}
                          aria-label={`${a.label.replace("…", "")} ${g.counts[s]} ${LABEL[s].toLowerCase()} results of ${g.armName} ${g.subjectName}`}
                          onClick={() => (a.action === "unlock" ? setUnlocking({ group: g, status: s }) : run(g, s, a.action))}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UnlockDialog
        key={unlocking ? `${unlocking.group.classArmId}|${unlocking.group.subjectId}|${unlocking.status}` : "none"}
        target={unlocking}
        pending={pending}
        onClose={() => setUnlocking(null)}
        onConfirm={(reason) => unlocking && run(unlocking.group, unlocking.status, "unlock", reason)}
      />

      <HistoryDialog
        key={historyGroup ? `${historyGroup.classArmId}|${historyGroup.subjectId}` : "none"}
        group={historyGroup}
        periodId={periodId}
        onClose={() => setHistoryGroup(null)}
      />
    </div>
  );
}

function UnlockDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: { group: Group; status: string } | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) return setProblem("Give a reason of at least 5 characters.");
    setProblem(null);
    onConfirm(reason.trim());
  }
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Unlock results"
      description={
        target
          ? `${target.group.armName} · ${target.group.subjectName}: ${target.group.counts[target.status]} results go back to approved and their verification codes stop working until they are published again. The reason is kept in the history.`
          : undefined
      }
    >
      {target && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={problem}
            maxLength={300}
            autoComplete="off"
            disabled={pending}
          />
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Unlock
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

type HistoryItem = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName?: string;
  actorEmail?: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  fromTotal: number | null;
  toTotal: number | null;
  reason: string | null;
  at: string;
};

type SheetStudent = {
  id: string;
  name: string;
  admissionNo: string;
  result: {
    id: string;
    status: string;
    parts: { name: string; score: number }[];
    exam: number;
    total: number;
    gradeLetter: string;
    gradeRemark: string;
  } | null;
};

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  ENTERED: { label: "Entered", bg: "bg-surface-2", text: "text-fg" },
  SUBMIT: { label: "Submitted", bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400" },
  APPROVE: { label: "Approved", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400" },
  PUBLISH: { label: "Published", bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-400" },
  RETURN: { label: "Returned", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  REVERT: { label: "Reverted", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400" },
  LOCK: { label: "Locked", bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-400" },
  UNLOCK: { label: "Unlocked", bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-400" },
};

function formatTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function HistoryDialog({ group, periodId, onClose }: { group: Group | null; periodId: string; onClose: () => void }) {
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group || !periodId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state when dialog target changes
    setLoadingSheet(true);
    setError(null);
    setHistory(null);

    void getJson(
      `/api/v1/academics/result-sheets?periodId=${encodeURIComponent(periodId)}&classArmId=${encodeURIComponent(group.classArmId)}&subjectId=${encodeURIComponent(group.subjectId)}`,
    ).then((r) => {
      if (!live) return;
      setLoadingSheet(false);
      if (!r.ok) {
        setError(say(r, "Couldn't load result details for this group."));
        return;
      }
      const data = r.data as { sheet?: { students?: SheetStudent[] } };
      const rawStudents = data.sheet?.students ?? [];
      const withResults = rawStudents.filter((s) => s.result !== null);
      setStudents(withResults);
      if (withResults.length > 0) {
        setSelectedStudentId(withResults[0].id);
      }
    });

    return () => {
      live = false;
    };
  }, [group, periodId]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const resultId = selectedStudent?.result?.id;

  useEffect(() => {
    if (!resultId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing history when no result is selected
      setHistory(null);
      return;
    }
    let live = true;
    setLoadingHistory(true);
    void getJson(`/api/v1/academics/results/${encodeURIComponent(resultId)}/history`).then((r) => {
      if (!live) return;
      setLoadingHistory(false);
      if (!r.ok) {
        setError(say(r, "Couldn't load audit history for this student."));
        return;
      }
      const data = r.data as { history?: HistoryItem[] };
      setHistory(data.history ?? []);
    });

    return () => {
      live = false;
    };
  }, [resultId]);

  return (
    <Dialog
      open={group !== null}
      onClose={onClose}
      title={group ? `Audit History: ${group.armName} · ${group.subjectName}` : "Audit History"}
      description="Inspect result status transitions, grade edits, unlock reasons, and user actions."
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {loadingSheet ? (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading students…
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-fg-muted">No student results recorded for this subject and arm.</p>
        ) : (
          <div className="space-y-4">
            <SelectField
              label="Select Student"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              options={students.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.admissionNo}) — ${s.result ? `${LABEL[s.result.status] ?? s.result.status}, Total: ${s.result.total}` : "No result"}`,
              }))}
            />

            {selectedStudent && (
              <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{selectedStudent.name}</span>
                  <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-2">
                    Current status: {LABEL[selectedStudent.result?.status ?? ""] ?? selectedStudent.result?.status}
                  </span>
                </div>
                {selectedStudent.result && (
                  <p className="mt-1 text-xs text-fg-muted">
                    Total: <strong className="text-fg">{selectedStudent.result.total}</strong> · Grade:{" "}
                    <strong className="text-fg">{selectedStudent.result.gradeLetter}</strong> ({selectedStudent.result.gradeRemark})
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Audit Trail</h3>
              {loadingHistory ? (
                <p className="text-sm text-fg-muted" aria-busy="true">
                  Loading history…
                </p>
              ) : history === null || history.length === 0 ? (
                <p className="text-sm text-fg-muted">No audit events recorded for this result.</p>
              ) : (
                <ol className="relative space-y-3 border-l-2 border-line pl-4">
                  {history.map((item) => {
                    const badge = ACTION_BADGES[item.action] ?? {
                      label: item.action,
                      bg: "bg-surface-2",
                      text: "text-fg",
                    };
                    return (
                      <li key={item.id} className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
                          <span className="text-xs text-fg-muted">{formatTimestamp(item.at)}</span>
                        </div>
                        <div className="text-xs text-fg">
                          {item.fromStatus || item.toStatus ? (
                            <span>
                              Status: <span className="font-medium">{item.fromStatus ?? "Draft"}</span> ➔{" "}
                              <span className="font-semibold">{item.toStatus}</span>
                            </span>
                          ) : null}
                          {item.fromTotal !== null || item.toTotal !== null ? (
                            <span className="ml-2 text-fg-muted">
                              (Score: {item.fromTotal ?? "—"} ➔ {item.toTotal ?? "—"})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-fg-muted">
                          By: <span className="font-medium text-fg">{item.actorName ?? (item.actorUserId ? "Staff" : "System")}</span>
                        </div>
                        {item.reason && (
                          <div className="rounded bg-surface p-2 text-xs italic text-fg-muted border border-line">
                            Reason: &ldquo;{item.reason}&rdquo;
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
