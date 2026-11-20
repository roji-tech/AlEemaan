import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { ScholarshipError, typeBranchId, updateType } from "@/lib/scholarships/service";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/finance/scholarship-types/[id] { name?, percent?, description?, archived? }   change a type, archive it (pupils who hold it keep it) or bring it back.
// A type's share is the DEFAULT for new scholarships: scholarships already granted keep theirs. An administrator of the type's branch or a superadmin; another branch's type is the same 404
// as an unknown one. Audited.
const body = z
  .strictObject({
    name: z.string().trim().min(2, "Give the scholarship a name.").max(80).optional(),
    percent: z.number().int("The share must be a whole number.").min(1).max(100).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change." });

const notFound = () => noStore(fail("Scholarship type not found", 404, "NOT_FOUND"));

export const PATCH = withAuth<Context>(
  validate<z.infer<typeof body>, undefined, AuthContext, Context>(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => typeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound() },
      async (_req, auth, ctx, { body: patch }) => {
        try {
          const type = await updateType(auth.userId, (await ctx.params).id, patch);
          return type ? noStore(ok({ type })) : notFound();
        } catch (error) {
          if (error instanceof ScholarshipError) return noStore(fail(error.message, error.status, error.code));
          throw error;
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
