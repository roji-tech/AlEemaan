import type { BulkColumn, RowVerdict, SourceRow } from "./types";

// What a download holds, and how it reads back (task 0084 D9). Pure: no browser, no database.

/// A cell Excel would run as a formula (it starts with =, @, a tab or a carriage return, or with + or - followed by anything but a plain number or phone) is written with a leading
/// apostrophe. A plain `+2348031234567` or `-5` is left alone: a phone must not get a visible apostrophe in a spreadsheet.
export function neutralise(cell: string): string {
  if (/^[=@\t\r]/.test(cell)) return `'${cell}`;
  if (/^[+-]/.test(cell) && !/^[+-]?\d[\d ()-]*$/.test(cell)) return `'${cell}`;
  return cell;
}
/// Undoes exactly what `neutralise` did, so a file this app wrote uploads back unchanged.
export const restoreCell = (cell: string): string => (/^'[=@\t\r+-]/.test(cell) ? cell.slice(1) : cell);

const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
/// UTF-8 with a byte-order mark (so Excel reads accents), CRLF line ends, quotes where needed, every cell neutralised.
export const toCsv = (headers: string[], rows: string[][]): string =>
  `\ufeff${[headers, ...rows].map((r) => r.map((c) => quote(neutralise(c))).join(",")).join("\r\n")}\r\n`;

/// The rows with problems, for fixing in a spreadsheet and uploading back: their original row numbers first, then the template's columns, then what is wrong.
export function problemRowsTable(
  columns: BulkColumn[],
  rows: SourceRow[],
  verdicts: RowVerdict[],
): { headers: string[]; rows: string[][] } {
  const label = new Map(columns.map((c) => [c.key, c.label]));
  const byLine = new Map(verdicts.map((v) => [v.line, v]));
  const out: string[][] = [];
  for (const row of rows) {
    const verdict = byLine.get(row.line);
    if (verdict?.status !== "error") continue;
    const why = verdict.problems
      .map((p) => (p.column && label.get(p.column) ? `${label.get(p.column)}: ${p.message}` : p.message))
      .join(" ");
    out.push([String(row.line), ...columns.map((c) => row.values[c.key] ?? ""), why]);
  }
  return { headers: ["Row", ...columns.map((c) => c.label), "Problem"], rows: out };
}
