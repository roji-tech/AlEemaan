import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { getCertificate, revokeCertificate } from "@/lib/programs/completion-service";
import { revokeSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ id: string; certId: string }> };

/** GET /api/v1/programs/[id]/certificates/[certId] - one certificate as it was issued, with the code for its QR (for the print page). */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, certId } = await params;
    return respond(await getCertificate(auth.userId, id, certId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/** POST /api/v1/programs/[id]/certificates/[certId] { action: "revoke", reason } - withdraws a certificate with a reason that is kept; it stays on record and the public page says it was withdrawn. */
export const POST = withAuth(
  validate({ body: revokeSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, certId } = await params;
    return respond(await revokeCertificate(auth.userId, id, certId, body.reason));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
