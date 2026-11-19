import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { ScholarshipError, grant, listForStudent, listTypes } from "@/lib/scholarships/service";
import { openInvoicesFor, previewScholarshipTopUp } from "@/lib/finance/service";
import { prisma } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

// GET  /api/v1/students/[id]/scholarships   the pupil's scholarships (live first), what each could still be applied to (the open invoices without it) and what a raised share would top up (`topUp`), and the branch's current types to grant.
// POST /api/v1/students/[id]/scholarships { typeId, percent?, startsOn?, endsOn?, note? }   grant one: the share defaults to the type's; a pupil's live shares together may not pass 100 (409).
// Task 0113 S1. Financial: only an administrator of the pupil's branch or a superadmin (a teacher is 403; another branch's pupil is the same 404 as an unknown one). Audited. Never cached.
const day = z
  .union([z.literal(""), z.iso.date("Write the day as YYYY-MM-DD.")])
  .nullable()
  .optional();
const body = z.strictObject({
  typeId: z.string().trim().min(1).max(64),
  percent: z
    .number()
    .int("The share must be a whole number.")
    .min(1, "The share is at least 1%.")
    .max(100, "The share is at most 100%.")
    .optional(),
  startsOn: day,
  endsOn: day,
  note: z.string().trim().max(300).nullable().optional(),
});

const of = async (_input: unknown, _req: unknown, ctx: Context) => studentBranchId((await ctx.params).id);

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>({ of, as: "administer", refuse: studentNotFound }, async (_req, _auth, ctx) => {
    const id = (await ctx.params).id;
    const pupil = await prisma.studentRecord.findUniqueOrThrow({ where: { id }, select: { branchId: true } });
    const scholarships = await listForStudent(id);
    const withOpen = await Promise.all(
      scholarships.map(async (s) => ({
        ...s,
        openInvoices: s.live ? (await openInvoicesFor(prisma, pupil.branchId, id, s.id)).length : 0,
        // What a raised share would add to the invoices that already carry it ("Apply the change to open invoices"); nothing when it is not live.
        topUp: s.live ? await previewScholarshipTopUp(pupil.branchId, id, s.id) : { invoices: 0, kobo: 0 },
      })),
    );
    return noStore(
      ok({
        scholarships: withOpen,
        types: (await listTypes(pupil.branchId, false)).map(({ id, name, percent }) => ({ id, name, percent })),
      }),
    );
  }),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  validate<z.infer<typeof body>, undefined, AuthContext, Context>(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of, as: "administer", refuse: studentNotFound },
      async (_req, auth, ctx, { body: input }, { branchId }) => {
        const studentId = (await ctx.params).id;
        const pupil = await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { archivedAt: true } });
        if (!pupil || pupil.archivedAt) return noStore(fail("Restore this pupil before granting a scholarship.", 409, "CONFLICT"));
        try {
          return noStore(ok({ scholarship: await grant(auth.userId, { ...input, branchId, studentId }) }, {}, 201));
        } catch (error) {
          if (error instanceof ScholarshipError) return noStore(fail(error.message, error.status, error.code));
          throw error;
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
