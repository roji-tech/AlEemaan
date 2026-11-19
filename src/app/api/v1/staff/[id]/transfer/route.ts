import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { transferPreview, transferStaff } from "@/lib/academics/staff-transfer";

type Context = { params: Promise<{ id: string }> };

// GET  /api/v1/staff/[id]/transfer   what a move would end here (subject assignments, class-teacher roles, attendance grants), for the dialog to say first.
// POST /api/v1/staff/[id]/transfer { toBranchId, mode: "move" | "also" }   task 0114: move the person to another branch, or add them there as well. A superadmin, or an administrator of
// BOTH branches; the record's own branch decides "not found" (404) and the other branch "not yours" (403). See lib/academics/staff-transfer.ts for what is copied and what ends.
const body = z.strictObject({ toBranchId: z.string().trim().min(1).max(64), mode: z.enum(["move", "also"]) });

export const GET = withAuth<Context>(
  async (_req, auth, ctx) => {
    const preview = await transferPreview(await adminScope(auth.userId), (await ctx.params).id);
    return preview ? ok({ ends: preview }) : fail("Staff record not found.", 404, "NOT_FOUND");
  },
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  validate({ body }, async (_req, auth: AuthContext, ctx: Context, { body: input }) => {
    const result = await transferStaff(auth.userId, await adminScope(auth.userId), (await ctx.params).id, input);
    if (!result.ok)
      return fail(result.message, result.status, result.status === 404 ? "NOT_FOUND" : result.status === 403 ? "FORBIDDEN" : "CONFLICT");
    return ok(result);
  }),
  { roles: [Role.ADMIN] },
);
