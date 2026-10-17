"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface BatchInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: () => void;
  branchId: string;
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
}

export function BatchInvoiceModal({ isOpen, onClose, onGenerated, branchId, periods, classGroups }: BatchInvoiceModalProps) {
  const formId = useId();
  const [periodId, setPeriodId] = useState(periods[0]?.id || "");
  const [classGroupId, setClassGroupId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!periodId) {
      setError("Please select an academic term / period");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          periodId,
          classGroupId: classGroupId || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to generate invoices");
      }

      setResult(json.data);
      onGenerated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} title="Batch Generate Student Invoices">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500" role="alert">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-400" role="status">
            Invoicing Complete: <strong>{result.created}</strong> new invoices created, <strong>{result.skipped}</strong> existing invoices
            skipped.
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-period`} className="block text-xs font-medium text-fg-muted mb-1">
            Academic Term / Period
          </label>
          <select
            id={`${formId}-period`}
            required
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
            Target Class Group
          </label>
          <select
            id={`${formId}-classGroup`}
            value={classGroupId}
            onChange={(e) => setClassGroupId(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          >
            <option value="">All Classes in Branch</option>
            {classGroups.map((cg) => (
              <option key={cg.id} value={cg.id}>
                {cg.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${formId}-dueDate`} className="block text-xs font-medium text-fg-muted mb-1">
            Invoice Due Date (Optional)
          </label>
          <input
            id={`${formId}-dueDate`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          />
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
            disabled={loading}
            className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {loading ? "Generating..." : "Generate Invoices"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
