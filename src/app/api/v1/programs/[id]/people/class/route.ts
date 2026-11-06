import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { addClass } from "@/lib/programs/people-service";
import { addClassSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/programs/[id]/people/class { classArmId, groupId, confirm }
 * A whole class of pupils. Without `confirm: true` it changes nothing and says who would be added and who would be skipped (already in, left, archived, expelled); with it, one
 * audited step adds them all or none.
 */
export const POST = withAuth(
  validate({ body: addClassSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await addClass(auth.userId, (await params).id, body)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
