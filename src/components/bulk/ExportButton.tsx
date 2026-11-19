"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { DownloadIcon } from "@/components/ui/icons";
import { sendJson } from "@/components/auth/postJson";
import { csvBlob, saveBlob, XLSX_TYPE } from "@/components/bulk/download";
import { EXPORT_COLUMNS, EXPORT_NOUN, type ExportKind, type ExportRequest } from "@/lib/bulk/list-export";

// Export a list (task 0103 D3): what (the ones shown now, with the search and filters on; or everything in the branch, optionally with the archived) and the format (CSV or Excel).
// The server picks the rows and audits the export; this writes the file with the same writers as the import templates, so it can be corrected and imported again.
// Shown only to whoever may administer the branch; the server checks again.

type Shown = Pick<ExportRequest, "pupils" | "ids">;

export function ExportButton({
  kind,
  branchId,
  branchName,
  shownCount,
  shown,
}: {
  kind: ExportKind;
  branchId: string;
  branchName: string;
  /// How many records the list matches now (every page), or null while it loads.
  shownCount: number | null;
  /// What "the ones shown" means for this list: the pupils' search and filters, or the ids of the records on screen.
  shown: () => Shown;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"shown" | "all">("shown");
  const [archived, setArchived] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const name = useId();
  const noun = EXPORT_NOUN[kind];

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);
    const body: ExportRequest = { kind, branchId, scope, ...(scope === "all" ? { includeArchived: archived } : shown()) };
    const reply = await sendJson("/api/v1/exports", "POST", body);
    if (!reply.ok) {
      setBusy(false);
      return setError(reply.message ?? "The export could not be made.");
    }
    const data = reply.data as { fileStem: string; headers: string[]; rows: string[][]; count: number };
    if (format === "csv") saveBlob(`${data.fileStem}.csv`, csvBlob(data.headers, data.rows));
    else {
      const { buildWorkbook } = await import("@/lib/bulk/xlsx");
      const blob = await buildWorkbook(EXPORT_COLUMNS[kind], data.headers, data.rows);
      saveBlob(`${data.fileStem}.xlsx`, new Blob([blob], { type: XLSX_TYPE }));
    }
    setBusy(false);
    setDone(`${data.count} ${data.count === 1 ? "row" : "rows"} saved to ${data.fileStem}.${format}.`);
  }

  const radio =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 text-sm text-fg-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring";
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setDone(null);
          setOpen(true);
        }}
      >
        <DownloadIcon className="h-4 w-4" />
        Export
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Export ${noun}`} description={`From ${branchName}, with the same columns as the import template.`}>
        <div className="mt-4 space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">What</legend>
            <label className={radio}>
              <input type="radio" name={`${name}-scope`} checked={scope === "shown"} onChange={() => setScope("shown")} className="h-4 w-4 accent-brand" />
              <span>
                {shownCount === null ? "The ones shown now" : `The ${shownCount} shown now`}, with the search and filters on
              </span>
            </label>
            <label className={radio}>
              <input type="radio" name={`${name}-scope`} checked={scope === "all"} onChange={() => setScope("all")} className="h-4 w-4 accent-brand" />
              <span>Everything in {branchName}</span>
            </label>
            {scope === "all" && (
              <CheckboxField label="Include the archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="pl-1" />
            )}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">Format</legend>
            <label className={radio}>
              <input type="radio" name={`${name}-format`} checked={format === "xlsx"} onChange={() => setFormat("xlsx")} className="h-4 w-4 accent-brand" />
              <span>Excel (.xlsx)</span>
            </label>
            <label className={radio}>
              <input type="radio" name={`${name}-format`} checked={format === "csv"} onChange={() => setFormat("csv")} className="h-4 w-4 accent-brand" />
              <span>CSV</span>
            </label>
          </fieldset>
          <div aria-live="polite" className="empty:hidden">
            {error && <Alert variant="error">{error}</Alert>}
            {done && <Alert variant="success">{done}</Alert>}
          </div>
          <p className="text-xs text-fg-muted">Exports are recorded with your name. Keep the file safe: it holds personal details.</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {done ? "Done" : "Cancel"}
            </Button>
            <Button loading={busy} onClick={() => void run()} disabled={scope === "shown" && shownCount === 0}>
              Export
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
