import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { reopenPlace } from "@/lib/programs/completion-service";
import { reopenSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** POST /api/v1/programs/[id]/completion/places/[personId]/reopen { reason } - reopens a completed place, with a reason that is kept. A super admin only; 409 `HAS_CERTIFICATE` until the certificate is withdrawn. */
export const POST = withAuth(
  validate({ body: reopenSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await reopenPlace(auth.userId, id, personId, body.reason));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
