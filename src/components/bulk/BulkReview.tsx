"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import type { BulkEntityShape, RowVerdict, SourceRow } from "@/lib/bulk/types";
import { useCollectionView } from "@/components/ui/useCollectionView";
import { ViewToggle } from "@/components/ui/ViewToggle";

// What was read, row by row, before anything is saved (task 0084): every row of the file with its row number, what is in each cell, and what is wrong with it, in the words the
// rules use. A long file is shown 50 rows at a time, and by default only the rows with problems once there are some.
//
// Two views, chosen with the app's List / Grid toggle and remembered (the maintainer, 2026-11-18, on a phone where each row was a screen-high stack of fields): the LIST is one table in a
// scroll area of its own (a sticky header and a sticky Row column, so 144 rows are scanned, not scrolled past), and the GRID is a compact card per row with only the cells that have a value.

const PAGE = 50;
const HEAD =
  "sticky top-0 whitespace-nowrap border-b border-line bg-surface-2 px-2 py-2 text-left text-xs font-semibold tracking-wide text-fg-2 uppercase";
const CELL = "border-b border-line px-2 py-2 align-top";
const plural = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

export function BulkReview({ entity, rows, verdicts }: { entity: BulkEntityShape; rows: SourceRow[]; verdicts: RowVerdict[] }) {
  const byLine = new Map(verdicts.map((v) => [v.line, v]));
  const bad = verdicts.filter((v) => v.status === "error").length;
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [page, setPage] = useState(0);
  const { view, setView } = useCollectionView("bulk-review", { defaultView: "list" });
  const filtered = onlyProblems && bad > 0 ? rows.filter((r) => byLine.get(r.line)?.status === "error") : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = filtered.slice(at * PAGE, at * PAGE + PAGE);
  const label = new Map(entity.columns.map((c) => [c.key, c.label]));
  // The same problem is often on every row (a branch with no academic session refuses all 144 pupils): say it once, with how many rows it is on, above the table.
  const kinds = new Map<string, number>();
  for (const v of verdicts) {
    for (const p of v.problems) {
      const text = p.column && label.get(p.column) ? `${label.get(p.column)}: ${p.message}` : p.message;
      kinds.set(text, (kinds.get(text) ?? 0) + 1);
    }
  }
  const nameKeys = entity.fullName ? [entity.fullName.first, entity.fullName.middle, entity.fullName.last] : [entity.columns[0]?.key ?? ""];
  const headline = (row: SourceRow) =>
    nameKeys
      .map((k) => row.values[k] ?? "")
      .filter(Boolean)
      .join(" ") || `Row ${row.line}`;
  // Only a problem on two or more rows is worth saying once above the table; one on a single row is already on that row.
  const repeated = [...kinds.entries()].filter(([, count]) => count > 1);
  const topKinds = repeated.sort((a, b) => b[1] - a[1]).slice(0, 4);

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
      {topKinds.length > 0 && (
        <section aria-label="What needs fixing" className="rounded-xl border border-danger-icon/40 bg-danger-bg p-3 text-sm">
          <p className="font-semibold text-danger-fg">What needs fixing</p>
          <ul className="mt-1.5 space-y-1.5 text-fg-2">
            {topKinds.map(([text, count]) => (
              <li key={text}>
                <span className="font-semibold text-fg">{plural(count)}:</span> {text}
                {/active academic session/i.test(text) && (
                  <>
                    {" "}
                    <a
                      href="/academics?tab=sessions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Set up an academic session (opens in a new tab)
                    </a>
                  </>
                )}
              </li>
            ))}
            {repeated.length > topKinds.length && (
              <li className="text-fg-muted">and {repeated.length - topKinds.length} other repeated problems, shown on their rows below.</li>
            )}
          </ul>
        </section>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          {view === "list"
            ? "Scroll the table sideways and down; the headings and the row number stay in view."
            : "One card per row; empty cells are left out."}
        </p>
        <ViewToggle view={view} onChange={setView} label="Show the rows as" />
      </div>
      {view === "list" ? (
        <div
          role="region"
          aria-label="The rows that were read"
          tabIndex={0}
          className="max-h-[65dvh] overflow-auto overscroll-contain rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className={`${HEAD} left-0 z-30 w-14`}>
                  Row
                </th>
                <th scope="col" className={`${HEAD} z-20 min-w-64`}>
                  Result
                </th>
                {entity.columns.map((c) => (
                  <th key={c.key} scope="col" className={`${HEAD} z-20`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const verdict = byLine.get(row.line);
                const isBad = verdict?.status === "error";
                return (
                  <tr key={row.line}>
                    <td className={`${CELL} sticky left-0 z-10 w-14 bg-surface font-semibold text-fg`}>{row.line}</td>
                    <td className={`${CELL} min-w-64`}>
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
                        <td key={c.key} className={`${CELL} whitespace-nowrap text-fg`}>
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
      ) : (
        <ul
          aria-label="The rows that were read"
          className="grid max-h-[65dvh] grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 overflow-auto overscroll-contain"
        >
          {shown.map((row) => {
            const verdict = byLine.get(row.line);
            const isBad = verdict?.status === "error";
            const filled = entity.columns.filter((c) => (row.values[c.key] ?? "") !== "" && !nameKeys.includes(c.key));
            return (
              <li key={row.line} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-fg-muted">Row {row.line}</p>
                  <p className={`text-xs font-semibold ${isBad ? "text-danger-fg" : "text-ok-fg"}`}>{isBad ? "Has problems" : "Ready"}</p>
                </div>
                <p className="mt-1 font-semibold wrap-break-word text-fg">{headline(row)}</p>
                {filled.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {filled.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-fg-muted">{c.label}</dt>
                        <dd className="wrap-break-word text-fg">{row.values[c.key]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {isBad && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-danger-fg">
                    {verdict.problems.map((p) => (
                      <li key={`${p.column ?? ""}${p.message}`}>
                        {p.column && label.get(p.column) ? `${label.get(p.column)}: ${p.message}` : p.message}
                      </li>
                    ))}
                  </ul>
                )}
                {!isBad && verdict?.note && <p className="mt-2 border-t border-line pt-2 text-xs text-fg-muted">{verdict.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
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
