"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNotice } from "@/components/ui/Toaster";
import { Alert } from "@/components/ui/Alert";
import { BranchPicker } from "@/components/ui/BranchPicker";
import { Button } from "@/components/ui/Button";
import { Collection, Item, ItemTile } from "@/components/ui/Collection";
import { Dialog } from "@/components/ui/Dialog";
import { ClipboardIcon } from "@/components/ui/icons";
import { Pager, paginate } from "@/components/ui/Pager";
import { SelectField } from "@/components/ui/SelectField";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say, type BranchChoice } from "@/components/academics/common";

// Requests for a decision: a teacher's own assessment scheme, an administrator's change to the report-card layout or to the public verification page. Whoever may
// decide sees Approve and Reject (a decision needs a reason, recorded); the API refuses anyone else, and anyone deciding their own request.
// Drawn by the shared list/grid kit (task 0089): a row each by default, cards if the person chooses, paged in the browser (the API answers with the whole list for a branch and status).

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
// The status as a pill, in the same colours the page's messages use.
const STATUS: Record<Approval["status"], { text: string; style: string }> = {
  PENDING: { text: "Waiting", style: "border-warn-line bg-warn-bg text-warn-fg" },
  APPROVED: { text: "Approved", style: "border-ok-line bg-ok-bg text-ok-fg" },
  REJECTED: { text: "Rejected", style: "border-danger-line bg-danger-bg text-danger-fg" },
  DRAFT: { text: "Draft", style: "border-line-strong text-fg-2" },
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
  const [notice, setNotice] = useNotice();
  const [deciding, setDeciding] = useState<{ item: Approval; action: "APPROVE" | "REJECT" } | null>(null);
  const [page, setPage] = useState(1);
  // List or grid, and how many to a page: remembered in this browser (task 0089).
  const layout = useCollectionView("approvals-requests", { defaultView: "list", page, onPage: setPage });

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

  const shown = paginate(items ?? [], page, layout.size);

  return (
    <div className="space-y-4">
      <BranchPicker
        branches={branches}
        value={branchId}
        onChange={(id) => {
          setItems(null);
          setPage(1);
          setBranchId(id);
        }}
      />
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="basis-full sm:basis-72">
          <SelectField
            label="Show"
            value={status}
            onChange={(e) => {
              setItems(null);
              setPage(1);
              setStatus(e.target.value);
            }}
            options={[
              { value: "PENDING", label: "Waiting for a decision" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
            ]}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {items !== null && (
            <p className="text-sm text-fg-muted" aria-live="polite">
              {items.length} {items.length === 1 ? "request" : "requests"}
            </p>
          )}
          <ViewToggle view={layout.view} onChange={layout.setView} />
        </div>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      <Collection
        label="Requests"
        view={layout.view}
        state={items === null ? "loading" : items.length === 0 ? "empty" : "ready"}
        emptyText="Nothing here."
      >
        {shown.rows.map((a) => {
          const asker = a.actor.name ?? "someone";
          const badge = STATUS[a.status];
          return (
            <Item
              key={a.id}
              leading={
                <ItemTile>
                  <ClipboardIcon className="h-5 w-5" />
                </ItemTile>
              }
              title={what(a)}
              subtitle={`Asked by ${asker} on ${a.createdAt.slice(0, 10)}${a.decider ? ` · ${a.status.toLowerCase()} by ${a.decider.name ?? "an administrator"}` : ""}`}
              badges={<span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.style}`}>{badge.text}</span>}
              actionsStyle="buttons"
              actions={
                a.status === "PENDING"
                  ? [
                      {
                        id: "approve",
                        label: "Approve",
                        ariaLabel: `Approve ${what(a)} from ${asker}`,
                        onClick: () => setDeciding({ item: a, action: "APPROVE" }),
                      },
                      {
                        id: "reject",
                        label: "Reject",
                        ariaLabel: `Reject ${what(a)} from ${asker}`,
                        variant: "ghost",
                        onClick: () => setDeciding({ item: a, action: "REJECT" }),
                      },
                    ]
                  : undefined
              }
            >
              <div className="space-y-1">
                <p className="text-fg">Reason: {a.reason}</p>
                {a.proposedValue && <p className="text-xs break-words text-fg-muted">Proposed: {describe(a.proposedValue)}</p>}
                {a.decisionReason && <p className="text-fg-muted">Decision: {a.decisionReason}</p>}
              </div>
            </Item>
          );
        })}
      </Collection>
      {items !== null && (
        <Pager
          page={shown.page}
          pages={shown.pages}
          onPage={setPage}
          label="Pages of requests"
          total={items.length}
          size={layout.size}
          sizes={layout.sizes}
          onSize={layout.setSize}
        />
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
