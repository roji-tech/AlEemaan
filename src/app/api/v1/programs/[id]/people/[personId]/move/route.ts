import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { movePerson } from "@/lib/programs/people-service";
import { movePersonSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** POST /api/v1/programs/[id]/people/[personId]/move { groupId } - move an open place to another live group of the same program. Their branch does not change. */
export const POST = withAuth(
  validate({ body: movePersonSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await movePerson(auth.userId, id, personId, body.groupId));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
