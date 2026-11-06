import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { saveWeek } from "@/lib/programs/progress-service";
import { weekSchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/**
 * PUT /api/v1/programs/[id]/progress/people/[personId]/week { rows: [{ id?, trackKey, entryDate, values, version? }], submit? }
 * The week grid that mirrors the paper booklet: up to 30 rows of one person, new or changed (a changed one carries its `version`), all or nothing - every row is checked before the first is written.
 */
export const PUT = withAuth(
  validate({ body: weekSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await saveWeek(auth.userId, id, personId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
