import { restoreCell } from "./export";
import { splitFullName } from "./names";
import { FILE_MAX_ROWS, type BulkColumn, type BulkEntityShape, type FileProblem, type SourceRow } from "./types";

type BulkEntityFullName = NonNullable<BulkEntityShape["fullName"]>;

export type MappedTable = { rows: SourceRow[]; problems: FileProblem[]; warnings: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ROW_HEADERS = new Set(["row", "rownumber", "originalrow", "line"]);
const SILENT_HEADERS = new Set(["", "problem", "problems"]);

/// Cells to rows (task 0084). The first non-blank row names the columns, by key, label or alias, ignoring case, spaces and punctuation. A required column must be there; an optional
/// one may be missing altogether. A header nothing recognises is named in `warnings` (a typo must not lose a column in silence); "Problem" and "#" are the app's own and are not.
/// `line` is the spreadsheet's own row number (the header is row 1, blank rows keep the count). With `allowRowColumn` (the corrections file) each row also carries the
/// original row number it corrects.
export function mapTable(
  table: string[][],
  columns: BulkColumn[],
  opts: { maxRows?: number; allowRowColumn?: boolean; fullName?: BulkEntityFullName } = {},
): MappedTable {
  const out: MappedTable = { rows: [], problems: [], warnings: [] };
  const numbered = table.map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (numbered.length === 0) {
    out.problems.push({ line: 1, message: "The file is empty." });
    return out;
  }
  const head = numbered[0];
  const lookup = new Map<string, BulkColumn>();
  for (const c of columns) for (const name of [c.key, c.label, ...c.aliases]) lookup.set(norm(name), c);

  const at = new Map<string, number>(); // column key -> cell index
  const seenAs = new Map<string, string>();
  let rowAt = -1;
  let fullAt = -1; // a single name column, split into first, middle and last (opts.fullName)
  const fullAliases = new Set((opts.fullName?.aliases ?? []).map(norm));
  head.cells.forEach((raw, i) => {
    const n = norm(raw);
    const column = lookup.get(n);
    if (!column && fullAliases.has(n) && fullAt === -1) {
      fullAt = i;
      return;
    }
    if (column) {
      if (at.has(column.key))
        out.problems.push({
          line: head.line,
          message: `The "${column.label}" column appears twice ("${seenAs.get(column.key)}" and "${raw.trim()}"): keep one.`,
        });
      else {
        at.set(column.key, i);
        seenAs.set(column.key, raw.trim());
      }
    } else if (opts.allowRowColumn && ROW_HEADERS.has(n) && rowAt === -1) rowAt = i;
    else if (!SILENT_HEADERS.has(n) && n !== "") out.warnings.push(`The column "${raw.trim()}" is not recognised and was ignored.`);
  });
  // A name column stands in for the first and the last name only when the file lacks a column of its own for one of them; then it fills every part the file has no column for (the middle
  // name too). Separate columns win: a file with its own First name AND Last name columns keeps them, and the name column beside them is ignored (and said so).
  const filledByFullName = new Set<string>();
  if (fullAt !== -1 && opts.fullName) {
    const { first, middle, last } = opts.fullName;
    if (!at.has(first) || !at.has(last)) {
      for (const key of [first, middle, last]) if (!at.has(key)) filledByFullName.add(key);
    } else {
      out.warnings.push(`The column "${head.cells[fullAt].trim()}" was ignored: the file has its own first and last name columns.`);
    }
  }
  for (const c of columns)
    if (c.required && !at.has(c.key) && !filledByFullName.has(c.key))
      out.problems.push({ line: head.line, message: `A "${c.label}" column is missing from the first row.` });
  if (opts.allowRowColumn && rowAt === -1)
    out.problems.push({ line: head.line, message: 'The corrections file needs the "Row" column from the download.' });
  if (out.problems.length > 0) return out;

  const body = numbered.slice(1);
  const max = opts.maxRows ?? FILE_MAX_ROWS;
  if (body.length > max) {
    out.problems.push({ line: 1, message: `Use at most ${max} rows at a time; this file has ${body.length}.` });
    return out;
  }
  for (const { cells, line } of body) {
    const values: Record<string, string> = {};
    for (const [key, i] of at) values[key] = restoreCell((cells[i] ?? "").trim());
    if (fullAt !== -1 && opts.fullName) {
      const parts = splitFullName(restoreCell((cells[fullAt] ?? "").trim()));
      if (filledByFullName.has(opts.fullName.first)) values[opts.fullName.first] = parts.first;
      if (filledByFullName.has(opts.fullName.middle)) values[opts.fullName.middle] = parts.middle;
      if (filledByFullName.has(opts.fullName.last)) values[opts.fullName.last] = parts.last;
    }
    const row: SourceRow = { line, values };
    if (cells.slice(head.cells.length).some((c) => c.trim() !== "")) row.overflow = true;
    if (opts.allowRowColumn) {
      const n = (cells[rowAt] ?? "").trim();
      row.originalLine = /^\d+$/.test(n) ? Number(n) : null;
    }
    out.rows.push(row);
  }
  return out;
}
