import { randomBytes } from "node:crypto";

/// The columns a Result row must carry for its status, for tests that insert results straight into the database. The database refuses anything else: `Result_status_footprint` (a status says
/// which of submitted/approved/published/locked must be set) and `Result_token_iff_published` (a published result has its verification token and hash, an unpublished one has neither).
export type FootprintStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED";

export function resultFootprint(status: FootprintStatus, userId: string) {
  const now = new Date();
  const submitted = status !== "DRAFT" ? { submittedAt: now, submittedByUserId: userId } : {};
  const approved = status === "APPROVED" || status === "PUBLISHED" ? { approvedAt: now, approvedByUserId: userId } : {};
  const published =
    status === "PUBLISHED"
      ? {
          publishedAt: now,
          verificationToken: randomBytes(24).toString("base64url"),
          verificationHash: randomBytes(32).toString("hex"),
        }
      : {};
  return { status, ...submitted, ...approved, ...published };
}
