"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { formatNaira, InvoiceStatus } from "@/lib/finance/format";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { DiscountModal } from "./DiscountModal";

export interface InvoiceDetail {
  id: string;
  branchId: string;
  invoiceNo: string;
  totalAmount: number | string;
  amountPaid: number | string;
  status: InvoiceStatus;
  dueDate: string | null;
  lineItems: { name: string; amount: string | number; feeStructureId?: string }[] | null;
  createdAt: string;
  /// "Pay in full only" on this invoice (task 0046), and what the server says may be paid on it now.
  payInFull?: boolean;
  partPayment?: { allowed: boolean; smallest: string | null; text: string };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNo: string;
    guardianName?: string | null;
    guardianPhone?: string | null;
  };
  period: {
    id: string;
    label: string;
    session?: { label: string };
    branch?: { name: string };
  };
  payments: {
    id: string;
    amount: number | string;
    provider: string;
    providerRef: string;
    status: string;
    receiptNo: string | null;
    channel: string | null;
    paidAt: string | null;
  }[];
  discounts: {
    id: string;
    amount: number | string;
    reason: string;
    mode: string;
    createdAt: string;
  }[];
}

export interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceDetail | null;
  canManage?: boolean;
  /// Something changed that the whole list shows (a payment, a discount): reload the list. The list reloads behind a spinner, so the dialogs close.
  onRefresh: () => void;
  /// Something changed that only this invoice shows (the "pay in full only" mark): read this invoice again and keep the dialog open. Falls back to `onRefresh`.
  onReloadInvoice?: () => void;
}

export function InvoiceDetailModal({ isOpen, onClose, invoice, canManage = true, onRefresh, onReloadInvoice }: InvoiceDetailModalProps) {
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [payInFullBusy, setPayInFullBusy] = useState(false);
  const [payInFullError, setPayInFullError] = useState<string | null>(null);

  if (!isOpen || !invoice) return null;

  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.amountPaid);
  const balanceDue = Math.max(0, total - paid);
  const isPaid = invoice.status === InvoiceStatus.PAID;
  const isWaived = invoice.status === InvoiceStatus.WAIVED;
  const isPartial = invoice.status === InvoiceStatus.PARTIALLY_PAID;

  async function togglePayInFull() {
    if (!invoice || payInFullBusy) return;
    setPayInFullBusy(true);
    setPayInFullError(null);
    try {
      const res = await fetch(`/api/v1/finance/invoices/${invoice.id}/pay-in-full?branchId=${invoice.branchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payInFull: !invoice.payInFull }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setPayInFullError(json?.error?.message ?? "That didn't work. Please try again.");
      } else {
        (onReloadInvoice ?? onRefresh)();
      }
    } catch {
      setPayInFullError("Can't reach the server. Check your internet connection and try again.");
    } finally {
      setPayInFullBusy(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} title={`Invoice ${invoice.invoiceNo}`}>
        <div className="space-y-6">
          {/* Top Info Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-4">
            <div>
              <p className="text-sm font-bold text-fg">
                {invoice.student.firstName} {invoice.student.lastName}
              </p>
              <p className="text-xs text-fg-muted mt-0.5">
                Adm No: <span className="font-mono text-fg">{invoice.student.admissionNo}</span> • {invoice.period.branch?.name ?? "Branch"}{" "}
                • {invoice.period.label} ({invoice.period.session?.label ?? ""})
              </p>
            </div>
            <div>
              {isPaid && (
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-ok-fg">
                  ✓ PAID IN FULL
                </span>
              )}
              {isPartial && (
                <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-warn-fg">
                  PARTIALLY PAID
                </span>
              )}
              {!isPaid && !isPartial && !isWaived && (
                <span className="rounded-full bg-danger-bg border border-danger-line px-3 py-1 text-xs font-bold text-danger-fg">
                  UNPAID
                </span>
              )}
              {isWaived && (
                <span className="rounded-full bg-surface border border-line px-3 py-1 text-xs font-bold text-fg-muted">WAIVED</span>
              )}
            </div>
          </div>

          {/* Balance Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="text-[11px] text-fg-muted block">Total Billed</span>
              <span className="text-base font-bold text-fg mt-1 block">{formatNaira(total)}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="text-[11px] text-fg-muted block">Amount Paid</span>
              <span className="text-base font-bold text-ok-fg mt-1 block">{formatNaira(paid)}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="text-[11px] text-fg-muted block">Balance Due</span>
              <span className="text-base font-bold text-warn-fg mt-1 block">{formatNaira(balanceDue)}</span>
            </div>
          </div>

          {/* What may be paid now (task 0046) */}
          {invoice.partPayment && balanceDue > 0 && !isWaived && (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs">
              <p className="text-fg" id="invoice-part-payment-text">
                {invoice.partPayment.text}
              </p>
              {canManage && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(invoice.payInFull)}
                    aria-describedby="invoice-part-payment-text"
                    disabled={payInFullBusy}
                    onClick={() => void togglePayInFull()}
                    className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {invoice.payInFull ? "Allow part payments again" : "Pay in full only"}
                  </button>
                  {payInFullError && (
                    <span role="alert" className="text-red-500">
                      {payInFullError}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Line Items */}
          <div>
            <h4 className="text-xs font-semibold text-fg uppercase tracking-wider mb-2">Itemized Breakdown</h4>
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-fg-muted border-b border-line">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(invoice.lineItems || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-2/30">
                      <td className="px-3 py-2 text-fg">{item.name}</td>
                      <td className="px-3 py-2 text-right font-medium text-fg">{formatNaira(item.amount)}</td>
                    </tr>
                  ))}
                  {invoice.discounts.map((d) => (
                    <tr key={d.id} className="bg-emerald-500/5 text-ok-fg font-medium">
                      <td className="px-3 py-2">Discount: {d.reason}</td>
                      <td className="px-3 py-2 text-right">-{formatNaira(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments Ledger */}
          <div>
            <h4 className="text-xs font-semibold text-fg uppercase tracking-wider mb-2">Payment Receipts</h4>
            {invoice.payments.length === 0 ? (
              <div className="rounded-xl border border-line p-3 text-center text-xs text-fg-muted">
                No payments have been recorded for this invoice yet.
              </div>
            ) : (
              <div className="space-y-2">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-fg">{p.receiptNo || "No Receipt #"}</span>
                        <span className="rounded-md bg-field px-1.5 py-0.5 text-[10px] text-fg-muted uppercase">
                          {p.channel || p.provider}
                        </span>
                      </div>
                      <span className="text-[11px] text-fg-muted mt-0.5 block">
                        Ref: {p.providerRef} • {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "Pending"}
                      </span>
                    </div>
                    <span className="font-bold text-ok-fg text-sm">{formatNaira(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              🖨️ Print Receipt / Invoice
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Close
              </button>
              {canManage && balanceDue > 0 && !isWaived && (
                <>
                  <button
                    type="button"
                    onClick={() => setDiscountModalOpen(true)}
                    className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Waiver / Discount
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayModalOpen(true)}
                    className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Record Payment
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Record Payment Sub-modal */}
      <RecordPaymentModal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        onSaved={onRefresh}
        branchId={invoice.branchId}
        invoiceId={invoice.id}
        invoiceNo={invoice.invoiceNo}
        totalAmount={total}
        amountPaid={paid}
        partText={invoice.partPayment?.text}
      />

      {/* Discount Sub-modal */}
      <DiscountModal
        isOpen={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        onSaved={onRefresh}
        branchId={invoice.branchId}
        invoiceId={invoice.id}
        invoiceNo={invoice.invoiceNo}
        totalAmount={total}
      />
    </>
  );
}
