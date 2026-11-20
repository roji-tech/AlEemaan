import { pagedOk, readPage } from "@/lib/api/paged";
import { withAuth } from "@/lib/auth/with-auth";
import { listInvitationHistory } from "@/lib/invitations/service";
import { scopeOrForbidden } from "@/lib/members/http";

// GET /api/v1/invitations/history   (task 0117, the maintainer, 2026-11-20: "can we keep the record of revoked invites")
// The invitations that are no longer open: accepted, revoked (by whom, when and why: read from the audit rows) and run out. Administrators only; a branch administrator sees their own
// branches' and never an administrator's (the same scope as the open list). Never a token or its hash.
export const GET = withAuth(
  async (req, auth) => {
    const page = readPage(req);
    if (page instanceof Response) return page;
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const { invitations, total } = await listInvitationHistory(page, scope);
    return pagedOk("invitations", invitations, page, total);
  },
  { roles: ["ADMIN"] },
);
