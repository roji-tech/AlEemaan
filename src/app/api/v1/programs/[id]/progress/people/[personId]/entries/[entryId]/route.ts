import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { entryAction, updateEntry } from "@/lib/programs/progress-service";
import { entryActionSchema, updateEntrySchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ id: string; personId: string; entryId: string }> };

/**
 * PATCH /api/v1/programs/[id]/progress/people/[personId]/entries/[entryId] { values, version, submit? }
 * Change an entry. The `version` is the one the screen opened; a stale one is 409 `CHANGED` naming who changed it. 409 `LOCKED` while someone else holds the entry. With verification on, a
 * verified entry goes back to submitted (families keep seeing its last verified copy).
 */
export const PATCH = withAuth(
  validate({ body: updateEntrySchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId, entryId } = await params;
    return respond(await updateEntry(auth.userId, id, personId, entryId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);

/**
 * POST /api/v1/programs/[id]/progress/people/[personId]/entries/[entryId] { action: "verify" | "return" | "submit", version, comment? }
 * submit: the writer hands a draft in. verify: an administrator or a supervisor confirms a submitted entry (403 `FOUR_EYES` for the person who last edited it). return: back to a draft, with
 * a comment the writer sees.
 */
export const POST = withAuth(
  validate({ body: entryActionSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId, entryId } = await params;
    return respond(await entryAction(auth.userId, id, personId, entryId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
