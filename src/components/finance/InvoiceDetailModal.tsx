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
  onRefresh: () => void;
}

export function InvoiceDetailModal({ isOpen, onClose, invoice, canManage = true, onRefresh }: InvoiceDetailModalProps) {
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  if (!isOpen || !invoice) return null;

  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.amountPaid);
  const balanceDue = Math.max(0, total - paid);
  const isPaid = invoice.status === InvoiceStatus.PAID;
  const isWaived = invoice.status === InvoiceStatus.WAIVED;
  const isPartial = invoice.status === InvoiceStatus.PARTIALLY_PAID;

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
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                  ✓ PAID IN FULL
                </span>
              )}
              {isPartial && (
                <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-400">
                  PARTIALLY PAID
                </span>
              )}
              {!isPaid && !isPartial && !isWaived && (
                <span className="rounded-full bg-red-500/20 border border-red-500/30 px-3 py-1 text-xs font-bold text-red-400">UNPAID</span>
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
              <span className="text-base font-bold text-emerald-400 mt-1 block">{formatNaira(paid)}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="text-[11px] text-fg-muted block">Balance Due</span>
              <span className="text-base font-bold text-amber-400 mt-1 block">{formatNaira(balanceDue)}</span>
            </div>
          </div>

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
                    <tr key={d.id} className="bg-emerald-500/5 text-emerald-400 font-medium">
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
                    <span className="font-bold text-emerald-400 text-sm">{formatNaira(p.amount)}</span>
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
