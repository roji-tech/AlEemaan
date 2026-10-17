"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { formatNaira } from "@/lib/finance/format";

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  branchId: string;
  invoiceId: string;
  invoiceNo: string;
  totalAmount: number;
  amountPaid: number;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSaved,
  branchId,
  invoiceId,
  invoiceNo,
  totalAmount,
  amountPaid,
}: RecordPaymentModalProps) {
  const formId = useId();
  const balanceDue = Math.max(0, totalAmount - amountPaid);
  const [amount, setAmount] = useState(String(balanceDue));
  const [channel, setChannel] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Payment amount must be greater than zero");
      return;
    }
    if (numAmount > balanceDue) {
      setError(`Payment cannot exceed outstanding balance of ${formatNaira(balanceDue)}`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/finance/invoices/${invoiceId}/record-payment?branchId=${branchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numAmount,
          channel,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to record payment");
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
    <Dialog open={isOpen} onClose={onClose} title={`Record Offline Payment — ${invoiceNo}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500" role="alert">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-surface-2 p-3 text-xs flex justify-between items-center">
          <span className="text-fg-muted">Balance Due:</span>
          <span className="font-bold text-fg text-sm">{formatNaira(balanceDue)}</span>
        </div>

        <div>
          <label htmlFor={`${formId}-amount`} className="block text-xs font-medium text-fg-muted mb-1">
            Payment Amount (₦)
          </label>
          <input
            id={`${formId}-amount`}
            type="number"
            step="0.01"
            min="0"
            max={balanceDue}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-channel`} className="block text-xs font-medium text-fg-muted mb-1">
              Payment Method
            </label>
            <select
              id={`${formId}-channel`}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
            >
              <option value="cash">Cash at Office</option>
              <option value="pos">Point of Sale (POS)</option>
              <option value="bank_transfer">Direct Bank Transfer</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-ref`} className="block text-xs font-medium text-fg-muted mb-1">
              Receipt / Teller Ref (Optional)
            </label>
            <input
              id={`${formId}-ref`}
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. POS-83921"
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-strong"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${formId}-notes`} className="block text-xs font-medium text-fg-muted mb-1">
            Notes / Depositor Name (Optional)
          </label>
          <input
            id={`${formId}-notes`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Deposited by Alhaji Bello"
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
            {saving ? "Recording..." : "Record Payment & Issue Receipt"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
