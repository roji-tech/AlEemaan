"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { GENERIC_ERROR, getJson, sendJson } from "@/components/auth/postJson";
import { formatNaira } from "@/lib/finance/format";

// A pupil's fee lines (task 0122), from the pupil's Actions list, for an administrator of the pupil's branch (the API refuses anyone else): which lines of the term are charged to this pupil, an
// optional line they opt out of (the school uniform), the items they have received (the uniform), and how the fee lines see them (new or returning, worked out unless set here). An opt-out also
// changes an invoice already made, but only while nothing has been paid on it; the server says why when it cannot.

type Item = {
  feeStructureId: string;
  name: string;
  amount: string;
  verdict: "billed" | "other-audience" | "missing-residence" | "opted-out";
  optional: boolean;
  trackHandover: boolean;
  onInvoice: boolean;
  received: { on: string; note: string | null } | null;
};
type Data = {
  periodId: string;
  periodLabel: string;
  periods: { id: string; label: string }[];
  admissionSetting: "NEW" | "RETURNING" | null;
  admission: "NEW" | "RETURNING";
  invoice: { id: string; invoiceNo: string; status: string; amountPaid: string } | null;
  items: Item[];
};

const dayText = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
const STATUS_TEXT: Record<string, string> = {
  UNPAID: "Not paid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export function PupilFeeItemsDialog({
  branchId,
  pupil,
  onClose,
  onChanged,
}: {
  branchId: string;
  pupil: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = pupil ? `/api/v1/finance/students/${pupil.id}` : "";

  const load = useCallback(
    async (id: string, periodId?: string) => {
      const reply = await getJson(
        `/api/v1/finance/students/${id}/fee-items?branchId=${encodeURIComponent(branchId)}${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`,
      );
      if (reply.ok) {
        setData(reply.data as unknown as Data);
        setError(null);
      } else setError(reply.message ?? GENERIC_ERROR);
    },
    [branchId],
  );

  useEffect(() => {
    if (!pupil) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a newly opened pupil starts from a clean dialog */
    setData(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(pupil.id);
  }, [pupil, load]);

  if (!pupil)
    return (
      <Dialog open={false} onClose={onClose} title="Fee lines">
        {null}
      </Dialog>
    );

  async function run(key: string, path: string, body: unknown, done: string) {
    setBusy(key);
    const reply = await sendJson(`${base}${path}`, "PUT", body);
    setBusy(null);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    setError(null);
    await load(pupil!.id, data?.periodId);
    onChanged(done);
  }

  const here = (data?.items ?? []).filter((i) => i.verdict !== "other-audience");
  const away = (data?.items ?? []).length - here.length;
  const total = here.filter((i) => i.verdict === "billed").reduce((n, i) => n + Number(i.amount), 0);

  return (
    <Dialog open onClose={onClose} title={`Fee lines of ${pupil.name}`}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {data === null && !error && <p className="text-sm text-fg-muted">Loading...</p>}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Term"
                value={data.periodId}
                onChange={(e) => void load(pupil.id, e.target.value)}
                options={data.periods.map((p) => ({ value: p.id, label: p.label }))}
              />
              <SelectField
                label="New or returning"
                value={data.admissionSetting ?? ""}
                disabled={busy === "admission"}
                hint={`Counted as ${data.admission === "NEW" ? "new" : "returning"} this term${data.admissionSetting ? " (set here)" : ", worked out from the pupil's earlier years"}.`}
                onChange={(e) =>
                  void run(
                    "admission",
                    "/admission-status?branchId=" + encodeURIComponent(branchId),
                    { admission: e.target.value || null },
                    `${pupil.name} is now counted as ${e.target.value === "NEW" ? "new" : e.target.value === "RETURNING" ? "returning" : "worked out automatically"}.`,
                  )
                }
                options={[
                  { value: "", label: "Worked out automatically" },
                  { value: "NEW", label: "New" },
                  { value: "RETURNING", label: "Returning" },
                ]}
              />
            </div>
            {data.invoice && (
              <p className="text-xs text-fg-muted" role="status">
                Invoice {data.invoice.invoiceNo}: {STATUS_TEXT[data.invoice.status] ?? data.invoice.status},{" "}
                {formatNaira(Number(data.invoice.amountPaid))} paid. Changes to the lines below also change this invoice while nothing has
                been paid on it.
              </p>
            )}
            {here.length === 0 ? (
              <p className="text-sm text-fg-muted">No fee lines for this pupil&apos;s class in this term.</p>
            ) : (
              <ul aria-label="Fee lines" className="divide-y divide-line rounded-xl border border-line">
                {here.map((i) => (
                  <li key={i.feeStructureId} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-fg">{i.name}</p>
                        <p className="text-xs text-fg-muted">
                          {formatNaira(Number(i.amount))} ·{" "}
                          {i.verdict === "opted-out"
                            ? "Opted out: not charged"
                            : i.verdict === "missing-residence"
                              ? "Not charged: set whether this pupil is a day pupil or a boarder"
                              : i.optional
                                ? "Optional"
                                : "Charged"}
                        </p>
                        {i.received && <p className="text-xs text-fg-2">Received {dayText(i.received.on)}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {i.optional && i.verdict !== "missing-residence" && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy === `o${i.feeStructureId}`}
                            aria-label={`${i.verdict === "opted-out" ? "Charge" : "Opt out of"} ${i.name}`}
                            onClick={() =>
                              void run(
                                `o${i.feeStructureId}`,
                                `/fee-items/${i.feeStructureId}/opt-out?branchId=${encodeURIComponent(branchId)}`,
                                { optedOut: i.verdict !== "opted-out" },
                                i.verdict === "opted-out"
                                  ? `${i.name} is charged to ${pupil.name} again.`
                                  : `${pupil.name} is opted out of ${i.name}.`,
                              )
                            }
                          >
                            {i.verdict === "opted-out" ? "Charge again" : "Opt out"}
                          </Button>
                        )}
                        {i.trackHandover && i.verdict === "billed" && (
                          <Button
                            type="button"
                            variant={i.received ? "secondary" : "primary"}
                            disabled={busy === `h${i.feeStructureId}`}
                            aria-label={`${i.received ? "Undo received for" : "Mark received for"} ${i.name}`}
                            onClick={() =>
                              void run(
                                `h${i.feeStructureId}`,
                                `/fee-items/${i.feeStructureId}/handover?branchId=${encodeURIComponent(branchId)}`,
                                { received: !i.received },
                                i.received ? `Receipt of ${i.name} undone for ${pupil.name}.` : `${pupil.name} has received ${i.name}.`,
                              )
                            }
                          >
                            {i.received ? "Undo received" : "Mark received"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-fg-2">Charged this term: {formatNaira(total)}</p>
            {away > 0 && (
              <p className="text-xs text-fg-muted">
                {away} more {away === 1 ? "line is" : "lines are"} for other pupils (another gender, new or returning, or day or boarding)
                and not shown.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
