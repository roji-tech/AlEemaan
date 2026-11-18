"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { Button } from "@/components/ui/Button";
import { XIcon } from "@/components/ui/icons";
import { BATCH_SIZE, chunkRows } from "@/lib/bulk/batches";
import type { RowVerdict } from "@/lib/bulk/types";
import { csvBlob, saveBlob } from "./download";

// Saving a file in the background, batch by batch (task 0095). The maintainer, 2026-11-18: "is there a way we can do the saving batch by batch and also push it to the background".
//
// The save used to be ONE request and ONE database transaction for the whole file. With the database an ocean away from the server, 144 pupils ran past the transaction's 60 seconds
// (P2028 in the production logs) and nothing was saved. Now the rows go in batches of 20, each its own request and transaction, so no request is long and a failure part-way leaves
// the rows before it saved and the rows after it still on screen.
//
// The loop lives HERE, in the app shell, not in the dialog: closing the dialog ("Keep working") or moving to another page of the app does not stop it, and a small panel in the corner shows
// how far it has got. It stops if the tab is closed or reloaded (the browser is asked first), and a person can stop it after the batch in hand. Every batch goes through the same
// server rules as before (the whole file was already checked in one dry run), and a row saved is never sent again.

export type JobRow = { line: number; values: Record<string, string> };
export type JobStatus = "running" | "done" | "stopped";
export type BulkJob = {
  id: number;
  title: string;
  branchName?: string;
  total: number;
  done: number;
  status: JobStatus;
  /// Why it stopped (the server's own words, or "Stopped by you").
  message?: string;
  /// The rows not saved when it stopped, so they can be downloaded.
  remaining: JobRow[];
  stopping: boolean;
};
export type JobResult = {
  saved: number;
  savedLines: number[];
  stopped: boolean;
  message?: string;
  /// What the server said of the batch that failed, when it refused it for problems.
  verdicts?: RowVerdict[];
};
export type StartJob = {
  title: string;
  branchName?: string;
  endpoint: string;
  context: Record<string, unknown>;
  rows: JobRow[];
  columns: { key: string; label: string }[];
  /// Called once, when the job is over (all saved, or stopped). The dialog that started it may be gone by then: what it does must be safe either way.
  onFinished?: (result: JobResult) => void | Promise<void>;
};
type Api = { jobs: BulkJob[]; start: (job: StartJob) => number; stop: (id: number) => void; dismiss: (id: number) => void };

const Context = createContext<Api | null>(null);

export function useBulkJobs(): Api {
  const api = useContext(Context);
  if (!api) throw new Error("useBulkJobs needs a <BulkJobsProvider> around the app");
  return api;
}

/// How long a finished job stays in the corner before it goes by itself.
const DONE_LINGER_MS = 12_000;

export function BulkJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const nextId = useRef(1);
  const stopping = useRef(new Set<number>());
  // Kept apart from the state: only the download of the rows not saved needs the column names.
  const columns = useRef(new Map<number, { key: string; label: string }[]>());

  const patch = useCallback(
    (id: number, change: Partial<BulkJob>) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...change } : j))),
    [],
  );
  const dismiss = useCallback((id: number) => setJobs((all) => all.filter((j) => j.id !== id)), []);

  const run = useCallback(
    async (id: number, job: StartJob) => {
      const batches = chunkRows(job.rows, BATCH_SIZE);
      const savedLines: number[] = [];
      let saved = 0;
      const finish = async (result: Omit<JobResult, "saved" | "savedLines">, remaining: JobRow[]) => {
        const full: JobResult = { ...result, saved, savedLines };
        patch(id, { status: result.stopped ? "stopped" : "done", done: saved, message: result.message, remaining, stopping: false });
        stopping.current.delete(id);
        if (!result.stopped) setTimeout(() => dismiss(id), DONE_LINGER_MS);
        try {
          await job.onFinished?.(full);
        } catch {
          // the screen that asked has gone away: nothing to tell
        }
      };

      for (let i = 0; i < batches.length; i++) {
        const rest = batches.slice(i).flat();
        if (stopping.current.has(id))
          return finish({ stopped: true, message: `Stopped by you after ${saved} of ${job.rows.length}.` }, rest);
        const part = batches[i];
        const reply = await sendJson(job.endpoint, "POST", { ...job.context, dryRun: false, rows: part });
        if (!reply.ok) {
          const verdicts = reply.code === "BULK_PROBLEMS" ? (reply.data?.verdicts as RowVerdict[] | undefined) : undefined;
          const why = say(reply, "The rows could not be saved.");
          return finish({ stopped: true, message: `${saved} of ${job.rows.length} saved. ${why}`, verdicts }, rest);
        }
        saved += (reply.data?.saved as number | undefined) ?? part.length;
        savedLines.push(...part.map((r) => r.line));
        patch(id, { done: saved });
      }
      return finish({ stopped: false }, []);
    },
    [patch, dismiss],
  );

  const start = useCallback(
    (job: StartJob) => {
      const id = nextId.current++;
      setJobs((all) => [
        ...all,
        {
          id,
          title: job.title,
          branchName: job.branchName,
          total: job.rows.length,
          done: 0,
          status: "running",
          remaining: [],
          stopping: false,
        },
      ]);
      columns.current.set(id, job.columns);
      void run(id, job);
      return id;
    },
    [run],
  );
  const stop = useCallback(
    (id: number) => {
      stopping.current.add(id);
      patch(id, { stopping: true });
    },
    [patch],
  );

  // Closing the tab stops a save that is part-way: ask first.
  const running = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const api = useMemo<Api>(() => ({ jobs, start, stop, dismiss }), [jobs, start, stop, dismiss]);

  const downloadRest = (job: BulkJob) => {
    const cols = columns.current.get(job.id) ?? [];
    saveBlob(
      "rows-not-saved.csv",
      csvBlob(
        cols.map((c) => c.label),
        job.remaining.map((r) => cols.map((c) => r.values[c.key] ?? "")),
      ),
    );
  };

  return (
    <Context.Provider value={api}>
      {children}
      {jobs.length > 0 && (
        <div
          role="region"
          aria-label="Saving in the background"
          className="fixed right-4 bottom-20 z-40 w-[min(24rem,calc(100vw-2rem))] space-y-2 md:right-20 md:bottom-4"
        >
          {jobs.map((job) => (
            <section key={job.id} className="rounded-2xl border border-line-strong bg-surface p-4 shadow-menu">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold wrap-break-word text-fg">{job.title}</p>
                  {job.branchName && <p className="text-xs text-fg-muted">{job.branchName}</p>}
                </div>
                {job.status !== "running" && (
                  <button
                    type="button"
                    onClick={() => dismiss(job.id)}
                    aria-label={`Dismiss: ${job.title}`}
                    className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              {job.status === "running" && (
                <div className="mt-3 space-y-2">
                  <progress
                    max={job.total}
                    value={job.done}
                    aria-label={job.title}
                    className="h-2 w-full overflow-hidden rounded-full accent-brand-strong"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-fg-muted">
                      {job.done} of {job.total} saved
                    </p>
                    <Button variant="ghost" onClick={() => stop(job.id)} disabled={job.stopping}>
                      {job.stopping ? "Stopping…" : "Stop after this batch"}
                    </Button>
                  </div>
                </div>
              )}
              {job.status === "done" && (
                <p role="status" className="mt-2 text-sm text-ok-fg">
                  All {job.total} saved.
                </p>
              )}
              {job.status === "stopped" && (
                <div className="mt-2 space-y-2">
                  <p role="status" className="text-sm text-danger-fg">
                    {job.message}
                  </p>
                  {job.remaining.length > 0 && (
                    <Button variant="secondary" onClick={() => downloadRest(job)}>
                      Download the {job.remaining.length} not saved (CSV)
                    </Button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </Context.Provider>
  );
}
