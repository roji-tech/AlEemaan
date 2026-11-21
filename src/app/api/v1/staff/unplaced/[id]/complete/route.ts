import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { completeStaff, isUnplaced } from "@/lib/academics/staff";
import { missingText } from "@/lib/drafts/rules";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// POST /api/v1/staff/unplaced/[id]/complete   (task 0127) Finishes a draft record that has no branch yet. A SUPERADMIN only; for anyone else, and for a record that IS placed (it is completed
// through /api/v1/staff/[id]/complete), the same 404 as an unknown id. As for any record: the draft flag is cleared when it has what a finished one needs (first and last name, kind, gender, and an
// e-mail or a phone); otherwise 409 INCOMPLETE listing what is missing and nothing changes. A record that is not a draft is returned as it is.
export const POST = withAuth<Context>(
  async (_req, auth: AuthContext, ctx: Context) => {
    const id = (await ctx.params).id;
    if (!(await isSuperAdmin(auth.userId)) || (await isUnplaced(id)) !== true) return gone();
    return structureCall("STAFF_UNPLACED_COMPLETE", async () => {
      const result = await completeStaff(auth.userId, id);
      if (!result) return gone();
      if (!result.ok)
        return fail(
          `This record is not complete yet. ${missingText(result.missing)}.`,
          409,
          "INCOMPLETE",
          result.missing.map((message) => ({ path: "missing", message })),
        );
      return ok({ staff: result.staff });
    });
  },
  { roles: [Role.ADMIN] },
);
