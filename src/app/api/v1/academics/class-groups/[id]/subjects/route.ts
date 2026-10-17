import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { classGroupBranchId, offeringsInput, setOfferings } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PUT /api/v1/academics/class-groups/[id]/subjects { subjectIds }   Replaces the set of subjects this class studies. Administrators of the class's branch; only live
// subjects of that same branch may be named (409 otherwise).
export const PUT = withAuth<Context>(
  validate(
    { body: offeringsInput },
    withBranch<Parsed<z.infer<typeof offeringsInput>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => classGroupBranchId((await ctx.params).id),
        as: "administer",
        refuse: () => notFound("Class"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("OFFERINGS_SET", async () => {
          const subjectIds = await setOfferings(auth.userId, (await ctx.params).id, body.subjectIds);
          return subjectIds ? ok({ subjectIds }) : notFound("Class");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
