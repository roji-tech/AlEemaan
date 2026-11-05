import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { setPlace } from "@/lib/programs/people-service";
import { placeSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** POST /api/v1/programs/[id]/people/[personId]/place { action: "withdraw" | "reenrol", reason, groupId? } - end a place today (nothing is deleted) or open it again. */
export const POST = withAuth(
  validate({ body: placeSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(
      await setPlace(auth.userId, id, personId, {
        action: body.action === "withdraw" ? "WITHDRAW" : "REENROL",
        reason: body.reason,
        groupId: body.groupId,
      }),
    );
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
