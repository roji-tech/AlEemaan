import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { classOptions } from "@/lib/programs/people-service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/people/classes - the school's classes the caller may add a whole class from (the branches the program runs in that the caller may manage). */
export const GET = withAuth(async (_req, auth, { params }: Ctx) => respond(await classOptions(auth.userId, (await params).id)), {
  roles: PROGRAM_ROUTE_ROLES,
});
