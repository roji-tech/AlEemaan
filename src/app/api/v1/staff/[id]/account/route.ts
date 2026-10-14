import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { linkAccount, linkInput, linkableAccounts, staffBranchId, unlinkAccount } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// GET    /api/v1/staff/[id]/account   members of the branch that may be linked (active, matching role, not already linked). Administrators of the record's branch.
// PUT    /api/v1/staff/[id]/account { userId }   links the record to that member. Only an active member of the SAME branch whose role fits the category.
// DELETE /api/v1/staff/[id]/account   clears the link; the account and membership are untouched.
const adminOf = {
  of: async (_input: unknown, _req: unknown, ctx: Context) => staffBranchId((await ctx.params).id),
  as: "administer" as const,
  refuse: gone,
};

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(adminOf, async (_req, _auth, ctx) =>
    structureCall("STAFF_LINKABLE", async () => ok({ accounts: await linkableAccounts((await ctx.params).id) })),
  ),
  { roles: [Role.ADMIN] },
);

export const PUT = withAuth<Context>(
  validate(
    { body: linkInput },
    withBranch<Parsed<z.infer<typeof linkInput>, undefined>, AuthContext, Context>(adminOf, async (_req, auth, ctx, { body }) =>
      structureCall("STAFF_LINK", async () => {
        const staff = await linkAccount(auth.userId, (await ctx.params).id, body);
        return staff ? ok({ staff }) : gone();
      }),
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(adminOf, async (_req, auth, ctx) =>
    structureCall("STAFF_UNLINK", async () => {
      const staff = await unlinkAccount(auth.userId, (await ctx.params).id);
      return staff ? ok({ staff }) : gone();
    }),
  ),
  { roles: [Role.ADMIN] },
);
