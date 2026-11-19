import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { adminScope } from "@/lib/auth/branch-access";
import { notFound } from "@/lib/academics/structure-http";
import { staffBranchId } from "@/lib/academics/staff";
import { transferPreview, transferStaff } from "@/lib/academics/staff-transfer";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// GET  /api/v1/staff/[id]/transfer   what a move would end here (subject assignments, class-teacher roles, attendance grants), for the dialog to say first.
// POST /api/v1/staff/[id]/transfer { toBranchId, mode: "move" | "also" }   task 0112: move the person to another branch, or add them there as well. A superadmin, or an administrator of
// BOTH branches: the record's own branch is checked here (withBranch: not yours is the same 404 as unknown), the other branch in the service (not yours: 403).
// See lib/academics/staff-transfer.ts for what is copied and what ends.
const body = z.strictObject({ toBranchId: z.string().trim().min(1).max(64), mode: z.enum(["move", "also"]) });

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) => {
      const preview = await transferPreview(await adminScope(auth.userId), (await ctx.params).id);
      return preview ? ok({ ends: preview }) : gone();
    },
  ),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
      async (_req, auth, ctx, { body: input }) => {
        const result = await transferStaff(auth.userId, await adminScope(auth.userId), (await ctx.params).id, input);
        if (!result.ok)
          return fail(
            result.message,
            result.status,
            result.status === 404 ? "NOT_FOUND" : result.status === 403 ? "FORBIDDEN" : "CONFLICT",
          );
        return ok(result);
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
