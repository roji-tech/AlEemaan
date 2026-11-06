import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { z } from "zod";
import { ID_PATTERN } from "@/lib/api/ids";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { scoreHistory } from "@/lib/programs/assessment-service";

type Ctx = { params: Promise<{ id: string; aid: string }> };

/** GET /api/v1/programs/[id]/assessments/[aid]/history?personId= - every entry and change of one person's score, newest first (who, when, from, to, why). Only people the caller may see. */
export const GET = withAuth(
  validate({ query: z.object({ personId: z.string().regex(ID_PATTERN) }) }, async (_req, auth, { params }: Ctx, { query }) => {
    const { id, aid } = await params;
    return respond(await scoreHistory(auth.userId, id, aid, query.personId));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
