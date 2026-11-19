import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { overview } from "@/lib/finance/stats-service";

/**
 * GET /api/v1/finance/overview?scope=current|all   (task 0106)
 * Every branch the caller may read the finance of, side by side: one row each (invoiced, collected, outstanding, overdue, rate) and the total. `current` is each branch's own current term
 * (the default), `all` everything ever invoiced. A superadmin reads every branch; an administrator the branches they administer; a branch they do not administer is left out, never named.
 */
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const raw = new URL(req.url).searchParams.get("scope") ?? "current";
      if (raw !== "current" && raw !== "all") return fail("scope must be current or all", 400, "VALIDATION");

      const scope = await adminScope(auth.userId);
      const branchIds = scope.superAdmin ? (await prisma.branch.findMany({ select: { id: true } })).map((b) => b.id) : [...scope.branchIds];
      return ok(await overview(branchIds, raw));
    } catch (error) {
      console.error("[FINANCE_OVERVIEW_ERROR]", error);
      return fail("Unable to read the overview", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
