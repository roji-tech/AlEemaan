import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { createGroup } from "@/lib/programs/structure-service";
import { createGroupSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/programs/[id]/groups { parentId?, name } - add a group at the top level, or inside another group (one level below it). */
export const POST = withAuth(
  validate({ body: createGroupSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await createGroup(auth.userId, (await params).id, body), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
