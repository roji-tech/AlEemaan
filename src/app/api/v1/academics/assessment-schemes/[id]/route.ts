import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { schemeBranchId, schemePatch, updateScheme, getScheme } from "@/lib/academics/assessment";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// GET   /api/v1/academics/assessment-schemes/[id]   one scheme with its components and the canonical snapshot (JSON + SHA-256). Any staff role in its branch.
// PATCH /api/v1/academics/assessment-schemes/[id]   edit IN PLACE, only while no result uses it (409 otherwise: make a new version). Administrators of its branch.
// Another branch's scheme is the same 404 as an unknown id.
export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "staff-read", refuse: () => notFound("Scheme") },
    async (_req, _auth, ctx) =>
      structureCall("SCHEME_GET", async () => {
        const found = await getScheme((await ctx.params).id);
        return found ? ok(found) : notFound("Scheme");
      }),
  ),
  { roles: READ_ROLES },
);

export const PATCH = withAuth<Context>(
  validate(
    { body: schemePatch },
    withBranch<Parsed<z.infer<typeof schemePatch>, undefined>, AuthContext, Context>(
      { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Scheme") },
      async (_req, auth, ctx, { body }) =>
        structureCall("SCHEME_UPDATE", async () => {
          const result = await updateScheme(auth.userId, (await ctx.params).id, body);
          return result ? ok(result) : notFound("Scheme");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
