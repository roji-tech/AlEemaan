import { z } from "zod";
import { Role } from "@prisma/client";
import { noStore } from "@/lib/api/envelope";
import { pagedOk, readPage } from "@/lib/api/paged";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { adminScope } from "@/lib/auth/branch-access";
import { listGuardians } from "@/lib/guardians/service";

// GET /api/v1/guardians?q=&status=blocked|nocode&page=&limit=   Users > Guardians (task 0113 D10): the guardians in the caller's reach, searched by name, phone (any way of writing it) or e-mail, a page at a
// time. Administrators only: a superadmin sees every guardian; a branch administrator those with a child in a branch they administer, counted by their own branches' children (with how
// many more elsewhere, no names). Never cached.
const query = z.object({
  q: z
    .string()
    .trim()
    .max(100, "Search for at most 100 characters.")
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(["blocked", "nocode"]).optional(),
});

export const GET = withAuth(
  validate({ query }, async (req, auth, _ctx: unknown, { query: filters }) => {
    const page = readPage(req, { maxLimit: 50 });
    if (page instanceof Response) return page;
    const { items, total } = await listGuardians(await adminScope(auth.userId), {
      q: filters.q,
      status: filters.status,
      skip: page.skip,
      take: page.take,
    });
    return noStore(pagedOk("guardians", items, page, total));
  }),
  { roles: [Role.ADMIN] },
);
