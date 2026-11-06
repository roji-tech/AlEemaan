import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { feesReport } from "@/lib/programs/fees-service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/fees/report - collected, outstanding and the collection rate overall, per branch and per group, and the people who owe, among the invoices the caller may see. */
export const GET = withAuth(async (_req, auth, { params }: Ctx) => respond(await feesReport(auth.userId, (await params).id)), {
  roles: PROGRAM_ROUTE_ROLES,
});
