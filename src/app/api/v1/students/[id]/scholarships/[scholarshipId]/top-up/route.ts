import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId } from "@/lib/students/scope";
import { FinanceError, previewScholarshipTopUp, topUpScholarshipOnOpenInvoices } from "@/lib/finance/service";
import { belongsTo } from "@/lib/scholarships/service";

type Context = { params: Promise<{ id: string; scholarshipId: string }> };

// "Apply the change to open invoices" (task 0113 S1; the maintainer approved it on 2026-11-19), for a scholarship whose share was raised.
// GET  /api/v1/students/[id]/scholarships/[scholarshipId]/top-up   the preview: `{ invoices, kobo }`, how many Unpaid or Part paid invoices that already carry this scholarship would be topped up to
//      its present share and by how much in all; nothing is changed.
// POST /api/v1/students/[id]/scholarships/[scholarshipId]/top-up   does it: raises that scholarship's line on each such invoice by the difference only, never beyond what the invoice still owes;
//      answers `{ toppedUp, settled, kobo }`. A second press, a lowered share and an ended scholarship change nothing (an ended or not-live one is 409).
// A superadmin or an administrator of the pupil's branch; the same 404 as unknown otherwise. Audited (STUDENT_SCHOLARSHIP_TOPPED_UP, no note text). Never cached.
const notFound = () => noStore(fail("Scholarship not found", 404, "NOT_FOUND"));
const adminOf = {
  of: async (_input: unknown, _req: unknown, ctx: Context) => studentBranchId((await ctx.params).id),
  as: "administer" as const,
  refuse: () => notFound(),
};

export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(adminOf, async (_req, _auth, ctx, _input, { branchId }) => {
    const { id: studentId, scholarshipId } = await ctx.params;
    if (!(await belongsTo(studentId, scholarshipId))) return notFound();
    try {
      return noStore(ok(await previewScholarshipTopUp(branchId, studentId, scholarshipId)));
    } catch (error) {
      if (error instanceof FinanceError) return noStore(fail(error.message, 409, "CONFLICT"));
      throw error;
    }
  }),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(adminOf, async (_req, auth, ctx, _input, { branchId }) => {
    const { id: studentId, scholarshipId } = await ctx.params;
    if (!(await belongsTo(studentId, scholarshipId))) return notFound();
    try {
      return noStore(ok(await topUpScholarshipOnOpenInvoices(branchId, studentId, scholarshipId, auth.userId)));
    } catch (error) {
      if (error instanceof FinanceError) return noStore(fail(error.message, 409, "CONFLICT"));
      throw error;
    }
  }),
  { roles: [Role.ADMIN] },
);
