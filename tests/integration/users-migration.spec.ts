import { test, expect } from "@playwright/test";
import { Role as R, db, resetDatabase, seedInstance } from "../support/db";
import { hashInvitationToken, newInvitationToken } from "@/lib/invitations/token";

// What the Users/invitations tables enforce whatever the application does. (The test that stepped the database back and replayed the migration's SQL file
// was removed with the migration history, task 0051.)

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.describe("what the migration enforces whatever the application does", () => {
  test("two OPEN invitations for one address AND branch cannot exist (a revoked one does not count; another branch is fine); a mixed-case address is refused", async () => {
    const [first, second] = await db.branch.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
    const make = (email: string, branchId: string, extra: { revokedAt?: Date } = {}) =>
      db.invitation.create({
        data: {
          email,
          role: R.PARENT,
          branchId,
          tokenHash: hashInvitationToken(newInvitationToken()),
          expiresAt: new Date(Date.now() + 60_000),
          ...extra,
        },
      });
    await make("one@invite.test", first.id);
    await expect(make("one@invite.test", first.id)).rejects.toThrow(); // the partial unique index, per (address, branch)
    await expect(make("ONE@invite.test", first.id)).rejects.toThrow(); // …on the lower-cased address, and the CHECK
    await make("one@invite.test", second.id); // another branch: a person may belong to several
    await make("two@invite.test", first.id, { revokedAt: new Date() });
    await make("two@invite.test", first.id); // a revoked one frees the address in that branch
  });
});
