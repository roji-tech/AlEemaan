import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId } from "@/lib/students/scope";
import { applyScholarshipToOpenInvoices, FinanceError } from "@/lib/finance/service";
import { belongsTo } from "@/lib/scholarships/service";

type Context = { params: Promise<{ id: string; scholarshipId: string }> };

// POST /api/v1/students/[id]/scholarships/[scholarshipId]/apply   "Apply to this pupil's open invoices": adds the scholarship's share to each Unpaid or Part paid invoice of the pupil that does not
// have it yet, never more than the invoice still owes, once per scholarship per invoice (a second press does nothing). Answers how many invoices, how many of them are now settled, and the
// amount in kobo. A superadmin or an administrator of the pupil's branch; the same 404 as unknown otherwise. Audited. Never cached.
const notFound = () => noStore(fail("Scholarship not found", 404, "NOT_FOUND"));

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => studentBranchId((await ctx.params).id), as: "administer", refuse: () => notFound() },
    async (_req, auth, ctx, _input, { branchId }) => {
      const { id: studentId, scholarshipId } = await ctx.params;
      if (!(await belongsTo(studentId, scholarshipId))) return notFound();
      try {
        return noStore(ok(await applyScholarshipToOpenInvoices(branchId, studentId, scholarshipId, auth.userId)));
      } catch (error) {
        if (error instanceof FinanceError) return noStore(fail(error.message, 409, "CONFLICT"));
        throw error;
      }
    },
  ),
  { roles: [Role.ADMIN] },
);
