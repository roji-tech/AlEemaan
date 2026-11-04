import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { changeStatus } from "@/lib/programs/service";
import { statusSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/programs/[id]/status { action: "activate" | "archive" | "restore" } - restore is a super admin's alone. */
export const POST = withAuth(
  validate({ body: statusSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await changeStatus(auth.userId, (await params).id, body.action)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
