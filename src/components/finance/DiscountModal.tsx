"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { formatNaira, DiscountWorkflowMode } from "@/lib/finance/format";

export interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  branchId: string;
  invoiceId: string;
  invoiceNo: string;
  totalAmount: number;
}

export function DiscountModal({
  isOpen,
  onClose,
  onSaved,
  branchId,
  invoiceId,
  invoiceNo,
  totalAmount,
}: DiscountModalProps) {
  const formId = useId();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<DiscountWorkflowMode>(DiscountWorkflowMode.MANUAL_OVERRIDE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Discount amount must be greater than zero");
      return;
    }
    if (numAmount >= totalAmount) {
      setError(`Discount cannot exceed total invoice value of ${formatNaira(totalAmount)}`);
      return;
    }
    if (!reason.trim()) {
      setError("Please provide an audit reason for the waiver/discount");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/finance/invoices/${invoiceId}/discount?branchId=${branchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numAmount,
          reason: reason.trim(),
          mode,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to apply discount");
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
    <Dialog open={isOpen} onClose={onClose} title={`Apply Fee Waiver / Discount — ${invoiceNo}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500" role="alert">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-surface-2 p-3 text-xs flex justify-between items-center">
          <span className="text-fg-muted">Current Invoice Amount:</span>
          <span className="font-bold text-fg text-sm">{formatNaira(totalAmount)}</span>
        </div>

        <div>
          <label htmlFor={`${formId}-amount`} className="block text-xs font-medium text-fg-muted mb-1">
            Discount Amount (₦)
          </label>
          <input
            id={`${formId}-amount`}
            type="number"
            step="0.01"
            min="0"
            max={totalAmount}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000.00"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-mode`} className="block text-xs font-medium text-fg-muted mb-1">
            Category
          </label>
          <select
            id={`${formId}-mode`}
            value={mode}
            onChange={(e) => setMode(e.target.value as DiscountWorkflowMode)}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          >
            <option value={DiscountWorkflowMode.MANUAL_OVERRIDE}>Administrative Discretion / Hardship</option>
            <option value={DiscountWorkflowMode.SCHOLARSHIP}>Academic Merit Scholarship</option>
            <option value={DiscountWorkflowMode.SIBLING_DISCOUNT}>Sibling Concession</option>
            <option value={DiscountWorkflowMode.STAFF_CHILD}>Staff Child Benefit</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${formId}-reason`} className="block text-xs font-medium text-fg-muted mb-1">
            Approval Reason / Reference Note
          </label>
          <input
            id={`${formId}-reason`}
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Approved by Principal - Merit list 2026"
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
            disabled={saving}
            className="rounded-xl bg-brand-strong px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {saving ? "Applying..." : "Apply Discount"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
