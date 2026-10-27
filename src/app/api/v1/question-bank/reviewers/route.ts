import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema } from "@/lib/question-bank/validation";
import { addReviewer, listReviewers } from "@/lib/question-bank/reviewers-service";

// Who may review question bank submissions. Who may call: an administrator of the branch named, or a superadmin; only a superadmin sees every branch's reviewers or
// assigns one for every branch (branchId null). The rules about the person and the subject are in reviewers-service.ts.

const Query = z.object({ branchId: idSchema.optional() });

const Body = z
  .object({
    /// null = a reviewer for every branch (superadmin only). A key that is left out is refused: the choice is always explicit.
    branchId: idSchema.nullable(),
    userId: idSchema,
    scope: z.enum(["GENERAL", "SUBJECT"]),
    subjectLabel: z.string().max(120).nullable().optional(),
    isExamApprover: z.boolean().default(false),
  })
  .strict();

/// GET /api/v1/question-bank/reviewers?branchId=...  The branch's reviewers plus the every-branch ones. Without branchId: every row, superadmin only.
export const GET = withAuthGated(
  "administer",
  validate({ query: Query }, async (_req, auth, _ctx, { query }) => {
    if (!query.branchId) {
      if (!(await isSuperAdmin(auth.userId))) return fail("branchId is required", 400, "VALIDATION");
      return ok({ reviewers: await listReviewers(null) });
    }
    const branch = await prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true } });
    if (!branch) return fail("Not found", 404, "NOT_FOUND");
    return ok({ reviewers: await listReviewers(branch.id) });
  }),
  { roles: [Role.ADMIN] },
);

/// POST /api/v1/question-bank/reviewers  { branchId | null, userId, scope, subjectLabel?, isExamApprover? }
export const POST = withAuthGated(
  "administer",
  validate({ body: Body }, async (_req, auth, _ctx, { body }) => {
    const result = await addReviewer({
      actorUserId: auth.userId,
      actorIsSuperAdmin: await isSuperAdmin(auth.userId),
      branchId: body.branchId,
      userId: body.userId,
      scope: body.scope,
      subjectLabel: body.subjectLabel ?? null,
      isExamApprover: body.isExamApprover,
    });
    if (!result.ok) return fail(result.message, result.status, result.code);
    return ok({ reviewer: result.reviewer }, {}, 201);
  }),
  { roles: [Role.ADMIN] },
);
