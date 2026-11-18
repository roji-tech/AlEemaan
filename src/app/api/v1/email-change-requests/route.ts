import { Role } from "@prisma/client";
import { pagedOk, readPage, slicePage } from "@/lib/api/paged";
import { withAuth } from "@/lib/auth/with-auth";
import { pendingFor } from "@/lib/auth/email-change-approval";

// GET /api/v1/email-change-requests — the email-address changes waiting for a decision that THIS administrator may make:
// a branch administrator sees the members of their branches, a superadmin sees everyone's (and is the only one who sees an
// administrator's). Anything they may not decide is simply absent.
export const GET = withAuth(
  async (req, auth) => {
    const page = readPage(req, { defaultLimit: 20, maxLimit: 50 });
    if (page instanceof Response) return page;
    // What this caller may decide is worked out per person (a rule the database cannot express), so the list is built in memory and then paged.
    const { items, total } = slicePage(await pendingFor(auth.userId), page);
    return pagedOk(
      "requests",
      items.map((r) => ({
        id: r.id,
        newEmail: r.newEmail,
        createdAt: r.createdAt.toISOString(),
        person: r.person,
        needs: r.level,
        roles: r.roles,
      })),
      page,
      total,
    );
  },
  { roles: [Role.ADMIN] },
);
