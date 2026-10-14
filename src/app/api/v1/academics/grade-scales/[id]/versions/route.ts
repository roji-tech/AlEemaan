// POST /api/v1/academics/grade-scales/[id]/versions { name?, bands? }  a change to a scale that results already use: version + 1, the old one archived (the default moves with it).
import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { scaleBranchId, scalePatch, newScaleVersion } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  validate(
    { body: scalePatch },
    withBranch<Parsed<z.infer<typeof scalePatch>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => scaleBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Grade scale") },
      async (_req, auth, ctx, { body }) =>
        structureCall("SCALE_VERSION", async () => {
          const result = await newScaleVersion(auth.userId, (await ctx.params).id, body);
          return result ? ok({ scale: result }, {}, 201) : notFound("Grade scale");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
