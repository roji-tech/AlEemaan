import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { setLevelLabels } from "@/lib/programs/structure-service";
import { levelsSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/v1/programs/[id]/levels { labels: ["Section", "Class", "Category"] } - the program's own names for its levels (1 to 4), top first. */
export const PUT = withAuth(
  validate({ body: levelsSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await setLevelLabels(auth.userId, (await params).id, body.labels)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
