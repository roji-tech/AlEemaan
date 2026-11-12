import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { programResults } from "@/lib/programs/assessment-service";
import { resultsQuery } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/assessments/results?groupId= - each person's results across the PUBLISHED assessments that apply to them, with the weighted average and grade. Only people the caller may see. */
export const GET = withAuth(
  validate({ query: resultsQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await programResults(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
