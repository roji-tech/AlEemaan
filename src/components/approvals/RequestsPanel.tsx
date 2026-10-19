"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice, type Notice } from "@/components/academics/common";

// Requests for a decision: a teacher's own assessment scheme, an administrator's change to the report-card layout or to the public verification page. Whoever may
// decide sees Approve and Reject (a decision needs a reason, recorded); the API refuses anyone else, and anyone deciding their own request.

type Approval = {
  id: string;
  settingKey: string;
  targetType: string;
  actor: { id: string; name: string | null };
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DRAFT";
  decider: { id: string; name: string | null } | null;
  decidedAt: string | null;
  decisionReason: string | null;
  proposedValue: Record<string, unknown> | null;
  createdAt: string;
};

const WHAT: Record<string, string> = {
  report_card_layout: "Report-card layout",
  verification_page: "Public verification page",
};
const what = (a: Approval) =>
  WHAT[a.settingKey] ?? (a.targetType === "ASSESSMENT_SCHEME" ? "A teacher's assessment scheme" : a.settingKey.replaceAll("_", " "));

function describe(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function RequestsPanel({ branches }: { branches: BranchChoice[] }) {
  const [branchId, setBranchId] = useState(branches[0].id);
  const [status, setStatus] = useState("PENDING");
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [deciding, setDeciding] = useState<{ item: Approval; action: "APPROVE" | "REJECT" } | null>(null);

  const load = useCallback(async () => {
    const r = await getJson(`/api/v1/settings/approval?branchId=${encodeURIComponent(branchId)}&status=${status}`);
    if (!r.ok) return setError(say(r, "Couldn't load the requests."));
    setError(null);
    setItems(r.data!.approvals as Approval[]);
  }, [branchId, status]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch / filter change is exactly what this effect is for
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.length > 1 && (
          <SelectField
            label="Branch"
            value={branchId}
            onChange={(e) => {
              setItems(null);
              setBranchId(e.target.value);
            }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <SelectField
          label="Show"
          value={status}
          onChange={(e) => {
            setItems(null);
            setStatus(e.target.value);
          }}
          options={[
            { value: "PENDING", label: "Waiting for a decision" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {items === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((a) => (
            <li key={a.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{what(a)}</p>
                  <p className="text-sm text-fg-muted">
                    Asked by {a.actor.name ?? "someone"} on {a.createdAt.slice(0, 10)} ·{" "}
                    {a.status === "PENDING" ? "waiting" : a.status.toLowerCase()}
                    {a.decider ? ` by ${a.decider.name ?? "an administrator"}` : ""}
                  </p>
                </div>
                {a.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setDeciding({ item: a, action: "APPROVE" })}
                      aria-label={`Approve ${what(a)} from ${a.actor.name ?? "someone"}`}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeciding({ item: a, action: "REJECT" })}
                      aria-label={`Reject ${what(a)} from ${a.actor.name ?? "someone"}`}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm text-fg">Reason: {a.reason}</p>
              {a.proposedValue && <p className="text-xs break-words text-fg-muted">Proposed: {describe(a.proposedValue)}</p>}
              {a.decisionReason && <p className="text-sm text-fg-muted">Decision: {a.decisionReason}</p>}
            </li>
          ))}
        </ul>
      )}
      <DecideDialog
        key={deciding ? `${deciding.item.id}-${deciding.action}` : "none"}
        deciding={deciding}
        onClose={() => setDeciding(null)}
        onDone={async (text) => {
          setDeciding(null);
          setNotice({ variant: "success", text });
          await load();
        }}
      />
    </div>
  );
}

function DecideDialog({
  deciding,
  onClose,
  onDone,
}: {
  deciding: { item: Approval; action: "APPROVE" | "REJECT" } | null;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deciding || pending) return;
    setPending(true);
    setProblem(null);
    const r = await sendJson(`/api/v1/settings/approval/${deciding.item.id}`, "PATCH", { action: deciding.action, decisionReason: reason });
    setPending(false);
    if (r.ok) return void (await onDone(deciding.action === "APPROVE" ? "Approved." : "Rejected."));
    setProblem(say(r, "That didn't work."));
  }
  const verb = deciding?.action === "APPROVE" ? "Approve" : "Reject";
  return (
    <Dialog
      open={deciding !== null}
      onClose={onClose}
      title={`${verb} this request`}
      description={deciding ? `${what(deciding.item)} from ${deciding.item.actor.name ?? "someone"}.` : undefined}
    >
      {deciding && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="decision-reason" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
              Your reason (recorded with the decision)
            </label>
            <textarea
              id="decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-line bg-field p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={reason.trim() === ""}>
              {verb}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
