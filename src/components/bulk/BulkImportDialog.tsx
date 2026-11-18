"use client";

import { BranchPicker } from "@/components/ui/BranchPicker";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";
import { useBulkJobs } from "./BulkJobs";
import { say } from "@/components/academics/common";
import { applyCorrections } from "@/lib/bulk/corrections";
import { splitCsv } from "@/lib/bulk/csv";
import { problemRowsTable } from "@/lib/bulk/export";
import { mapTable } from "@/lib/bulk/table";
import {
  CSV_MAX_BYTES,
  FILE_MAX_ROWS,
  GRID_MAX_ROWS,
  XLSX_MAX_BYTES,
  type BulkEntityShape,
  type RowVerdict,
  type SourceRow,
} from "@/lib/bulk/types";
import { validateRows } from "@/lib/bulk/validate";
import { BulkGrid, blankRow } from "./BulkGrid";
import { BulkReview } from "./BulkReview";
import { csvBlob, saveBlob } from "./download";

// The one screen for adding many people at once (task 0084), the same for every kind: staff, invitations, pupils, fees. Three ways in: a file (CSV or Excel), a grid, and (outside
// this dialog) the single form. A file or a grid is checked in the browser with the SAME rules the server runs, shown row by row, then checked again on the server (a dry run, which
// writes nothing) before anything can be saved; the real save checks everything a third time inside one transaction and saves every row it is given or none.

type Stage = "start" | "review" | "grid";
type Props = {
  open: boolean;
  onClose: () => void;
  entity: BulkEntityShape;
  title: string;
  description: ReactNode;
  endpoint: string;
  /// Sent with every request: which branch the rows are for.
  context: Record<string, unknown>;
  noun: { one: string; many: string };
  /// A control the kind needs before anything can be read (which branch the rows are for). It is told when the rows are in and the choice must not change any more.
  contextControl?: (locked: boolean) => ReactNode;
  /// False while that control is not filled in: the file, the templates and the grid wait for it.
  canStart?: boolean;
  /// The branch the rows go into, shown as a labelled chip at the top of every step so nobody loads a file into the wrong branch (the maintainer, 2026-11-18).
  branchName?: string;
  /// The branches the rows could go into, with the one chosen and what to do when another is picked (task 0100: "can we switch branch on this dashboard"). While the first step is open the chip
  /// is a branch picker; once a file or a grid has rows the branch is fixed again, so rows can never be loaded for one branch and saved into another.
  branchChoices?: readonly { id: string; name: string }[];
  branchId?: string;
  onBranchChange?: (id: string) => void;
  /// Something the kind wants shown above the rows of a review (a fee file's totals per class).
  reviewExtra?: (rows: SourceRow[], verdicts: RowVerdict[]) => ReactNode;
  onSaved: (count: number) => void | Promise<void>;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hasText = (r: SourceRow) => Object.values(r.values).some((v) => v.trim() !== "");
const asValues = (rows: SourceRow[]) => rows.map((r) => ({ line: r.line, values: r.values }));
const plain = (entity: BulkEntityShape, rows: SourceRow[]) => ({
  headers: entity.columns.map((c) => c.label),
  rows: rows.map((r) => entity.columns.map((c) => r.values[c.key] ?? "")),
});

export function BulkImportDialog({
  open,
  onClose,
  entity,
  title,
  description,
  endpoint,
  context,
  noun,
  contextControl,
  canStart = true,
  branchName,
  branchChoices,
  branchId,
  onBranchChange,
  reviewExtra,
  onSaved,
}: Props) {
  const [stage, setStage] = useState<Stage>("start");
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [verdicts, setVerdicts] = useState<RowVerdict[]>([]);
  const [gridRows, setGridRows] = useState<SourceRow[]>([]);
  const [origin, setOrigin] = useState<Set<number>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  // The save runs in the app shell (BulkJobs), batch by batch, so it outlives this dialog; this is the job this dialog started, for the progress shown here.
  const jobs = useBulkJobs();
  const [jobId, setJobId] = useState<number | null>(null);
  const job = jobs.jobs.find((j) => j.id === jobId) ?? null;
  const saving = job?.status === "running";
  // Whether this dialog is still the one on screen when a job ends: only then may it close itself (a dialog opened since is not its business).
  const onScreen = useRef(false);
  useEffect(() => {
    onScreen.current = open;
    return () => {
      onScreen.current = false;
    };
  }, [open]);

  const bad = verdicts.filter((v) => v.status === "error").length;
  const ready = verdicts.length - bad;
  const dirty = (stage === "grid" && gridRows.some(hasText)) || (stage === "review" && rows.length > 0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const guard = (action: () => void) => (dirty ? setLeaving(() => action) : action());

  /// Browser first (the shared rules), then the server's dry run for the rows the browser accepted (what only the database knows). A row's verdict is the browser's if it has one.
  async function check(all: SourceRow[]): Promise<RowVerdict[] | null> {
    const local = validateRows(entity, all);
    const accepted = new Set(local.ok.map((o) => o.line));
    const fromServer = new Map<number, RowVerdict>();
    if (accepted.size > 0) {
      const reply = await sendJson(endpoint, "POST", { ...context, dryRun: true, rows: asValues(all.filter((r) => accepted.has(r.line))) });
      if (!reply.ok) {
        setError(say(reply, "The rows could not be checked. Nothing was saved."));
        return null;
      }
      for (const v of reply.data!.verdicts as RowVerdict[]) fromServer.set(v.line, v);
    }
    return local.verdicts.map((v) => (v.status === "error" ? v : (fromServer.get(v.line) ?? v)));
  }

  async function readTable(file: File): Promise<string[][] | string> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xls")) return "Old .xls files can't be read. Save it as .xlsx or CSV and choose it again.";
    const xlsx = name.endsWith(".xlsx");
    if (!xlsx && !name.endsWith(".csv")) return "Choose a CSV or Excel (.xlsx) file.";
    if (file.size === 0) return "That file is empty.";
    if (file.size > (xlsx ? XLSX_MAX_BYTES : CSV_MAX_BYTES))
      return `That file is too large (the limit is ${xlsx ? "2" : "1"} MB). Split it, or use fewer columns.`;
    try {
      if (!xlsx) return splitCsv(await file.text());
      const { readXlsx } = await import("@/lib/bulk/xlsx");
      return await readXlsx(await file.arrayBuffer());
    } catch {
      return "That file couldn't be read as an Excel (.xlsx) workbook. Save it again as .xlsx or CSV.";
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>, corrections: boolean) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await loadFile(file, corrections);
  }

  async function loadFile(file: File, corrections: boolean) {
    setBusy(true);
    setError(null);
    try {
      const table = await readTable(file);
      if (typeof table === "string") return setError(table);
      const mapped = mapTable(table, entity.columns, { allowRowColumn: corrections, maxRows: entity.maxRows, fullName: entity.fullName });
      if (mapped.problems.length > 0) return setError(mapped.problems.map((p) => p.message).join(" "));
      if (mapped.rows.length === 0) return setError("The file has its first row but no people under it.");
      setWarnings(mapped.warnings);
      const next = corrections ? applyCorrections(rows, verdicts, mapped.rows) : { next: mapped.rows, refused: [] };
      setRefused(next.refused.map((r) => r.message));
      const checked = await check(next.next);
      if (!checked) return;
      setRows(next.next);
      setVerdicts(checked);
      setStage("review");
    } finally {
      setBusy(false);
    }
  }

  function save(subset: SourceRow[]) {
    setError(null);
    // When every row on screen is being saved, a finished save closes the dialog; when only the good rows are, the problem rows stay to be fixed.
    const everyRow = subset.length === rows.length;
    const id = jobs.start({
      title: `Adding ${plural(subset.length, noun.one, noun.many)}`,
      branchName,
      endpoint,
      context,
      rows: asValues(subset),
      columns: entity.columns.map((c) => ({ key: c.key, label: c.label })),
      onFinished: async (result) => {
        // The rows that were saved leave the list; what the server said of a refused batch replaces what the review knew of it. Safe if this dialog is already gone.
        const saved = new Set(result.savedLines);
        setRows((all) => all.filter((r) => !saved.has(r.line)));
        const fresh = new Map((result.verdicts ?? []).map((v) => [v.line, v]));
        setVerdicts((all) => all.filter((v) => !saved.has(v.line)).map((v) => fresh.get(v.line) ?? v));
        if (result.saved > 0) await onSaved(result.saved);
        if (result.stopped) setError(result.message ?? "The rows could not be saved.");
        else if (everyRow && onScreen.current) onClose();
      },
    });
    setJobId(id);
  }

  function openGrid(mode: "new" | "problems" | "all") {
    setError(null);
    setRefused([]);
    if (mode === "new") {
      setRows([]);
      setVerdicts([]);
      setOrigin(new Set());
      setGridRows([blankRow(1)]);
    } else {
      const wanted = mode === "all" ? rows : rows.filter((r) => verdicts.find((v) => v.line === r.line)?.status === "error");
      setOrigin(new Set(wanted.map((r) => r.line)));
      setGridRows(wanted.map((r) => ({ line: r.line, values: { ...r.values } })));
    }
    setStage("grid");
  }

  async function checkGrid() {
    const typed = gridRows.filter(hasText);
    const kept = rows.filter((r) => !origin.has(r.line) || typed.some((t) => t.line === r.line));
    const known = new Set(kept.map((r) => r.line));
    const merged = [...kept.map((r) => typed.find((t) => t.line === r.line) ?? r), ...typed.filter((t) => !known.has(t.line))];
    if (merged.length === 0) return setError("Add at least one row.");
    setBusy(true);
    setError(null);
    const checked = await check(merged);
    setBusy(false);
    if (!checked) return;
    setRows(merged);
    setVerdicts(checked);
    setStage("review");
  }

  const downloadProblems = async (kind: "csv" | "xlsx") => {
    const t = problemRowsTable(entity.columns, rows, verdicts);
    if (kind === "csv") return saveBlob(`${entity.id}-problem-rows.csv`, csvBlob(t.headers, t.rows));
    const { buildWorkbook } = await import("@/lib/bulk/xlsx");
    saveBlob(`${entity.id}-problem-rows.xlsx`, await buildWorkbook(entity.columns, t.headers, t.rows));
  };
  const downloadTemplate = async (kind: "csv" | "xlsx") => {
    const headers = entity.columns.map((c) => c.label);
    if (kind === "csv") return saveBlob(`${entity.id}-template.csv`, csvBlob(headers, []));
    const { buildWorkbook } = await import("@/lib/bulk/xlsx");
    saveBlob(`${entity.id}-template.xlsx`, await buildWorkbook(entity.columns, headers, []));
  };
  const downloadWork = async (kind: "csv" | "xlsx") => {
    const t = plain(entity, stage === "grid" ? gridRows.filter(hasText) : rows);
    if (kind === "csv") return saveBlob(`${entity.id}-rows.csv`, csvBlob(t.headers, t.rows));
    const { buildWorkbook } = await import("@/lib/bulk/xlsx");
    saveBlob(`${entity.id}-rows.xlsx`, await buildWorkbook(entity.columns, t.headers, t.rows));
  };

  const startOver = () => {
    setRows([]);
    setVerdicts([]);
    setGridRows([]);
    setWarnings([]);
    setRefused([]);
    setError(null);
    setStage("start");
  };

  return (
    <>
      <Dialog
        open={open}
        confirmClose
        // the platform also reports the close this component asks for itself (`open` has become false by then): only a close of an open dialog is a request to leave
        onClose={() => open && (saving ? onClose() : guard(onClose))}
        title={title}
        description={description}
        extraWide
      >
        <div className="space-y-4">
          {branchName && stage === "start" && branchChoices && branchChoices.length > 1 && branchId && onBranchChange ? (
            <BranchPicker branches={branchChoices} value={branchId} onChange={onBranchChange} />
          ) : (
            branchName && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Branch</span>
                <span className="rounded-full border border-brand-strong/40 bg-brand-tint px-3 py-1 font-semibold text-brand-fg">
                  {branchName}
                </span>
              </p>
            )
          )}
          {contextControl?.(stage !== "start")}
          {error && <Alert variant="error">{error}</Alert>}

          {stage === "start" && (
            <div className="space-y-5">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-fg-muted" aria-label="Steps">
                <li className="text-fg">1. Choose how to add</li>
                <li aria-hidden="true">›</li>
                <li>2. Check every row</li>
                <li aria-hidden="true">›</li>
                <li>3. Save</li>
              </ol>
              <div className="grid gap-4 md:grid-cols-2">
                <section
                  aria-label="From a file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!busy && canStart) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && !busy && canStart) void loadFile(file, false);
                  }}
                  className={`space-y-3 rounded-2xl border-2 border-dashed p-4 transition-colors ${
                    dragging ? "border-brand-strong bg-info-bg" : "border-line-strong bg-surface"
                  }`}
                >
                  <h3 className="text-sm font-semibold text-fg">From a file</h3>
                  <p className="text-sm text-fg-muted">Drag a CSV or Excel file here, or choose one.</p>
                  <div>
                    <label htmlFor={`${entity.id}-file`} className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
                      CSV or Excel file
                    </label>
                    <input
                      id={`${entity.id}-file`}
                      type="file"
                      accept=".csv,.xlsx"
                      disabled={busy || !canStart}
                      onChange={(e) => void onFile(e, false)}
                      className="block w-full text-sm text-fg file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-fg"
                    />
                    <p className="mt-1.5 text-xs text-fg-muted">
                      The first row names the columns. Up to {(entity.maxRows ?? FILE_MAX_ROWS).toLocaleString("en")} rows. Excel files must
                      be .xlsx (an old .xls: save it as .xlsx or CSV first).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => void downloadTemplate("xlsx")}>
                      Excel template
                    </Button>
                    <Button variant="secondary" onClick={() => void downloadTemplate("csv")}>
                      CSV template
                    </Button>
                  </div>
                </section>
                <section
                  aria-label="By typing"
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-fg">By typing</h3>
                    <p className="text-sm text-fg-muted">
                      Fill in a table here, or paste rows copied from a spreadsheet. Nothing is saved until you have checked every row.
                    </p>
                  </div>
                  <div>
                    <Button variant="secondary" onClick={() => openGrid("new")} disabled={!canStart}>
                      Type or paste rows instead
                    </Button>
                  </div>
                </section>
              </div>
              <details className="rounded-2xl border border-line bg-surface p-4">
                <summary className="min-h-6 cursor-pointer text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-ring">
                  The columns
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-fg-muted">
                  {entity.columns.map((c) => (
                    <li key={c.key}>
                      <span className="font-medium text-fg">{c.label}</span> ({c.required ? "must be filled in" : "may be left out"}):{" "}
                      {c.help}
                    </li>
                  ))}
                </ul>
                {entity.fullName && <p className="mt-2 text-xs text-fg-muted">{entity.fullName.note}</p>}
                <p className="mt-2 text-xs text-fg-muted">The Excel template has a dropdown on every column with fixed choices.</p>
              </details>
            </div>
          )}

          {stage === "review" && (
            <div className="space-y-4">
              <p role="status" className="text-sm font-semibold text-fg">
                {plural(verdicts.length, "row", "rows")}: {ready} ready, {bad} with problems
              </p>
              {warnings.length > 0 && (
                <Alert variant="warning" announce={false}>
                  <ul className="list-disc pl-4">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {refused.length > 0 && (
                <Alert variant="warning" announce={false} title="Some corrected rows were not used">
                  <ul className="list-disc pl-4">
                    {refused.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {reviewExtra?.(rows, verdicts)}
              <BulkReview entity={entity} rows={rows} verdicts={verdicts} />
              {saving && job && (
                <div className="space-y-3 rounded-xl border border-line-strong bg-surface-2 p-4" aria-live="off">
                  <p className="text-sm font-semibold text-fg">
                    Saving {job.done} of {job.total}…
                  </p>
                  <progress
                    max={job.total}
                    value={job.done}
                    aria-label="Saving"
                    className="h-2 w-full overflow-hidden rounded-full accent-brand-strong"
                  />
                  <p className="text-xs text-fg-muted">
                    Each batch of 20 is saved on its own. You do not have to wait here: it carries on in the background, with its progress
                    in the corner of the screen.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onClose()}>Keep working</Button>
                    <Button variant="ghost" onClick={() => jobs.stop(job.id)} disabled={job.stopping}>
                      {job.stopping ? "Stopping…" : "Stop after this batch"}
                    </Button>
                  </div>
                </div>
              )}
              <fieldset disabled={saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
                <div className="flex flex-wrap items-center gap-2">
                  {bad === 0 && rows.length > 0 && (
                    <Button loading={busy} onClick={() => void save(rows)}>
                      Save all {plural(rows.length, "row", "rows")}
                    </Button>
                  )}
                  {bad > 0 && ready > 0 && (
                    <Button
                      loading={busy}
                      onClick={() => void save(rows.filter((r) => verdicts.find((v) => v.line === r.line)?.status !== "error"))}
                    >
                      Save the {plural(ready, "good row", "good rows")} now
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => openGrid("problems")} disabled={bad === 0 || bad > GRID_MAX_ROWS}>
                    Edit the {plural(bad, "problem row", "problem rows")}
                  </Button>
                  <Button variant="secondary" onClick={() => openGrid("all")} disabled={rows.length > GRID_MAX_ROWS || rows.length === 0}>
                    Edit all {plural(rows.length, "row", "rows")}
                  </Button>
                </div>
                {rows.length > GRID_MAX_ROWS && (
                  <p className="text-xs text-fg-muted">
                    This has more than {GRID_MAX_ROWS} rows, so the grid can only open the problem rows
                    {bad > GRID_MAX_ROWS
                      ? ", and there are more than 50 of those: download them, fix them in a spreadsheet and upload the corrections"
                      : ""}
                    .
                  </p>
                )}
                {bad > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Button variant="secondary" onClick={() => void downloadProblems("csv")}>
                      Problem rows (CSV)
                    </Button>
                    <Button variant="secondary" onClick={() => void downloadProblems("xlsx")}>
                      Problem rows (Excel)
                    </Button>
                    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
                      Upload the corrections
                      <input type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy} onChange={(e) => void onFile(e, true)} />
                    </label>
                  </div>
                )}
                <div className="border-t border-line pt-3">
                  <Button variant="ghost" onClick={() => guard(startOver)}>
                    Start over
                  </Button>
                </div>
              </fieldset>
            </div>
          )}

          {stage === "grid" && (
            <div className="space-y-4">
              <BulkGrid entity={entity} rows={gridRows} verdicts={verdicts} onChange={setGridRows} />
              <div className="flex flex-wrap items-center gap-2">
                <Button loading={busy} onClick={() => void checkGrid()}>
                  Check the rows
                </Button>
                <Button variant="secondary" onClick={() => void downloadWork("csv")} disabled={!gridRows.some(hasText)}>
                  Download as CSV
                </Button>
                <Button variant="secondary" onClick={() => void downloadWork("xlsx")} disabled={!gridRows.some(hasText)}>
                  Download as Excel
                </Button>
                <Button variant="ghost" onClick={() => guard(() => (rows.length > 0 ? setStage("review") : startOver()))}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title="Leave without saving?"
        description={`These ${noun.many} have not been saved. You can download what is here first and use it again later.`}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void downloadWork("csv")}>
            Download as CSV
          </Button>
          <Button variant="secondary" onClick={() => void downloadWork("xlsx")}>
            Download as Excel
          </Button>
          <Button data-initial-focus onClick={() => setLeaving(null)}>
            Stay
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const action = leaving;
              setLeaving(null);
              action?.();
            }}
          >
            Leave without saving
          </Button>
        </div>
      </Dialog>
    </>
  );
}
