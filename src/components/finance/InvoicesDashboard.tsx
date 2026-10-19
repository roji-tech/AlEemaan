"use client";

import { useState } from "react";
import { formatNaira, InvoiceStatus } from "@/lib/finance/format";
import { BatchInvoiceModal } from "./BatchInvoiceModal";
import { InvoiceDetailModal, type InvoiceDetail } from "./InvoiceDetailModal";

export interface InvoiceItemSummary {
  id: string;
  branchId: string;
  invoiceNo: string;
  totalAmount: number | string;
  amountPaid: number | string;
  status: InvoiceStatus;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNo: string;
  };
  period: {
    id: string;
    label: string;
  };
}

export interface InvoicesDashboardProps {
  branchId: string;
  invoices: InvoiceItemSummary[];
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  canManage?: boolean;
  onRefresh: () => void;
}

export function InvoicesDashboard({ branchId, invoices, periods, classGroups, canManage = true, onRefresh }: InvoicesDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [periodFilter, setPeriodFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Compute KPIs
  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalCollected = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
  const totalOutstanding = Math.max(0, totalBilled - totalCollected);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
    if (periodFilter !== "ALL" && inv.period.id !== periodFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = `${inv.student.firstName} ${inv.student.lastName}`.toLowerCase();
      const adm = inv.student.admissionNo.toLowerCase();
      const invNo = inv.invoiceNo.toLowerCase();
      if (!name.includes(q) && !adm.includes(q) && !invNo.includes(q)) return false;
    }
    return true;
  });

  async function handleViewInvoice(id: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/finance/invoices/${id}?branchId=${branchId}`);
      if (!res.ok) throw new Error("Failed to load invoice details");
      const json = await res.json();
      setSelectedInvoice(json.data);
      setDetailModalOpen(true);
    } catch (err) {
      console.error(err);
      alert("Unable to open invoice details");
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Total Invoiced</p>
          <p className="text-xl font-bold text-fg mt-1">{formatNaira(totalBilled)}</p>
          <span className="text-[11px] text-fg-muted mt-0.5 block">{invoices.length} invoices generated</span>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Total Collected</p>
          <p className="text-xl font-bold text-ok-fg mt-1">{formatNaira(totalCollected)}</p>
          <span className="text-[11px] text-ok-fg mt-0.5 block">{collectionRate}% collection rate</span>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Outstanding Balance</p>
          <p className="text-xl font-bold text-warn-fg mt-1">{formatNaira(totalOutstanding)}</p>
          <span className="text-[11px] text-warn-fg mt-0.5 block">Pending payment</span>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Collection Rate</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-bold text-fg">{collectionRate}%</span>
            <div className="flex-1 bg-surface-2 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-strong h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, collectionRate)}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-fg-muted mt-0.5 block">Naira settlement</span>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status pills */}
          <div className="flex rounded-xl border border-line bg-surface p-1 text-xs">
            {["ALL", InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === st ? "bg-brand-strong text-white" : "text-fg-muted hover:text-fg"
                }`}
              >
                {st === "ALL" ? "All Statuses" : st.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Period selector */}
          <select
            aria-label="Filter by academic term"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          >
            <option value="ALL">All Terms</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Search box */}
          <input
            type="text"
            aria-label="Search student or invoice number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or inv #..."
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-strong w-48 sm:w-60"
          />

          {canManage && (
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span>+</span> Batch Generate Invoices
            </button>
          )}
        </div>
      </div>

      {/* Invoices Roll Table */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-fg-muted">No invoices found matching the current filter criteria.</div>
        ) : (
          <div className="divide-y divide-line overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-fg-muted font-medium border-b border-line">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Adm No</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3 text-right">Total Billed</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-2/40 transition">
                    <td className="px-4 py-3 font-mono font-medium text-fg">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 font-semibold text-fg">
                      {inv.student.firstName} {inv.student.lastName}
                    </td>
                    <td className="px-4 py-3 font-mono text-fg-muted">{inv.student.admissionNo}</td>
                    <td className="px-4 py-3 text-fg-muted">{inv.period.label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-fg">{formatNaira(inv.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-ok-fg font-medium">{formatNaira(inv.amountPaid)}</td>
                    <td className="px-4 py-3 text-center">
                      {inv.status === InvoiceStatus.PAID && (
                        <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-ok-fg">
                          PAID
                        </span>
                      )}
                      {inv.status === InvoiceStatus.PARTIALLY_PAID && (
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-warn-fg">
                          PARTIAL
                        </span>
                      )}
                      {inv.status === InvoiceStatus.UNPAID && (
                        <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-400">
                          UNPAID
                        </span>
                      )}
                      {inv.status === InvoiceStatus.WAIVED && (
                        <span className="rounded-full bg-surface-2 border border-line px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                          WAIVED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={loadingDetail}
                        onClick={() => handleViewInvoice(inv.id)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium border border-line hover:bg-surface-2 text-fg focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        View & Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BatchInvoiceModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onGenerated={onRefresh}
        branchId={branchId}
        periods={periods}
        classGroups={classGroups}
      />

      <InvoiceDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        invoice={selectedInvoice}
        canManage={canManage}
        onRefresh={() => {
          onRefresh();
          if (selectedInvoice) handleViewInvoice(selectedInvoice.id);
        }}
      />
    </div>
  );
}
