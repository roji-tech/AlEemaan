import { z } from "zod";
import { GuardianRelationship, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { adminScope } from "@/lib/auth/branch-access";
import { studentBranchId } from "@/lib/students/scope";
import { linkGuardian, setLinkBlocked, unlinkGuardian, guardianDetail } from "@/lib/guardians/service";

type Context = { params: Promise<{ id: string; studentId: string }> };

// PATCH  /api/v1/guardians/[id]/children/[studentId] { blocked?, reason?, relationship?, isMain? }   one guardian and one child (task 0113 D5, D9):
//          blocked true (a reason is required) or false   block or unblock this guardian from this child; their open sessions end;
//          relationship, isMain                           the relationship, or make this guardian the child's main contact.
// DELETE /api/v1/guardians/[id]/children/[studentId]   unlink them (the guardian record stays).
// A superadmin or an administrator of the CHILD's branch (withBranch "administer"); another branch's child, or a guardian who is not this child's, is the same 404 as unknown. Audited.
const body = z
  .strictObject({
    blocked: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
    relationship: z.enum(GuardianRelationship).nullable().optional(),
    isMain: z.literal(true).optional(),
  })
  .refine((b) => b.blocked !== undefined || b.relationship !== undefined || b.isMain !== undefined, { message: "Nothing to change." })
  .refine((b) => b.blocked !== true || (b.reason ?? "").length >= 3, { message: "Say why this guardian is blocked.", path: ["reason"] });

const notFound = () => noStore(fail("This guardian is not linked to that pupil.", 404, "NOT_FOUND"));
const of = async (_input: unknown, _req: unknown, ctx: Context) => studentBranchId((await ctx.params).studentId);

export const PATCH = withAuth<Context>(
  validate<z.infer<typeof body>, undefined, AuthContext, Context>(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of, as: "administer", refuse: () => notFound() },
      async (_req, auth, ctx, { body: change }, { branchId }) => {
        const { id: guardianId, studentId } = await ctx.params;
        const done = await prisma.$transaction(async (tx) => {
          const link = await tx.studentGuardian.findUnique({
            where: { studentId_guardianId: { studentId, guardianId } },
            select: { id: true },
          });
          if (!link) return false;
          if (change.relationship !== undefined || change.isMain !== undefined)
            await linkGuardian(tx, {
              studentId,
              branchId,
              guardianId,
              relationship: change.relationship,
              isMain: change.isMain,
              actorUserId: auth.userId,
            });
          if (change.blocked !== undefined)
            await setLinkBlocked(tx, { studentId, guardianId, blocked: change.blocked, reason: change.reason, actorUserId: auth.userId });
          return true;
        });
        if (!done) return notFound();
        return noStore(ok({ done: true, guardian: await guardianDetail(await adminScope(auth.userId), guardianId) }));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>({ of, as: "administer", refuse: () => notFound() }, async (_req, auth, ctx) => {
    const { id: guardianId, studentId } = await ctx.params;
    const done = await prisma.$transaction((tx) => unlinkGuardian(tx, { studentId, guardianId, actorUserId: auth.userId }));
    return done ? noStore(ok({ done: true })) : notFound();
  }),
  { roles: [Role.ADMIN] },
);
