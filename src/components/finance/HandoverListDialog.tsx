"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { GENERIC_ERROR, getJson, sendJson } from "@/components/auth/postJson";
import { formatNaira } from "@/lib/finance/format";

// The items handed over (task 0122), from a tracked fee line on Finance > Fees: the pupils who have the line on their invoice, whether the invoice is paid, and whether each pupil has received the
// item. Marking records only: no invoice or payment waits for it. For an administrator of the branch (the API refuses anyone else).

type Row = {
  studentId: string;
  name: string;
  admissionNo: string | null;
  className: string | null;
  invoiceStatus: string;
  amountPaid: string;
  totalAmount: string;
  received: { on: string; note: string | null } | null;
};
type Line = { id: string; periodId: string; name: string };

const STATUS_TEXT: Record<string, string> = {
  UNPAID: "Not paid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};
const dayText = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

export function HandoverListDialog({ branchId, line, onClose }: { branchId: string; line: Line | null; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "WAITING">("ALL");

  const load = useCallback(
    async (l: Line) => {
      const reply = await getJson(
        `/api/v1/finance/handovers?branchId=${encodeURIComponent(branchId)}&periodId=${encodeURIComponent(l.periodId)}&feeId=${encodeURIComponent(l.id)}`,
      );
      if (reply.ok) {
        setRows(reply.data!.rows as Row[]);
        setError(null);
      } else setError(reply.message ?? GENERIC_ERROR);
    },
    [branchId],
  );

  useEffect(() => {
    if (!line) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened line starts from a clean list */
    setRows(null);
    setError(null);
    setFilter("ALL");
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(line);
  }, [line, load]);

  if (!line)
    return (
      <Dialog open={false} onClose={onClose} title="Handover">
        {null}
      </Dialog>
    );

  async function mark(row: Row, received: boolean) {
    setBusy(row.studentId);
    const reply = await sendJson(
      `/api/v1/finance/students/${row.studentId}/fee-items/${line!.id}/handover?branchId=${encodeURIComponent(branchId)}`,
      "PUT",
      { received },
    );
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    await load(line!);
  }

  const shown = (rows ?? []).filter((r) => filter === "ALL" || !r.received);
  const got = (rows ?? []).filter((r) => r.received).length;

  return (
    <Dialog open onClose={onClose} title={`Handover: ${line.name}`}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {rows === null && !error && <p className="text-sm text-fg-muted">Loading...</p>}
        {rows && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg-muted" role="status">
                {got} of {rows.length} received
              </p>
              <div className="flex gap-2" role="group" aria-label="Show">
                <Button
                  type="button"
                  variant={filter === "ALL" ? "primary" : "secondary"}
                  aria-pressed={filter === "ALL"}
                  onClick={() => setFilter("ALL")}
                >
                  Everyone
                </Button>
                <Button
                  type="button"
                  variant={filter === "WAITING" ? "primary" : "secondary"}
                  aria-pressed={filter === "WAITING"}
                  onClick={() => setFilter("WAITING")}
                >
                  Not yet received
                </Button>
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-fg-muted">{rows.length === 0 ? "No invoice has this item yet." : "Everyone has received it."}</p>
            ) : (
              <ul aria-label="Pupils" className="divide-y divide-line rounded-xl border border-line">
                {shown.map((r) => (
                  <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-fg">{r.name}</p>
                      <p className="text-xs text-fg-muted">
                        {[r.admissionNo, r.className].filter(Boolean).join(" · ")}
                        {" · "}
                        {STATUS_TEXT[r.invoiceStatus] ?? r.invoiceStatus} ({formatNaira(r.amountPaid)} of{" "}
                        {formatNaira(Number(r.totalAmount))})
                      </p>
                      {r.received && <p className="text-xs text-fg-2">Received {dayText(r.received.on)}</p>}
                    </div>
                    <Button
                      type="button"
                      variant={r.received ? "secondary" : "primary"}
                      disabled={busy === r.studentId}
                      aria-label={`${r.received ? "Undo received for" : "Mark received for"} ${r.name}`}
                      onClick={() => void mark(r, !r.received)}
                    >
                      {r.received ? "Undo" : "Mark received"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
