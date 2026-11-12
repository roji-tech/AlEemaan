import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { completePlace } from "@/lib/programs/completion-service";
import { completePlaceSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/**
 * POST /api/v1/programs/[id]/completion/places/[personId] { note?, overrideReason? }
 * Completes one person's place, at any time. A person who does not meet the completion rule needs `overrideReason` (409 `RULE_NOT_MET`); a suspended, expelled or departed person's place is not
 * completed (409 `NOT_APPLICABLE`). A super admin or a program admin.
 */
export const POST = withAuth(
  validate({ body: completePlaceSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await completePlace(auth.userId, id, personId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
