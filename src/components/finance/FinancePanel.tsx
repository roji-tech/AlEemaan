"use client";

import { useState, useEffect, useCallback } from "react";
import { InvoicesDashboard, type InvoiceItemSummary } from "./InvoicesDashboard";
import { FeeStructuresPanel } from "./FeeStructuresPanel";
import { type FeeStructureItem } from "./FeeStructureModal";

export interface FinancePanelProps {
  branches: { id: string; name: string }[];
  isSuperAdmin?: boolean;
  canManage?: boolean;
  userBranchId?: string | null;
}

export function FinancePanel({ branches, isSuperAdmin = false, canManage = true, userBranchId }: FinancePanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || branches[0]?.id || "");
  const [activeTab, setActiveTab] = useState<"invoices" | "fee_structures">("invoices");

  const [invoices, setInvoices] = useState<InvoiceItemSummary[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; label: string }[]>([]);
  const [classGroups, setClassGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (branchId: string) => {
    if (!branchId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch periods, class groups, invoices, fee structures in parallel
      const [invRes, feeRes, classRes, sessRes] = await Promise.all([
        fetch(`/api/v1/finance/invoices?branchId=${branchId}`),
        fetch(`/api/v1/finance/fee-structures?branchId=${branchId}`),
        fetch(`/api/v1/academics/class-groups?branchId=${branchId}`),
        fetch(`/api/v1/academics/sessions?branchId=${branchId}`),
      ]);

      if (invRes.ok) {
        const d = await invRes.json();
        setInvoices(d.data?.invoices || []);
      }
      if (feeRes.ok) {
        const d = await feeRes.json();
        setFeeStructures(d.data || []);
      }
      if (classRes.ok) {
        const d = await classRes.json();
        setClassGroups(d.data?.classGroups || d.data || []);
      }
      if (sessRes.ok) {
        const d = await sessRes.json();
        const sessionList = d.data?.sessions || d.data || [];
        // Flatten all periods across sessions
        const extractedPeriods: { id: string; label: string }[] = [];
        for (const s of sessionList) {
          if (s.periods) {
            for (const p of s.periods) {
              extractedPeriods.push({ id: p.id, label: `${p.label} (${s.label})` });
            }
          }
        }
        setPeriods(extractedPeriods);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load finance data when active branch changes
      void loadData(selectedBranchId);
    }
  }, [selectedBranchId, loadData]);

  return (
    <div className="space-y-6">
      {/* Branch selector for multi-branch environments */}
      {branches.length > 1 && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <label htmlFor="finance-branch" className="text-xs font-semibold text-fg">
            Branch:
          </label>
          <select
            id="finance-branch"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            disabled={!isSuperAdmin && !!userBranchId}
            className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Finance navigation" className="flex border-b border-line gap-4 text-xs font-semibold">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "invoices"}
          onClick={() => setActiveTab("invoices")}
          className={`pb-3 px-1 border-b-2 transition ${
            activeTab === "invoices" ? "border-brand-strong text-fg font-bold" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          Student Invoices & Payments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "fee_structures"}
          onClick={() => setActiveTab("fee_structures")}
          className={`pb-3 px-1 border-b-2 transition ${
            activeTab === "fee_structures" ? "border-brand-strong text-fg font-bold" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          Fee Schedules & Structures
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface">
          <p className="text-xs font-medium text-fg-muted animate-pulse">Loading finance records...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-xs text-red-500">
          <p className="font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => loadData(selectedBranchId)}
            className="mt-3 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover"
          >
            Retry
          </button>
        </div>
      ) : activeTab === "invoices" ? (
        <InvoicesDashboard
          branchId={selectedBranchId}
          invoices={invoices}
          periods={periods}
          classGroups={classGroups}
          canManage={canManage}
          onRefresh={() => loadData(selectedBranchId)}
        />
      ) : (
        <FeeStructuresPanel
          branchId={selectedBranchId}
          items={feeStructures}
          periods={periods}
          classGroups={classGroups}
          canManage={canManage}
          onRefresh={() => loadData(selectedBranchId)}
        />
      )}
    </div>
  );
}
