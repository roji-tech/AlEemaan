import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { subjectBranchId, subjectPatch, updateSubject } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/subjects/[id] { name?, code?, archived? }   Administrators of the subject's branch; another branch's subject is the same 404 as an unknown id.
export const PATCH = withAuth<Context>(
  validate(
    { body: subjectPatch },
    withBranch<Parsed<z.infer<typeof subjectPatch>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => subjectBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Subject") },
      async (_req, auth, ctx, { body }) =>
        structureCall("SUBJECT_UPDATE", async () => {
          const updated = await updateSubject(auth.userId, (await ctx.params).id, body);
          return updated ? ok({ subject: updated }) : notFound("Subject");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
