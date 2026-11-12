import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { linkBranch } from "@/lib/programs/service";
import { linkBranchSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/programs/[id]/branches { branchId } - run the program in one more branch. Super admin only. */
export const POST = withAuth(
  validate({ body: linkBranchSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await linkBranch(auth.userId, (await params).id, body.branchId), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
