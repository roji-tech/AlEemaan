"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/finance/format";
import { FeeStructureModal, type FeeStructureItem } from "./FeeStructureModal";

export interface FeeStructuresPanelProps {
  branchId: string;
  items: FeeStructureItem[];
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  canManage?: boolean;
  onRefresh: () => void;
}

export function FeeStructuresPanel({ branchId, items, periods, classGroups, canManage = true, onRefresh }: FeeStructuresPanelProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeeStructureItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredItems = selectedPeriodId === "ALL" ? items : items.filter((item) => item.periodId === selectedPeriodId);

  const totalFeeAmount = filteredItems.reduce((acc, item) => acc + Number(item.amount), 0);

  function handleCreate() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function handleEdit(item: FeeStructureItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this fee item?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/finance/fee-structures/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete fee structure");
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete fee item");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="period-filter" className="text-xs font-medium text-fg-muted">
            Term:
          </label>
          <select
            id="period-filter"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          >
            <option value="ALL">All Terms / Periods</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>+</span> Add Fee Item
          </button>
        )}
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-fg-muted">Total Scheduled Fees</p>
          <p className="text-xl font-bold text-fg mt-0.5">{formatNaira(totalFeeAmount)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
          {filteredItems.length} fee items configured
        </div>
      </div>

      {/* Fee Items List */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-fg-muted">No fee schedule items configured for this selection.</div>
        ) : (
          <div className="divide-y divide-line overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-fg-muted font-medium border-b border-line">
                <tr>
                  <th className="px-4 py-3">Fee Item</th>
                  <th className="px-4 py-3">Period / Term</th>
                  <th className="px-4 py-3">Target Scope</th>
                  <th className="px-4 py-3 text-right">Amount (₦)</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-2/40 transition">
                    <td className="px-4 py-3 font-semibold text-fg">{item.name}</td>
                    <td className="px-4 py-3 text-fg-muted">{item.period?.label ?? "General"}</td>
                    <td className="px-4 py-3">
                      {item.classGroup ? (
                        <span className="rounded-md bg-field border border-line px-2 py-0.5 text-[11px] font-medium text-fg">
                          {item.classGroup.name}
                        </span>
                      ) : (
                        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                          Universal / All Classes
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-fg">{formatNaira(item.amount)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium border border-line hover:bg-surface-2 text-fg focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => handleDelete(item.id)}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 border border-red-500/20 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {deletingId === item.id ? "..." : "Delete"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FeeStructureModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onRefresh}
        branchId={branchId}
        periods={periods}
        classGroups={classGroups}
        initialItem={editingItem}
      />
    </div>
  );
}
