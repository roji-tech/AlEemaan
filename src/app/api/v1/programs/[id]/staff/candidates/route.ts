import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { candidatesFor } from "@/lib/programs/staff-service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/staff/candidates - who could be named a program admin (the active staff of the program's branches). Super admin only. */
export const GET = withAuth(async (_req, auth, { params }: Ctx) => respond(await candidatesFor(auth.userId, (await params).id)), {
  roles: PROGRAM_ROUTE_ROLES,
});
