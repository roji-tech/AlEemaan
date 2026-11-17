import type { BulkColumn } from "./types";
import { FILE_MAX_ROWS } from "./types";

// Excel (.xlsx) for the bulk entry (task 0084 D5, D10). Both libraries are loaded only when a file is read or a workbook written, so no page pays for them until then.
// Legacy .xls is not read: the caller says "save it as .xlsx or CSV". Only the first sheet is read, and every cell comes out as text.

const asText = (cell: unknown): string => {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number") return Number.isFinite(cell) ? (Number.isInteger(cell) ? cell.toFixed(0) : String(cell)) : "";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  return String(cell);
};

/// The first sheet as rows of text. A number cell comes out as plain digits (never `8.03E+09`); Excel drops a typed leading zero, which the kind's row rules restore for a phone.
/// Rejects for anything that is not an .xlsx file.
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { readSheet } = await import("read-excel-file/universal");
  const data = (await readSheet(buffer)) as unknown[][];
  return data.map((row) => row.map(asText));
}

/// A workbook of `headers` and `rows` (all written as text, so a phone keeps its leading zero), with a dropdown on every column that has fixed values, down to the file's last
/// allowed row. The dropdown's values are the option LABELS: the import accepts them. The template is this with no rows.
export async function buildWorkbook(columns: BulkColumn[], headers: string[], rows: string[][]): Promise<Blob> {
  const [{ default: writeXlsxFile }, { default: dataValidation }] = await Promise.all([
    import("write-excel-file/universal"),
    import("@onparallel/write-excel-file-data-validation"),
  ]);
  const sheet = [
    headers.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((c) => ({ value: c, type: String }))),
  ];
  const lastRow = FILE_MAX_ROWS + 1;
  const dropdowns = columns.flatMap((c) => {
    const at = headers.indexOf(c.label);
    if (!c.options || at === -1) return [];
    return [
      {
        cellRange: { from: { row: 2, column: at + 1 }, to: { row: lastRow, column: at + 1 } },
        validation: {
          type: "list" as const,
          values: c.options.map((o) => o.label),
          error: `Choose one of: ${c.options.map((o) => o.label).join(", ")}.`,
        },
      },
    ];
  });
  return writeXlsxFile(sheet, { sheet: "Sheet1", dataValidation: dropdowns } as never, { features: [dataValidation] } as never).toBlob();
}
