import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { setStaffGroups } from "@/lib/programs/staff-service";
import { staffGroupsSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string; staffId: string }> };

/**
 * PUT /api/v1/programs/[id]/staff/[staffId]/groups { groupIds } - the groups a teacher or a recorder takes attendance for (replaces the set; an assignment covers the groups inside
 * it). A super admin or a program admin. 409 NO_GROUPS_FOR_ROLE for a supervisor or a program admin, who reach every group.
 */
export const PUT = withAuth(
  validate({ body: staffGroupsSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, staffId } = await params;
    return respond(await setStaffGroups(auth.userId, id, staffId, body.groupIds));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
