import type { z } from "zod";

// The shared vocabulary of the bulk-entry engine (task 0084). Nothing in `lib/bulk` that the browser imports may import a database client: the rules run in both places.

export const FILE_MAX_ROWS = 1000;
export const GRID_MAX_ROWS = 50;
export const CSV_MAX_BYTES = 1024 * 1024;
export const XLSX_MAX_BYTES = 2 * 1024 * 1024;
/// Longest text one cell may hold before any rule looks at it (a cell is a name, a phone, an email: nothing legitimate is longer).
export const CELL_MAX_CHARS = 500;

export type BulkOption = { value: string; label: string };
export type BulkColumn = {
  key: string;
  label: string;
  /// Other spellings of the header that mean this column, compared without case, spaces or punctuation.
  aliases: string[];
  /// A required column must be in the file's first row; an optional one may be missing altogether, and its cells may be empty.
  required: boolean;
  help: string;
  /// A column with fixed values: a dropdown in the grid and in the downloadable template.
  options?: BulkOption[];
};

export type RawValues = Record<string, string>;
/// One row of what the person typed or uploaded. `line` is the spreadsheet's own row number (the header is row 1).
export type SourceRow = { line: number; values: RawValues; overflow?: boolean; originalLine?: number | null };
export type Problem = { column?: string; message: string };
export type RowVerdict = { line: number; status: "ready" | "error" | "note"; problems: Problem[]; note?: string };
export type FileProblem = { line: number; message: string };

/// What the screens and the shared rules need of a kind: its columns and its row schema, whatever the row's type. A kind's full definition (`BulkEntity<Row>`) is one of these.
export type BulkEntityShape<Row = unknown> = {
  id: string;
  label: string;
  columns: BulkColumn[];
  rowSchema: z.ZodType<Row>;
  uniqueKeys: readonly string[];
  /// The most rows one file or request may hold, when a kind needs fewer than `FILE_MAX_ROWS` (invitations send e-mail: 200).
  maxRows?: number;
};
/// A kind of bulk entry. The row schema is shared by the browser and the server; `uniqueKeys` are checked inside one file. What only the database can know (a clash with a saved record)
/// and the save itself live on the server side of the kind, not here.
export type BulkEntity<Row> = BulkEntityShape<Row> & { uniqueKeys: (keyof Row & string)[] };
