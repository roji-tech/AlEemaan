import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { editPerson, getPerson } from "@/lib/programs/people-service";
import { editPersonSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** GET /api/v1/programs/[id]/people/[personId] - one person and everything done to their place, newest first. A person the caller may not see is a 404. */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, personId } = await params;
    return respond(await getPerson(auth.userId, id, personId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/** PATCH /api/v1/programs/[id]/people/[personId] - the details of a person who was typed in. A pupil's or a member of staff's details are the school's record: 409 LINKED. */
export const PATCH = withAuth(
  validate({ body: editPersonSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await editPerson(auth.userId, id, personId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
