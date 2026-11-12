import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { candidates } from "@/lib/programs/people-service";
import { candidatesQuery } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/people/candidates?kind=STUDENT|STAFF&q= - the school's records the caller may add (at most 25; none for a search shorter than 2 characters). */
export const GET = withAuth(
  validate({ query: candidatesQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await candidates(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
