import { z } from "zod";
import { GuardianRelationship, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { adminScope } from "@/lib/auth/branch-access";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { GUARDIAN_NOT_FOUND, findOrCreateGuardian, guardianInScope, linkGuardian, studentGuardians } from "@/lib/guardians/service";

type Context = { params: Promise<{ id: string }> };

// GET  /api/v1/students/[id]/guardians   the pupil's guardians, the main contact first, blocked ones too (with when, by whom and why), and what the caller may do about each one's details
//                                        and code (task 0113 D9).
// POST /api/v1/students/[id]/guardians { guardianId } | { name, phone?, email? }, relationship?, isMain?   link an existing guardian in the caller's reach (found by phone or e-mail:
//                                        GET /api/v1/guardians/match), or the one with that whole phone and name in reach, or a new one.
// A superadmin or an administrator of the pupil's branch (another branch's pupil is the same 404 as an unknown one). Audited.
const relationship = z.enum(GuardianRelationship).nullable().optional();
const body = z.union([
  z.strictObject({ guardianId: z.string().trim().min(1).max(64), relationship, isMain: z.boolean().optional() }),
  z
    .strictObject({
      name: z.string().trim().min(2, "Write the guardian's name.").max(100),
      phone: z.string().trim().max(40).nullable().optional(),
      email: z
        .union([z.literal(""), z.email("Write a whole e-mail address.").max(254)])
        .nullable()
        .optional(),
      relationship,
      isMain: z.boolean().optional(),
    })
    .refine((b) => Boolean(b.phone?.trim() || b.email?.trim()), {
      message: "Give the guardian's phone number or e-mail address.",
      path: ["phone"],
    }),
]);
type Body = z.infer<typeof body>;

const of = async (_input: unknown, _req: unknown, ctx: Context) => studentBranchId((await ctx.params).id);

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>({ of, as: "administer", refuse: studentNotFound }, async (_req, auth, ctx) =>
    noStore(ok({ guardians: await studentGuardians(await adminScope(auth.userId), (await ctx.params).id) })),
  ),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  validate<Body, undefined, AuthContext, Context>(
    { body },
    withBranch<Parsed<Body, undefined>, AuthContext, Context>(
      { of, as: "administer", refuse: studentNotFound },
      async (_req, auth, ctx, { body: input }, { branchId }) => {
        const pupilId = (await ctx.params).id;
        const scope = await adminScope(auth.userId);
        const pupil = await prisma.studentRecord.findUnique({ where: { id: pupilId }, select: { archivedAt: true } });
        if (!pupil || pupil.archivedAt) return noStore(fail("Restore this pupil before changing their guardians.", 409, "CONFLICT"));
        const linked = await prisma.$transaction(async (tx) => {
          let guardianId: string;
          if ("guardianId" in input) {
            const found = await tx.guardian.findFirst({
              where: { id: input.guardianId, archivedAt: null, ...guardianInScope(scope) },
              select: { id: true },
            });
            if (!found) return null;
            guardianId = found.id;
          } else {
            guardianId = (await findOrCreateGuardian(tx, scope, input, auth.userId)).id;
          }
          await linkGuardian(tx, {
            studentId: pupilId,
            branchId,
            guardianId,
            relationship: input.relationship,
            isMain: input.isMain,
            actorUserId: auth.userId,
          });
          return guardianId;
        });
        if (!linked) return noStore(fail(GUARDIAN_NOT_FOUND, 404, "NOT_FOUND"));
        return noStore(ok({ guardianId: linked, guardians: await studentGuardians(scope, pupilId) }, undefined, 201));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
