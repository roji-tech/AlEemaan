// How a bulk save is cut up (task 0095). One transaction for a whole file ran past the database transaction's 60 s limit when every query crosses an ocean (144 pupils at 100 to 200 ms a
// query, about six queries a pupil: P2028, found in the production logs on 2026-11-18). A save now goes in batches, each its own transaction, so no request is long and a failure part-way
// leaves the rows before it saved and the rows after it still in the screen. Pure, so the cutting is tested without a browser.

/// Rows per request. About 120 queries a batch: under 25 s at transatlantic latency, under a second when the database is near.
export const BATCH_SIZE = 20;

/// The rows cut into batches of at most `size`, in order. An empty list has no batches.
export function chunkRows<T>(rows: readonly T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += Math.max(1, size)) out.push(rows.slice(i, i + Math.max(1, size)));
  return out;
}
