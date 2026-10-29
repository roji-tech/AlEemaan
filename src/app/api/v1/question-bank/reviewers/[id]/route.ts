import type { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/api/ids";
import { canAdminister, isSuperAdmin } from "@/lib/auth/branch-access";
import { removeReviewer } from "@/lib/question-bank/reviewers-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/// DELETE /api/v1/question-bank/reviewers/[id]  Removes one assignment. The branch comes from the ROW, not from the request, so there is nothing to forge: the caller must
/// administer that branch (or be a superadmin; an every-branch row is a superadmin's alone). Unknown and not yours are the same 404.
export const DELETE = withAuth(
  async (_req: NextRequest, auth, { params }: RouteParams) => {
    const { id } = await params;
    if (!isPlausibleId(id)) return fail("Not found", 404, "NOT_FOUND"); // a NUL byte would be a database error, not a missing row
    const result = await removeReviewer({
      actorUserId: auth.userId,
      actorIsSuperAdmin: await isSuperAdmin(auth.userId),
      id,
      canAdministerBranch: (branchId) => canAdminister(auth.userId, branchId),
    });
    if (!result.ok) return fail(result.message, result.status, result.code);
    return ok({ removed: true });
  },
  { roles: [Role.ADMIN] },
);
