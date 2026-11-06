import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { ok } from "@/lib/api/envelope";
import { listInvoices } from "@/lib/programs/fees-service";
import { invoicesQuery } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/fees/invoices?status&groupId&branchId&periodKey&q&page - the invoices the caller may see (a branch administrator only those through their own branches), 50 to a page. */
export const GET = withAuth(
  validate({ query: invoicesQuery }, async (_req, auth, { params }: Ctx, { query }) => {
    const result = await listInvoices(auth.userId, (await params).id, query);
    return result.ok
      ? ok(
          { invoices: result.data.invoices },
          { total: result.data.total, page: result.data.page, pageSize: result.data.pageSize, hasNext: result.data.hasNext },
        )
      : respond(result);
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
