import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { issueCertificates, listCertificates } from "@/lib/programs/completion-service";
import { issueSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/certificates - the program's certificates (a super admin and a program admin all; a branch administrator those of people through their own branch). */
export const GET = withAuth(async (_req, auth, { params }: Ctx) => respond(await listCertificates(auth.userId, (await params).id)), {
  roles: PROGRAM_ROUTE_ROLES,
});

/**
 * POST /api/v1/programs/[id]/certificates { participantIds? }
 * Issues certificates for completed places, one, some or all (a person who already has one in force is skipped, so doing it twice makes nothing new). The wording and the name are copied onto
 * each. A super admin or a program admin.
 */
export const POST = withAuth(
  validate({ body: issueSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await issueCertificates(auth.userId, (await params).id, body.participantIds), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
