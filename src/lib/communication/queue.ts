import { NotificationDispatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { defaultNotificationDispatcher } from "./gateways/dispatcher";

// Sending a broadcast in small batches (task 0063). A broadcast writes ONE row per recipient (QUEUED) and sends the first batch before it answers; the rest are sent by the Communication
// screen, which asks for "the next batch" until nothing is left, and picks up again when the screen is opened (a closed tab or a lost connection leaves rows QUEUED; nothing is lost).
// The browser decides nothing: the server chooses the rows, so a screen can never send to someone the broadcast did not name.
//
// A row is taken with a compare-and-swap on (status, updatedAt): only the call that changes the row sends it, so two tabs, or two admins, cannot send the same message twice. The claim moves
// `updatedAt`, which is where the lease of a PROCESSING row starts: a call that died mid-send leaves its rows PROCESSING, and they are taken again once the lease has passed.
// Delivery is at-least-once: a call that dies AFTER the provider accepted a message and before SENT is written sends it again after the lease.

/// How many messages one call sends (they are sent together).
export const BATCH_SIZE = 10;
/// How long a PROCESSING row belongs to the call that took it.
export const LEASE_MS = 10 * 60 * 1000;

export interface BatchResult {
  /// Rows this call took and handled.
  claimed: number;
  sent: number;
  failed: number;
  /// Rows of this branch still waiting (QUEUED, or PROCESSING past its lease): what the screen asks about to know whether to go on.
  remaining: number;
  /// The reason of the first failure of this call, in words (it never holds an address or the message).
  firstError: string | null;
}

/// A sender's reason may quote the address it was given ("Invalid phone number format: 0803..."); what is stored and answered says "the recipient" instead.
const withoutAddress = (reason: string, address: string): string => (address ? reason.split(address).join("the recipient") : reason);

const waiting = (branchId: string, now: Date) => ({
  branchId,
  OR: [
    { status: NotificationDispatchStatus.QUEUED },
    { status: NotificationDispatchStatus.PROCESSING, updatedAt: { lte: new Date(now.getTime() - LEASE_MS) } },
  ],
});

/// How many messages of this branch are waiting to be sent.
export async function countWaiting(branchId: string, now: Date = new Date()): Promise<number> {
  return prisma.notificationDispatch.count({ where: waiting(branchId, now) });
}

/// Takes up to `limit` waiting rows of the branch (oldest first, or only the listed ones), sends them together and records what happened. A sender that throws is a failed message, not a
/// failed call: the other rows are still sent and recorded.
export async function sendNextBatch(
  branchId: string,
  options: { limit?: number; onlyIds?: string[]; now?: Date } = {},
): Promise<BatchResult> {
  const limit = options.limit ?? BATCH_SIZE;
  const now = options.now ?? new Date();
  const candidates = await prisma.notificationDispatch.findMany({
    where: { ...waiting(branchId, now), ...(options.onlyIds ? { id: { in: options.onlyIds } } : {}) },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const taken: typeof candidates = [];
  for (const row of candidates) {
    const won = await prisma.notificationDispatch.updateMany({
      where: { id: row.id, branchId, status: row.status, updatedAt: row.updatedAt },
      data: { status: NotificationDispatchStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (won.count === 1) taken.push(row);
  }

  const outcomes = await Promise.all(
    taken.map(async (row) => {
      try {
        const res = await defaultNotificationDispatcher({
          dispatchId: row.id,
          branchId,
          channel: row.channel,
          recipientAddress: row.recipientAddress,
          recipientUserId: row.recipientUserId,
          subject: row.subject,
          body: row.body,
        });
        return {
          id: row.id,
          ok: res.success,
          error: res.success ? null : withoutAddress(res.error ?? "The message could not be sent.", row.recipientAddress),
        };
      } catch {
        return { id: row.id, ok: false, error: "The message could not be sent." };
      }
    }),
  );

  await Promise.all(
    outcomes.map((o) =>
      prisma.notificationDispatch.update({
        where: { id: o.id },
        data: o.ok
          ? { status: NotificationDispatchStatus.SENT, sentAt: new Date(), lastError: null }
          : { status: NotificationDispatchStatus.FAILED, lastError: o.error },
      }),
    ),
  );

  return {
    claimed: taken.length,
    sent: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    remaining: await countWaiting(branchId, now),
    firstError: outcomes.find((o) => !o.ok)?.error ?? null,
  };
}
