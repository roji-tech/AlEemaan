"use client";

import { BranchPicker } from "@/components/ui/BranchPicker";
import { useState, useEffect, useCallback } from "react";
import { InvoicesDashboard, type InvoiceItemSummary } from "./InvoicesDashboard";
import { FeeStructuresPanel } from "./FeeStructuresPanel";
import { type FeeStructureItem } from "./FeeStructureModal";
import { PaymentRulesPanel } from "./PaymentRulesPanel";
import { FinanceOverview } from "./FinanceOverview";
import { ScholarshipsPanel } from "./ScholarshipsPanel";
import { useTabParam } from "@/components/ui/useTabParam";
import { FINANCE_TAB_IDS } from "@/lib/finance/tabs";

export interface FinancePanelProps {
  branches: { id: string; name: string }[];
  isSuperAdmin?: boolean;
  canManage?: boolean;
  userBranchId?: string | null;
  /// The invoice search a link opens with (the top-bar search, task 0113).
  initialQuery?: string;
}

export function FinancePanel({ branches, isSuperAdmin = false, canManage = true, userBranchId, initialQuery }: FinancePanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || branches[0]?.id || "");
  // The open tab is in the address (`?tab=`, task 0100). Overview is the first tab and opens by default (task 0106); the old tab names are kept as they were in the page's own state.
  const [openTab, chooseTab] = useTabParam(FINANCE_TAB_IDS, "overview");
  const activeTab = openTab === "fees" ? "fee_structures" : openTab === "rules" ? "payment_rules" : openTab;
  const setActiveTab = (tab: "overview" | "invoices" | "fee_structures" | "payment_rules" | "scholarships") =>
    chooseTab(tab === "fee_structures" ? "fees" : tab === "payment_rules" ? "rules" : tab);

  const [invoices, setInvoices] = useState<InvoiceItemSummary[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; label: string; current?: boolean }[]>([]);
  const [classGroups, setClassGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `quiet` is the refresh a tab asks for AFTER a save (task 0059): the screen stays as it is and the new data replaces the old when it arrives. While `loading` is true the content below is
  // replaced by "Loading finance records...", which unmounts the dashboard and every dialog open in it; that closed the invoice after every payment and destroyed the batch dialog's result
  // (how many invoices were made, how many skipped) before anyone could read it. The first load and a change of branch are not quiet: there is nothing to keep.
  const loadData = useCallback(async (branchId: string, quiet = false) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
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
        const extractedPeriods: { id: string; label: string; current?: boolean }[] = [];
        for (const s of sessionList) {
          if (s.periods) {
            for (const p of s.periods) {
              extractedPeriods.push({ id: p.id, label: `${p.label} (${s.label})`, current: Boolean(p.isCurrent) });
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

  // A person who may not change branch (not a superadmin, tied to one) sees their branch's name only.
  const pickable = isSuperAdmin || !userBranchId ? branches : branches.filter((b) => b.id === selectedBranchId);

  return (
    <div className="space-y-6">
      {/* Branch selector for multi-branch environments */}
      {branches.length > 1 && <BranchPicker branches={pickable} value={selectedBranchId} onChange={setSelectedBranchId} />}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Finance navigation"
        className="flex gap-4 overflow-x-auto border-b border-line text-xs font-semibold whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          className={`pb-3 px-1 border-b-2 transition ${
            activeTab === "overview" ? "border-brand-strong text-fg font-bold" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          Overview
        </button>
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
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scholarships"}
          onClick={() => setActiveTab("scholarships")}
          className={`pb-3 px-1 border-b-2 transition ${
            activeTab === "scholarships" ? "border-brand-strong text-fg font-bold" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          Scholarships
        </button>
        {canManage && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "payment_rules"}
            onClick={() => setActiveTab("payment_rules")}
            className={`pb-3 px-1 border-b-2 transition ${
              activeTab === "payment_rules" ? "border-brand-strong text-fg font-bold" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            Payment Rules
          </button>
        )}
      </div>

      {activeTab === "payment_rules" ? (
        <PaymentRulesPanel />
      ) : activeTab === "scholarships" ? (
        <ScholarshipsPanel key={selectedBranchId} branchId={selectedBranchId} />
      ) : loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface">
          <p className="text-xs font-medium text-fg-muted animate-pulse">Loading finance records...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-danger-line bg-danger-bg p-6 text-center text-xs text-danger-fg">
          <p className="font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => loadData(selectedBranchId)}
            className="mt-3 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover"
          >
            Retry
          </button>
        </div>
      ) : activeTab === "overview" ? (
        <FinanceOverview branchId={selectedBranchId} periods={periods} canSeeAll={branches.length > 1} />
      ) : activeTab === "invoices" ? (
        <InvoicesDashboard
          branchId={selectedBranchId}
          invoices={invoices}
          periods={periods}
          classGroups={classGroups}
          canManage={canManage}
          initialQuery={initialQuery}
          onRefresh={() => loadData(selectedBranchId, true)}
        />
      ) : (
        <FeeStructuresPanel
          branchId={selectedBranchId}
          items={feeStructures}
          periods={periods}
          classGroups={classGroups}
          canManage={canManage}
          onRefresh={() => loadData(selectedBranchId, true)}
        />
      )}
    </div>
  );
}
