import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { entryRevisions } from "@/lib/programs/progress-service";

type Ctx = { params: Promise<{ id: string; personId: string; entryId: string }> };

/** GET /api/v1/programs/[id]/progress/people/[personId]/entries/[entryId]/history - every save of the entry (who, when, before, after), oldest first. The table is append-only. */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, personId, entryId } = await params;
    return respond(await entryRevisions(auth.userId, id, personId, entryId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);
