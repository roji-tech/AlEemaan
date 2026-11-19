import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { adminScope } from "@/lib/auth/branch-access";
import { CLASS_SHEET_MAX, classPupils, regenerateClass, signInAddresses } from "@/lib/portal/access-codes";

// GET  /api/v1/students/access-codes?branchId=&classGroupId=&classArmId=   how many pupils a class sheet would make codes for (and replace), before anyone confirms.
// POST /api/v1/students/access-codes { branchId, classGroupId, classArmId?, which, expect }   new pupil codes for every live pupil of that class (or arm), and a code for each pupil's
//                                       main guardian who has none (one per guardian across the sheet, task 0113 D8), returned ONCE as slips to print.
// Task 0113 (task 0094 3a: "Print access codes for this class"). An administrator of that branch or a superadmin (403 for a branch named that is not theirs). `expect` must equal the
// count the screen showed, so a class that changed in between is not replaced blind. At most CLASS_SHEET_MAX pupils (choose an arm beyond that). Audited per pupil, without codes.
const id = z.string().trim().min(1).max(64);
const query = z.object({ branchId: id, classGroupId: id, classArmId: id.optional() });
const body = z.strictObject({
  branchId: id,
  classGroupId: id,
  classArmId: id.optional(),
  which: z.enum(["pupil", "guardian", "both"]),
  expect: z.number().int().min(1).max(CLASS_SHEET_MAX),
});

async function classOf(branchId: string, classGroupId: string, classArmId?: string) {
  const group = await prisma.classGroup.findFirst({ where: { id: classGroupId, branchId, archivedAt: null }, select: { name: true } });
  if (!group) return null;
  if (classArmId && !(await prisma.classArm.findFirst({ where: { id: classArmId, branchId, classGroupId }, select: { id: true } })))
    return null;
  return group;
}
const TOO_MANY = `More than ${CLASS_SHEET_MAX} pupils: choose one arm at a time.`;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "administer" },
      async (_req, _auth, _ctx, { query: q }) => {
        if (!(await classOf(q.branchId, q.classGroupId, q.classArmId))) return noStore(fail("No such class.", 404, "NOT_FOUND"));
        const pupils = await classPupils(q.branchId, q.classGroupId, q.classArmId);
        return noStore(
          ok({ count: Math.min(pupils.length, CLASS_SHEET_MAX + 1), tooMany: pupils.length > CLASS_SHEET_MAX, max: CLASS_SHEET_MAX }),
        );
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body: input }) => {
        if (!(await classOf(input.branchId, input.classGroupId, input.classArmId)))
          return noStore(fail("No such class.", 404, "NOT_FOUND"));
        const pupils = await classPupils(input.branchId, input.classGroupId, input.classArmId);
        if (pupils.length > CLASS_SHEET_MAX) return noStore(fail(TOO_MANY, 413, "TOO_MANY"));
        if (pupils.length !== input.expect)
          return noStore(
            fail(
              `The class now has ${pupils.length} pupils, not ${input.expect}. Look again before replacing their codes.`,
              409,
              "CONFLICT",
            ),
          );
        if (!(await reserveAttempt(`access-code-sheet:${auth.userId}`, 10))) {
          return noStore(fail("Several class sheets were made in the last few minutes. Please wait a few minutes.", 429, "RATE_LIMITED"));
        }
        const slips = await regenerateClass(auth.userId, await adminScope(auth.userId), pupils, input.which);
        return noStore(ok({ slips, signIn: signInAddresses() }));
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
