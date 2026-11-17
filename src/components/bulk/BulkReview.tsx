"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import type { BulkEntityShape, RowVerdict, SourceRow } from "@/lib/bulk/types";
import { PHONE_LABEL, REGION, TABLE, TBODY, TD, TH, THEAD, TR } from "./cells";

// What was read, row by row, before anything is saved (task 0084): every row of the file with its row number, what is in each cell, and what is wrong with it, in the words the
// rules use. A long file is shown 50 rows at a time, and by default only the rows with problems once there are some, so a phone never draws a thousand cards.

const PAGE = 50;

export function BulkReview({ entity, rows, verdicts }: { entity: BulkEntityShape; rows: SourceRow[]; verdicts: RowVerdict[] }) {
  const byLine = new Map(verdicts.map((v) => [v.line, v]));
  const bad = verdicts.filter((v) => v.status === "error").length;
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [page, setPage] = useState(0);
  const filtered = onlyProblems && bad > 0 ? rows.filter((r) => byLine.get(r.line)?.status === "error") : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = filtered.slice(at * PAGE, at * PAGE + PAGE);
  const label = new Map(entity.columns.map((c) => [c.key, c.label]));

  return (
    <div className="space-y-3">
      {bad > 0 && rows.length > 0 && (
        <CheckboxField
          label="Show only the rows with problems"
          checked={onlyProblems}
          onChange={(e) => {
            setOnlyProblems(e.target.checked);
            setPage(0);
          }}
        />
      )}
      <div role="region" aria-label="The rows that were read" tabIndex={0} className={REGION}>
        <table className={TABLE}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={TH}>
                Row
              </th>
              <th scope="col" className={TH}>
                Result
              </th>
              {entity.columns.map((c) => (
                <th key={c.key} scope="col" className={TH}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={TBODY}>
            {shown.map((row) => {
              const verdict = byLine.get(row.line);
              const isBad = verdict?.status === "error";
              return (
                <tr key={row.line} className={TR}>
                  <td className={`${TD} font-semibold text-fg md:w-14`}>
                    <span className="md:hidden">Row </span>
                    {row.line}
                  </td>
                  <td className={`${TD} md:w-48`}>
                    {isBad ? (
                      <div>
                        <p className="font-semibold text-danger-fg">Has problems</p>
                        <ul className="mt-1 space-y-0.5 text-xs text-danger-fg">
                          {verdict.problems.map((p) => (
                            <li key={`${p.column ?? ""}${p.message}`}>
                              {p.column && label.get(p.column) ? `${label.get(p.column)}: ${p.message}` : p.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-ok-fg">Ready</p>
                        {verdict?.note && <p className="mt-1 text-xs text-fg-muted">{verdict.note}</p>}
                      </div>
                    )}
                  </td>
                  {entity.columns.map((c) => {
                    const value = row.values[c.key] ?? "";
                    return (
                      <td key={c.key} className={`${TD} text-fg`}>
                        <span aria-hidden="true" className={PHONE_LABEL}>
                          {c.label}
                        </span>
                        {value === "" ? <span className="text-fg-muted">(empty)</span> : value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
          <p>
            Rows {at * PAGE + 1} to {Math.min(filtered.length, at * PAGE + PAGE)} of {filtered.length} shown
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={at === 0} onClick={() => setPage(at - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
