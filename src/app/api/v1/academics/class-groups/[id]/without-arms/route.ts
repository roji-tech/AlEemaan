// POST /api/v1/academics/class-groups/[id]/without-arms   (task 0132) lets a class work with no arms of its own: it gets one flagged default arm ("Main") that holds its pupils, marks and attendance and that
// the Classes tab does not show as an arm. Administrators of the class's branch; another branch's class is the same 404 as an unknown id. Safe to repeat. A class with exactly ONE live arm is converted (task 0135: that arm becomes the default arm); 409 for an archived class or one with two or more arms.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { classGroupBranchId, classWithoutArms } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => classGroupBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Class") },
    async (_req, auth, ctx) =>
      structureCall("CLASS_WITHOUT_ARMS", async () => {
        const arm = await classWithoutArms(auth.userId, (await ctx.params).id);
        return arm ? ok({ arm }) : notFound("Class");
      }),
  ),
  { roles: [Role.ADMIN] },
);
