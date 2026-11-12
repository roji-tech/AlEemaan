import { NotificationDispatchStatus } from "@prisma/client";

/// What a broadcast did, counted from the dispatches it made (task 0053): `count` is how many dispatch rows there are, `sent` how many were delivered to the provider, `failed` how many were not,
/// and `firstError` the reason of the first failure, so that the screen can say why and not only how many.
export type DispatchSummary = { count: number; sent: number; failed: number; firstError: string | null };

export function summariseDispatches(
  rows: ReadonlyArray<{ status: NotificationDispatchStatus; lastError: string | null }>,
): DispatchSummary {
  const failedRows = rows.filter((row) => row.status === NotificationDispatchStatus.FAILED);
  return {
    count: rows.length,
    sent: rows.filter((row) => row.status === NotificationDispatchStatus.SENT).length,
    failed: failedRows.length,
    firstError: failedRows.find((row) => row.lastError)?.lastError ?? null,
  };
}
