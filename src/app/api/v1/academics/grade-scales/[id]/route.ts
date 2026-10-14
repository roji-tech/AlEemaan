import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { scaleBranchId, scalePatch, updateScale } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/grade-scales/[id] { name?, bands? }   edit IN PLACE, only while no result uses it (409 otherwise: make a new version). Administrators of its
// branch; another branch's scale is the same 404 as an unknown id.
export const PATCH = withAuth<Context>(
  validate(
    { body: scalePatch },
    withBranch<Parsed<z.infer<typeof scalePatch>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => scaleBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Grade scale") },
      async (_req, auth, ctx, { body }) =>
        structureCall("SCALE_UPDATE", async () => {
          const result = await updateScale(auth.userId, (await ctx.params).id, body);
          return result ? ok(result) : notFound("Grade scale");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
