import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { GUARDIAN_NOT_FOUND, NOT_EVERY_BRANCH, guardianAuthority, guardianDetail, updateGuardian } from "@/lib/guardians/service";

type Context = { params: Promise<{ id: string }> };

// GET   /api/v1/guardians/[id]   one guardian as Users > Guardians opens it (task 0113 D10): details, their children in the caller's reach (class, branch, relationship, main contact, blocked
//                                with when, by whom and why), how many more elsewhere, and what the caller may do.
// PATCH /api/v1/guardians/[id] { name?, phone?, email? }   their details, for all their children at once (each child's contact columns follow).
// Administrators only. Out of reach is the same 404 as unknown; changing the details needs a superadmin or an administrator of EVERY branch their children are in (403, task 0113 D4).
const patchBody = z
  .strictObject({
    name: z.string().trim().min(2, "Write the guardian's name.").max(100).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z
      .union([z.literal(""), z.email("Write a whole e-mail address.").max(254)])
      .nullable()
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change." });

const notFound = () => noStore(fail(GUARDIAN_NOT_FOUND, 404, "NOT_FOUND"));

export const GET = withAuth<Context>(
  async (_req, auth, ctx) => {
    const detail = await guardianDetail(await adminScope(auth.userId), (await ctx.params).id);
    return detail ? noStore(ok(detail)) : notFound();
  },
  { roles: [Role.ADMIN] },
);

export const PATCH = withAuth<Context>(
  validate<z.infer<typeof patchBody>, undefined, AuthContext, Context>(
    { body: patchBody },
    async (_req, auth, ctx, { body }: Parsed<z.infer<typeof patchBody>, undefined>) => {
      const id = (await ctx.params).id;
      const scope = await adminScope(auth.userId);
      const authority = await guardianAuthority(scope, id);
      if (authority === "none") return notFound();
      if (authority !== "act") return noStore(fail(NOT_EVERY_BRANCH, 403, "FORBIDDEN"));
      await prisma.$transaction((tx) => updateGuardian(tx, id, body, auth.userId));
      return noStore(ok(await guardianDetail(scope, id)));
    },
  ),
  { roles: [Role.ADMIN] },
);
