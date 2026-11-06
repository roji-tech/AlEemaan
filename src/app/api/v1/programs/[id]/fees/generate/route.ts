import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { generateInvoices, previewInvoices } from "@/lib/programs/fees-service";
import { generateSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/programs/[id]/fees/generate { periodKey, confirm? }
 * Without `confirm: true` it only says who would get an invoice, who is skipped and why, and the total. With it, one step under the program's lock makes them (at most 2,000 at a time;
 * running it again makes nothing new). A super admin or a program admin; an archived or completed program refuses.
 */
export const POST = withAuth(
  validate({ body: generateSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id } = await params;
    if (body.confirm) return respond(await generateInvoices(auth.userId, id, body.periodKey));
    return respond(await previewInvoices(auth.userId, id, body.periodKey));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
