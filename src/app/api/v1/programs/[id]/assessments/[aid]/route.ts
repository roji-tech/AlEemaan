import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { assessmentAction, getAssessment, updateAssessment } from "@/lib/programs/assessment-service";
import { assessmentActionSchema, updateAssessmentSchema } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ id: string; aid: string }> };

/** GET /api/v1/programs/[id]/assessments/[aid] - the assessment and its sheet: who is on it (once each), their score or code, the grade, what the caller may do (`rights`), and the counts. */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, aid } = await params;
    return respond(await getAssessment(auth.userId, id, aid));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/** PATCH /api/v1/programs/[id]/assessments/[aid] - change the details: a draft anything, an open one only its title, kind, pass mark, weight and `required` (409 `LOCKED_FIELD`). A super admin or a program admin. */
export const PATCH = withAuth(
  validate({ body: updateAssessmentSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, aid } = await params;
    return respond(await updateAssessment(auth.userId, id, aid, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);

/**
 * POST /api/v1/programs/[id]/assessments/[aid] { action: "open" | "mark" | "reopen" | "publish" | "archive" }
 * An administrator any of them; a supervisor only "mark". Marking needs every expected score in (409 `INCOMPLETE`); 409 `NOT_APPLICABLE` when the action does not fit the status.
 */
export const POST = withAuth(
  validate({ body: assessmentActionSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, aid } = await params;
    return respond(await assessmentAction(auth.userId, id, aid, body.action));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
