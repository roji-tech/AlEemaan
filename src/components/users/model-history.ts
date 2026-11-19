import type { Invitation } from "./model";

// The history of invitations (task 0117): the ones that are no longer open. Pure, so the sentences are tested without a browser.

export type HistoricInvitation = Omit<Invitation, "status"> & {
  /// `pending` here means "open until it ran out": the row is only listed once its time has passed.
  status: "pending" | "expired";
  acceptedAt: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  /// "revoked by an administrator" or "replaced by a new invitation".
  revokedWhy: string | null;
};

export type HistoryState = "accepted" | "revoked" | "expired";

export const historyState = (i: Pick<HistoricInvitation, "acceptedAt" | "revokedAt">): HistoryState =>
  i.acceptedAt ? "accepted" : i.revokedAt ? "revoked" : "expired";

const when = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/// "Revoked by Ada Admin, 20 Nov 2026, 10:15 (replaced by a new invitation)" · "Accepted 20 Nov 2026, 10:15" · "Ran out 20 Nov 2026, 10:15".
export function historyText(i: HistoricInvitation): string {
  const state = historyState(i);
  if (state === "accepted") return `Accepted ${when(i.acceptedAt!)}`;
  if (state === "revoked") {
    const by = i.revokedByName ? ` by ${i.revokedByName}` : "";
    const why = i.revokedWhy ? ` (${i.revokedWhy})` : "";
    return `Revoked${by}, ${when(i.revokedAt!)}${why}`;
  }
  return `Ran out ${when(i.expiresAt)}`;
}
