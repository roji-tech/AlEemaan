import { toCsv } from "@/lib/bulk/export";

/// Hands a Blob to the browser as a file download (task 0084).
export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvBlob = (headers: string[], rows: string[][]) => new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
