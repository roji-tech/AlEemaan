import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { classGroupBranchId, classGroupPatch, updateClassGroup } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/class-groups/[id] { name?, sortOrder?, archived? }   Administrators of the class's branch. A class of another branch is the same 404 as
// an unknown id. Nothing is deleted: `archived: true` archives, `archived: false` restores.
export const PATCH = withAuth<Context>(
  validate(
    { body: classGroupPatch },
    withBranch<Parsed<z.infer<typeof classGroupPatch>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => classGroupBranchId((await ctx.params).id),
        as: "administer",
        refuse: () => notFound("Class"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("CLASS_GROUP_UPDATE", async () => {
          const updated = await updateClassGroup(auth.userId, (await ctx.params).id, body);
          return updated ? ok({ classGroup: updated }) : notFound("Class");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
