import { NextRequest } from "next/server";
import { Role, InvoiceStatus } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { generateInvoicesSchema } from "@/lib/finance/validation";
import { listInvoices, generateInvoices, FinanceError } from "@/lib/finance/service";

/**
 * GET /api/v1/finance/invoices?branchId=...&periodId=...&studentId=...&status=...&page=...&limit=...
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const periodId = searchParams.get("periodId") ?? undefined;
      const studentId = searchParams.get("studentId") ?? undefined;
      const statusParam = searchParams.get("status") as InvoiceStatus | null;
      const status = statusParam && Object.values(InvoiceStatus).includes(statusParam) ? statusParam : undefined;

      const pageParam = searchParams.get("page");
      const page = pageParam ? parseInt(pageParam, 10) : undefined;
      const limitParam = searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      const result = await listInvoices(branchId, {
        periodId,
        studentId,
        status,
        page,
        limit,
      });

      return ok(result);
    } catch (error) {
      console.error("[INVOICES_LIST_ERROR]", error);
      return fail("Unable to retrieve invoices", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);

/**
 * POST /api/v1/finance/invoices
 * Triggers idempotent batch invoice generation for active enrolled students.
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = generateInvoicesSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid generation payload", 400, "VALIDATION");
      }

      const { branchId, periodId, classGroupId, dueDate } = parsed.data;

      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: You do not have permission to generate invoices for this branch", 403, "FORBIDDEN");
      }

      const result = await generateInvoices(branchId, {
        periodId,
        classGroupId: classGroupId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        actorUserId: auth.user.id,
      });

      return ok(result, {}, 201);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      console.error("[INVOICES_GENERATE_ERROR]", error);
      return fail("Failed to generate invoices", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
