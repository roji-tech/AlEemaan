import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { completeStaff, staffBranchId } from "@/lib/academics/staff";
import { missingText } from "@/lib/drafts/rules";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// POST /api/v1/staff/[id]/complete   Administrators of the record's branch (task 0101 D1). Clears the draft flag when the record has what a finished one needs (first and last name, kind,
// gender, and an e-mail or a phone); otherwise 409 INCOMPLETE listing what is missing (one detail per missing item, path "missing") and nothing changes. A record that is not a draft is
// returned as it is. A record of another branch is the same 404 as an unknown id.
export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) =>
      structureCall("STAFF_COMPLETE", async () => {
        const result = await completeStaff(auth.userId, (await ctx.params).id);
        if (!result) return gone();
        if (!result.ok)
          return fail(
            `This record is not complete yet. ${missingText(result.missing)}.`,
            409,
            "INCOMPLETE",
            result.missing.map((message) => ({ path: "missing", message })),
          );
        return ok({ staff: result.staff });
      }),
  ),
  { roles: [Role.ADMIN] },
);
