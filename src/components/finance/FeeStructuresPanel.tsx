"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/finance/format";
import { audienceText } from "@/lib/finance/fee-audience";
import { HandoverListDialog } from "./HandoverListDialog";
import { BulkFeesDialog } from "./BulkFeesDialog";
import { FeeStructureModal, type FeeStructureItem } from "./FeeStructureModal";

export interface FeeStructuresPanelProps {
  branchId: string;
  branchName?: string;
  items: FeeStructureItem[];
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  canManage?: boolean;
  onRefresh: () => void;
}

export function FeeStructuresPanel({
  branchId,
  branchName,
  items,
  periods,
  classGroups,
  canManage = true,
  onRefresh,
}: FeeStructuresPanelProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeeStructureItem | null>(null);
  // How many times the dialog has been opened: the dialog's `key`, so that every opening is a fresh instance (task 0058). Its fields are `useState(initialItem...)`, which read the item only on
  // the first render; the panel keeps the dialog mounted, so without this "Edit" opened with an empty name, the first term and "All Classes", and a second opening showed the first one's leftovers.
  const [openings, setOpenings] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [handoverOf, setHandoverOf] = useState<{ id: string; name: string; periodId: string } | null>(null);

  // A line that recurs (task 0124) belongs to every term, so it is in every term's list.
  const filteredItems =
    selectedPeriodId === "ALL"
      ? items
      : items.filter((item) => item.periodId === selectedPeriodId || (item.recurrence ?? "THIS_TERM") !== "THIS_TERM");

  const totalFeeAmount = filteredItems.reduce((acc, item) => acc + Number(item.amount), 0);

  function handleCreate() {
    setEditingItem(null);
    setOpenings((n) => n + 1);
    setModalOpen(true);
  }

  function handleEdit(item: FeeStructureItem) {
    setEditingItem(item);
    setOpenings((n) => n + 1);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this fee item?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/finance/fee-structures/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(json?.error?.message ?? "Failed to delete fee structure");
      }
      onRefresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete fee item");
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBulk((b) => ({ open: true, key: b.key + 1 }))}
              className="flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Add many
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span>+</span> Add Fee Item
            </button>
          </div>
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
                  <th className="px-4 py-3">Charged to</th>
                  <th className="px-4 py-3 text-right">Amount (₦)</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-2/40 transition">
                    <td className="px-4 py-3 font-semibold text-fg">{item.name}</td>
                    <td className="px-4 py-3 text-fg-muted">
                      {item.recurrence === "EVERY_TERM"
                        ? "Every term"
                        : item.recurrence === "EVERY_SESSION"
                          ? "Once a year"
                          : (item.period?.label ?? "General")}
                    </td>
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
                    <td className="px-4 py-3 text-fg-muted">
                      <span className="block">
                        {audienceText({
                          admission: item.audienceAdmission ?? null,
                          gender: item.audienceGender ?? null,
                          residence: item.audienceResidence ?? null,
                        })}
                      </span>
                      {(item.optional || item.trackHandover || item.scholarshipCovers === false) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.optional && (
                            <span className="rounded-md border border-line bg-field px-1.5 py-0.5 text-[11px] text-fg">Optional</span>
                          )}
                          {item.trackHandover && (
                            <span className="rounded-md border border-line bg-field px-1.5 py-0.5 text-[11px] text-fg">Handed over</span>
                          )}
                          {item.scholarshipCovers === false && (
                            <span className="rounded-md border border-line bg-field px-1.5 py-0.5 text-[11px] text-fg">
                              No scholarship share
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-fg">{formatNaira(item.amount)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right space-x-2">
                        {item.trackHandover && (
                          <button
                            type="button"
                            onClick={() => {
                              // A line that recurs has no term of its own: the list is for the term chosen above, else the first listed.
                              const periodId = item.periodId ?? (selectedPeriodId !== "ALL" ? selectedPeriodId : periods[0]?.id);
                              if (periodId) setHandoverOf({ id: item.id, name: item.name, periodId });
                            }}
                            aria-label={`Handover list for ${item.name}`}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium border border-line hover:bg-surface-2 text-fg focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            Handover
                          </button>
                        )}
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
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger-fg border border-danger-line hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-ring"
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
        key={openings}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onRefresh}
        branchId={branchId}
        periods={periods}
        classGroups={classGroups}
        initialItem={editingItem}
      />
      <HandoverListDialog branchId={branchId} line={handoverOf} onClose={() => setHandoverOf(null)} />
      {canManage && (
        <BulkFeesDialog
          key={`bulk-${bulk.key}`}
          open={bulk.open}
          onClose={() => setBulk((b) => ({ ...b, open: false }))}
          branchId={branchId}
          branchName={branchName}
          periods={periods}
          classGroups={classGroups}
          onSaved={() => onRefresh()}
        />
      )}
    </div>
  );
}
