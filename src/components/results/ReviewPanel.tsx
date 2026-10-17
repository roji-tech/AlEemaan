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

export function ReviewPanel({ branches }: { branches: BranchChoice[] }) {
  const admin = branches.filter((b) => b.canEdit);
  const [branchId, setBranchId] = useState((admin[0] ?? branches[0]).id);
  const [terms, setTerms] = useState<Term[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [queue, setQueue] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [unlocking, setUnlocking] = useState<{ group: Group; status: string } | null>(null);

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
                <p className="font-semibold text-fg">
                  {g.armName} · {g.subjectName}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {ORDER.filter((s) => g.counts[s]).map((s) => (
                    <li key={s} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-2">
                      {LABEL[s]} · {g.counts[s]}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-2">
                  {ORDER.filter((s) => g.counts[s] && ACTIONS[s]).map((s) => (
                    <div key={s} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-muted">
                        {g.counts[s]} {LABEL[s].toLowerCase()}:
                      </span>
                      {ACTIONS[s].map((a) => (
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
