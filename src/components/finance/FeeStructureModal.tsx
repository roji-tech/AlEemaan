"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface FeeStructureItem {
  id: string;
  name: string;
  amount: number | string;
  periodId: string;
  classGroupId: string | null;
  period?: { id: string; label: string };
  classGroup?: { id: string; name: string } | null;
}

export interface FeeStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  branchId: string;
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  initialItem?: FeeStructureItem | null;
}

export function FeeStructureModal({ isOpen, onClose, onSaved, branchId, periods, classGroups, initialItem }: FeeStructureModalProps) {
  const formId = useId();
  const [name, setName] = useState(initialItem?.name ?? "");
  const [amount, setAmount] = useState(initialItem ? String(initialItem.amount) : "");
  const [periodId, setPeriodId] = useState(initialItem?.periodId ?? (periods[0]?.id || ""));
  const [classGroupId, setClassGroupId] = useState(initialItem?.classGroupId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Fee item name is required");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Amount must be greater than zero");
      return;
    }
    if (!periodId) {
      setError("Academic period is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = initialItem ? `/api/v1/finance/fee-structures/${initialItem.id}?branchId=${branchId}` : "/api/v1/finance/fee-structures";
      const method = initialItem ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          periodId,
          classGroupId: classGroupId || null,
          name: name.trim(),
          amount: numAmount,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to save fee structure");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} title={initialItem ? "Edit Fee Structure Item" : "Create New Fee Structure Item"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500" role="alert">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-fg-muted mb-1">
            Fee Item Name
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tuition, Development Levy, Exam Fee"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-strong"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-amount`} className="block text-xs font-medium text-fg-muted mb-1">
            Amount (₦ Naira)
          </label>
          <input
            id={`${formId}-amount`}
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000.00"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-strong"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-period`} className="block text-xs font-medium text-fg-muted mb-1">
              Academic Term / Period
            </label>
            <select
              id={`${formId}-period`}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-classGroup`} className="block text-xs font-medium text-fg-muted mb-1">
              Class Group Scope
            </label>
            <select
              id={`${formId}-classGroup`}
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
            >
              <option value="">All Classes (Universal)</option>
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {saving ? "Saving..." : initialItem ? "Update Item" : "Create Item"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
