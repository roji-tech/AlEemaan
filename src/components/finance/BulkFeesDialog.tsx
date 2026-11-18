"use client";

import { useMemo } from "react";
import { BulkImportDialog } from "@/components/bulk/BulkImportDialog";
import { feeEntityFor, feeTotals } from "@/lib/bulk/fees";
import { formatNaira } from "@/lib/finance/format";
import type { RowVerdict, SourceRow } from "@/lib/bulk/types";

/// Add many fee lines at once (task 0084): one row is one fee item for one period and one class (or every class). The review adds up what the file holds per period and class, so a
/// misplaced decimal point shows before anything is saved.
export function BulkFeesDialog({
  open,
  onClose,
  branchId,
  branchName,
  periods,
  classGroups,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  branchId: string;
  branchName?: string;
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  onSaved: (count: number) => void | Promise<void>;
}) {
  const entity = useMemo(
    () =>
      feeEntityFor(
        periods.map((p) => p.label),
        classGroups.map((c) => c.name),
      ),
    [periods, classGroups],
  );
  const totals = (rows: SourceRow[], verdicts: RowVerdict[]) => {
    const bad = new Set(verdicts.filter((v) => v.status === "error").map((v) => v.line));
    const list = feeTotals(rows.filter((r) => !bad.has(r.line)));
    if (list.length === 0) return null;
    return (
      <section aria-label="What these rows add up to" className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
        <h3 className="font-semibold text-fg">What the rows without problems add up to</h3>
        <ul className="mt-1 space-y-0.5 text-fg-2">
          {list.map((t) => (
            <li key={`${t.period}|${t.classGroup}`}>
              {t.period} · {t.classGroup}: <span className="font-semibold text-fg">{formatNaira(t.kobo / 100)}</span> ({t.lines}{" "}
              {t.lines === 1 ? "line" : "lines"})
            </li>
          ))}
        </ul>
      </section>
    );
  };
  return (
    <BulkImportDialog
      branchName={branchName}
      open={open}
      onClose={onClose}
      entity={entity}
      title="Add fee items in bulk"
      description="One row is one fee item for one period and one class (or every class). Nothing is saved until you press Save. Invoices already issued are not changed: an invoice keeps the lines it was made with."
      endpoint="/api/v1/finance/fee-structures/import"
      context={{ branchId }}
      reviewExtra={totals}
      noun={{ one: "fee item", many: "fee items" }}
      onSaved={onSaved}
    />
  );
}
