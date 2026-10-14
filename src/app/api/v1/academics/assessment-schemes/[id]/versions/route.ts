// POST /api/v1/academics/assessment-schemes/[id]/versions { name?, totalMax?, examMax?, components? }  a change to a scheme that results already use: version + 1, the old one archived. Administrators of its branch.
import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { schemeBranchId, schemePatch, newSchemeVersion } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  validate(
    { body: schemePatch },
    withBranch<Parsed<z.infer<typeof schemePatch>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Scheme") },
      async (_req, auth, ctx, { body }) =>
        structureCall("SCHEME_VERSION", async () => {
          const result = await newSchemeVersion(auth.userId, (await ctx.params).id, body);
          return result ? ok({ scheme: result }, {}, 201) : notFound("Scheme");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
