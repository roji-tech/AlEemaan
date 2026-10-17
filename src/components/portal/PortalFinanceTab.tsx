"use client";

import React, { useState } from "react";
import type { PortalStudentRecord } from "./PortalLoginCard";

interface Invoice {
  id: string;
  invoiceNo: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  period: {
    label: string;
    session: { label: string };
  };
  payments: Array<{
    id: string;
    reference: string;
    receiptNo: string | null;
    amount: number;
    provider: string;
    status: string;
    createdAt: string;
  }>;
}

interface PortalFinanceTabProps {
  invoices: Invoice[];
  student: PortalStudentRecord;
}

export function PortalFinanceTab({ invoices, student }: PortalFinanceTabProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const totalInvoiced = invoices.reduce((acc, inv) => acc + Number(inv.totalAmount), 0);
  const totalPaid = invoices.reduce((acc, inv) => acc + Number(inv.amountPaid), 0);
  const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);

  const allPayments = invoices.flatMap((inv) =>
    inv.payments.map((p) => ({ ...p, invoiceNo: inv.invoiceNo, periodLabel: inv.period.label })),
  );
  allPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      {/* Financial Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block mb-1">Total Invoiced</span>
          <div className="text-2xl font-black text-fg">₦{totalInvoiced.toLocaleString()}</div>
          <span className="text-xs text-fg-muted mt-1 block">Across {invoices.length} billing terms</span>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block mb-1">Total Paid</span>
          <div className="text-2xl font-black text-ok-fg">₦{totalPaid.toLocaleString()}</div>
          <span className="text-xs text-fg-muted mt-1 block">Confirmed school receipts</span>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider block mb-1">Outstanding Balance</span>
          <div className={`text-2xl font-black ${outstandingBalance === 0 ? "text-ok-fg" : "text-danger-text"}`}>
            ₦{outstandingBalance.toLocaleString()}
          </div>
          <span className="text-xs text-fg-muted mt-1 block">
            {outstandingBalance === 0 ? "Account fully settled" : "Payment required"}
          </span>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Fee Invoices</span>
          <span className="text-xs font-normal text-fg-muted">
            {invoices.length} Invoice{invoices.length === 1 ? "" : "s"}
          </span>
        </h3>

        {invoices.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">No fee invoices generated for this student yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-line text-fg-muted font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Period / Session</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((inv) => {
                  const balance = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
                  return (
                    <tr key={inv.id} className="hover:bg-surface-2/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-fg">{inv.invoiceNo}</td>
                      <td className="py-3 px-4 text-fg-2">
                        {inv.period.session.label} · {inv.period.label}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-fg">₦{Number(inv.totalAmount).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-semibold text-ok-fg">₦{Number(inv.amountPaid).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-ok-bg text-ok-fg"
                              : inv.status === "PARTIALLY_PAID"
                                ? "bg-warn-bg text-warn-fg"
                                : "bg-danger-bg text-danger-text"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-line text-fg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {balance > 0 ? "Pay / View" : "Receipt"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Receipts History */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4">Payment Receipts History</h3>

        {allPayments.length === 0 ? (
          <p className="text-xs text-fg-muted py-4 text-center">No payment transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-line text-fg-muted font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {allPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-fg">{p.receiptNo || "PENDING"}</td>
                    <td className="py-3 px-4 font-mono text-fg-muted">{p.invoiceNo}</td>
                    <td className="py-3 px-4 text-fg-2">
                      {new Date(p.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 uppercase text-fg-muted">{p.provider}</td>
                    <td className="py-3 px-4 text-right font-black text-ok-fg">₦{Number(p.amount).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-ok-bg text-ok-fg">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Details / Payment Modal */}
      {selectedInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modalTitle"
          className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 shadow-card-v text-fg">
            <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
              <div>
                <h4 id="modalTitle" className="text-base font-bold text-fg">
                  Invoice {selectedInvoice.invoiceNo}
                </h4>
                <p className="text-xs text-fg-muted mt-0.5">
                  {selectedInvoice.period.session.label} · {selectedInvoice.period.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="text-fg-muted hover:text-fg p-1.5 rounded-lg transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs mb-6">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-fg-muted">Student:</span>
                <span className="font-semibold text-fg">
                  {student.firstName} {student.lastName} ({student.admissionNo})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-fg-muted">Total Invoiced:</span>
                <span className="font-semibold text-fg">₦{Number(selectedInvoice.totalAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-fg-muted">Amount Paid:</span>
                <span className="font-semibold text-ok-fg">₦{Number(selectedInvoice.amountPaid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-fg-muted font-bold">Balance Remaining:</span>
                <span className="font-black text-sm text-brand-fg">
                  ₦{Math.max(0, Number(selectedInvoice.totalAmount) - Number(selectedInvoice.amountPaid)).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-2 border border-line text-xs text-fg-muted mb-4">
              <p className="font-semibold text-fg mb-1">Payment Instructions:</p>
              <p>
                To pay via bank transfer or cash at the bursary, kindly quote student admission number{" "}
                <strong>{student.admissionNo}</strong> and invoice <strong>{selectedInvoice.invoiceNo}</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="w-full py-2.5 rounded-xl bg-brand-strong hover:bg-brand-strong-hover text-brand-contrast text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
