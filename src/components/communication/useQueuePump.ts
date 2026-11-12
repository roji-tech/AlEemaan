"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sends a broadcast's remaining messages in the background (task 0063). The server holds the queue; this only asks it, again and again, to send "the next batch" and shows how far it got.
// It starts when a broadcast reports messages still queued, and when the Communication screen opens with messages waiting (a broadcast that was cut off by a closed tab or a lost connection).
// Two screens doing it at once is safe: the server hands each row to one call only.

export type Progress = { total: number; done: number; sent: number; failed: number };
export type PumpState =
  | { phase: "idle" }
  | ({ phase: "sending" } & Progress)
  | ({ phase: "paused" } & Progress)
  | ({ phase: "done"; firstError: string | null } & Progress);

const PAUSE_MS = 200;
const RETRY_MS = 2000;
const GIVE_UP_AFTER = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Batch = { claimed: number; sent: number; failed: number; remaining: number; firstError: string | null };

async function nextBatch(branchId: string): Promise<Batch | null> {
  try {
    const res = await fetch("/api/v1/communication/queue/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId }),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return null;
    }
    const json = await res.json();
    return json.data as Batch;
  } catch {
    return null;
  }
}

async function waitingCount(branchId: string): Promise<number> {
  try {
    const res = await fetch(`/api/v1/communication/queue?branchId=${encodeURIComponent(branchId)}`);
    if (!res.ok) {
      await res.text().catch(() => "");
      return 0;
    }
    const json = await res.json();
    return Number(json.data?.pending ?? 0);
  } catch {
    return 0;
  }
}

export function useQueuePump(branchId: string) {
  const [state, setState] = useState<PumpState>({ phase: "idle" });
  const running = useRef(false);
  const branchRef = useRef(branchId);
  const alive = useRef(true);

  const run = useCallback(async (start: Progress) => {
    if (running.current) return;
    running.current = true;
    const branch = branchRef.current;
    const totals = { ...start };
    let firstError: string | null = null;
    let failures = 0;
    let idle = 0;
    setState({ phase: "sending", ...totals });
    while (alive.current && branchRef.current === branch) {
      const batch = await nextBatch(branch);
      if (!alive.current || branchRef.current !== branch) break;
      if (!batch) {
        failures += 1;
        if (failures >= GIVE_UP_AFTER) {
          setState({ phase: "paused", ...totals });
          break;
        }
        await sleep(RETRY_MS);
        continue;
      }
      failures = 0;
      totals.sent += batch.sent;
      totals.failed += batch.failed;
      totals.done += batch.claimed;
      totals.total = Math.max(totals.total, totals.done + batch.remaining);
      firstError = firstError ?? batch.firstError;
      if (batch.remaining === 0) {
        setState({ phase: "done", firstError, ...totals });
        break;
      }
      // another screen is sending the rest: look again a few times, then stop
      idle = batch.claimed === 0 ? idle + 1 : 0;
      if (idle >= 5) {
        setState({ phase: "paused", ...totals });
        break;
      }
      setState({ phase: "sending", ...totals });
      await sleep(batch.claimed === 0 ? RETRY_MS : PAUSE_MS);
    }
    running.current = false;
  }, []);

  /// Carry on with whatever is waiting for this branch (when the screen opens, and from "Try again").
  const resume = useCallback(async () => {
    const pending = await waitingCount(branchRef.current);
    if (pending > 0 && alive.current) void run({ total: pending, done: 0, sent: 0, failed: 0 });
  }, [run]);

  /// A broadcast has just been made: `done` of its `total` were sent before it answered.
  const begin = useCallback((progress: Progress) => void run(progress), [run]);

  useEffect(() => {
    alive.current = true;
    branchRef.current = branchId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new branch starts from nothing, then looks for what is waiting
    setState({ phase: "idle" });
    void resume();
    return () => {
      alive.current = false;
    };
  }, [branchId, resume]);

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);
  return { state, begin, resume, dismiss };
}
