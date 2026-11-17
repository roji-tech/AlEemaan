"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { GRID_MAX_ROWS, type BulkColumn, type BulkEntityShape, type Problem, type RowVerdict, type SourceRow } from "@/lib/bulk/types";
import { BAD_BORDER, CONTROL, OK_BORDER, PHONE_LABEL, REGION, TABLE, TBODY, TD, TH, THEAD, TR } from "./cells";

// The grid (task 0084 D6): a spreadsheet-like table of at most 50 rows, made of real labelled inputs so a keyboard, a screen reader and a phone's keyboard all work. Add and delete rows,
// choose from a dropdown where the values are fixed, paste a block copied from Excel (tabs between cells, new lines between rows), Enter moves down a column. The problems shown
// are those of the last check; a cell that has been edited since drops its problem until the next check.

const fit = (column: BulkColumn, text: string): string => {
  const hit = column.options?.find((o) => o.label.toLowerCase() === text.toLowerCase() || o.value.toLowerCase() === text.toLowerCase());
  return hit ? hit.label : text;
};
export const nextLine = (rows: SourceRow[]) => rows.reduce((m, r) => Math.max(m, r.line), 0) + 1;
export const blankRow = (line: number): SourceRow => ({ line, values: {} });

export function BulkGrid({
  entity,
  rows,
  verdicts,
  onChange,
}: {
  entity: BulkEntityShape;
  rows: SourceRow[];
  verdicts: RowVerdict[];
  onChange: (rows: SourceRow[]) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const problemsOf = new Map(verdicts.map((v) => [v.line, v.problems]));
  const touch = (keys: string[]) => setEdited((s) => new Set([...s, ...keys]));

  const setCell = (line: number, key: string, value: string) => {
    touch([`${line}:${key}`]);
    onChange(rows.map((r) => (r.line === line ? { ...r, values: { ...r.values, [key]: value } } : r)));
  };
  const addRow = () => {
    if (rows.length < GRID_MAX_ROWS) onChange([...rows, blankRow(nextLine(rows))]);
  };
  const paste = (e: ClipboardEvent<HTMLElement>, rowIndex: number, colIndex: number) => {
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").replace(/\n$/, "");
    if (!/[\t\n]/.test(text)) return; // one value: the ordinary paste into this cell
    e.preventDefault();
    const next = rows.map((r) => ({ ...r, values: { ...r.values } }));
    const touched: string[] = [];
    let dropped = 0;
    let line = nextLine(rows) - 1;
    text.split("\n").forEach((cells, i) => {
      let target = next[rowIndex + i];
      if (!target) {
        if (next.length >= GRID_MAX_ROWS) {
          dropped++;
          return;
        }
        target = blankRow(++line);
        next.push(target);
      }
      cells.split("\t").forEach((cell, j) => {
        const column = entity.columns[colIndex + j];
        if (!column) return;
        target.values[column.key] = fit(column, cell.trim());
        touched.push(`${target.line}:${column.key}`);
      });
    });
    touch(touched);
    setNote(dropped > 0 ? `Only ${GRID_MAX_ROWS} rows fit; ${dropped} were not pasted.` : null);
    onChange(next);
  };
  const enterDown = (e: KeyboardEvent<HTMLElement>, rowIndex: number, key: string) => {
    if (e.key !== "Enter") return;
    const below = rows[rowIndex + 1];
    if (!below) return;
    e.preventDefault();
    cellRefs.current.get(`${below.line}:${key}`)?.focus();
  };

  return (
    <div className="space-y-3">
      <div role="region" aria-label="Rows to add" tabIndex={0} className={REGION}>
        <table className={TABLE}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={TH}>
                Row
              </th>
              {entity.columns.map((c) => (
                <th key={c.key} scope="col" className={TH}>
                  {c.label}
                  {c.required && <span aria-hidden="true"> *</span>}
                </th>
              ))}
              <th scope="col" className={TH}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {rows.map((row, rowIndex) => {
              const problems = problemsOf.get(row.line) ?? [];
              const forCell = (key: string): Problem | undefined =>
                edited.has(`${row.line}:${key}`) ? undefined : problems.find((p) => p.column === key);
              const rowWide = problems.filter((p) => !p.column);
              return (
                <tr key={row.line} className={TR}>
                  <td className={`${TD} text-sm font-semibold text-fg md:w-14`}>
                    <span className="md:hidden">Row </span>
                    {row.line}
                    {rowWide.map((p) => (
                      <p key={p.message} className="mt-1 text-xs font-normal text-danger-fg">
                        {p.message}
                      </p>
                    ))}
                  </td>
                  {entity.columns.map((c, colIndex) => {
                    const value = row.values[c.key] ?? "";
                    const problem = forCell(c.key);
                    const name = `${c.label}, row ${row.line}`;
                    const problemId = `p-${row.line}-${c.key}`;
                    const common = {
                      "aria-label": name,
                      "aria-invalid": problem ? true : undefined,
                      "aria-describedby": problem ? problemId : undefined,
                      className: `${CONTROL} ${problem ? BAD_BORDER : OK_BORDER}`,
                      ref: (el: HTMLElement | null) => {
                        if (el) cellRefs.current.set(`${row.line}:${c.key}`, el);
                        else cellRefs.current.delete(`${row.line}:${c.key}`);
                      },
                      onPaste: (e: ClipboardEvent<HTMLElement>) => paste(e, rowIndex, colIndex),
                      onKeyDown: (e: KeyboardEvent<HTMLElement>) => enterDown(e, rowIndex, c.key),
                    };
                    return (
                      <td key={c.key} className={TD}>
                        <span aria-hidden="true" className={PHONE_LABEL}>
                          {c.label}
                          {c.required && " *"}
                        </span>
                        {c.options ? (
                          <select {...common} value={value} onChange={(e) => setCell(row.line, c.key, e.target.value)}>
                            <option value="">Choose…</option>
                            {c.options.map((o) => (
                              <option key={o.value} value={o.label}>
                                {o.label}
                              </option>
                            ))}
                            {value !== "" && !c.options.some((o) => o.label === value) && <option value={value}>{value}</option>}
                          </select>
                        ) : (
                          <input
                            {...common}
                            type="text"
                            value={value}
                            autoComplete="off"
                            onChange={(e) => setCell(row.line, c.key, e.target.value)}
                          />
                        )}
                        {problem && (
                          <p id={problemId} className="mt-1 text-xs text-danger-fg">
                            {problem.message}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${TD} md:w-24`}>
                    <Button
                      variant="ghost"
                      aria-label={`Delete row ${row.line}`}
                      onClick={() => onChange(rows.filter((r) => r.line !== row.line))}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={addRow} disabled={rows.length >= GRID_MAX_ROWS}>
          Add row
        </Button>
        <p className="text-sm text-fg-muted">
          {rows.length} of {GRID_MAX_ROWS} rows
        </p>
      </div>
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {note}
      </p>
      <p className="text-xs text-fg-muted">
        Paste rows copied from Excel into any cell. * marks a column that must be filled in; the others may be left empty.
      </p>
    </div>
  );
}
