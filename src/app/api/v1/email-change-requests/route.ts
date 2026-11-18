import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { pendingFor } from "@/lib/auth/email-change-approval";

// GET /api/v1/email-change-requests — the email-address changes waiting for a decision that THIS administrator may make:
// a branch administrator sees the members of their branches, a superadmin sees everyone's (and is the only one who sees an
// administrator's). Anything they may not decide is simply absent.
export const GET = withAuth(
  async (_req, auth) => {
    const rows = await pendingFor(auth.userId);
    return ok({
      requests: rows.map((r) => ({
        id: r.id,
        newEmail: r.newEmail,
        createdAt: r.createdAt.toISOString(),
        person: r.person,
        needs: r.level,
        roles: r.roles,
      })),
    });
  },
  { roles: [Role.ADMIN] },
);
