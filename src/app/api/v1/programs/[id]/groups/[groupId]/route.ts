import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { updateGroup } from "@/lib/programs/structure-service";
import { updateGroupSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string; groupId: string }> };

/** PATCH /api/v1/programs/[id]/groups/[groupId] - exactly one of { name }, { move: "up" | "down" }, { archived: true | false }. Groups are archived, never deleted. */
export const PATCH = withAuth(
  validate({ body: updateGroupSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, groupId } = await params;
    return respond(await updateGroup(auth.userId, id, groupId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
