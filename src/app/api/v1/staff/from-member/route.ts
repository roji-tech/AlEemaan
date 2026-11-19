import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { ensureStaffRecord } from "@/lib/academics/staff-accounts";

// POST /api/v1/staff/from-member { branchId, userId }   "Add to staff" (task 0112): puts a member who signs in to this branch on its staff list, linked to their account: their record with
// the same e-mail if there is an unlinked one, else a new one from their name and e-mail (edit it after). An administrator of that branch or a superadmin (403 for another branch);
// a person who is not an active staff member of the branch is a 404.
const body = z.strictObject({ branchId: z.string().trim().min(1).max(64), userId: z.string().trim().min(1).max(64) });

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body: input }) => {
        const member = await prisma.membership.findUnique({
          where: { userId_branchId: { userId: input.userId, branchId: input.branchId } },
          select: { role: true, deactivatedAt: true },
        });
        if (!member || member.deactivatedAt) return noStore(fail("No such member of this branch.", 404, "NOT_FOUND"));
        const done = await prisma.$transaction((tx) =>
          ensureStaffRecord(tx, {
            userId: input.userId,
            branchId: input.branchId,
            role: member.role,
            actorUserId: auth.userId,
            why: "added to staff",
          }),
        );
        if (done === "none")
          return noStore(
            fail("They are already on the staff list, or another record of this branch uses their e-mail address.", 409, "CONFLICT"),
          );
        return noStore(ok({ done }));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
