import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { offsetMeta, parseOffsetPagination } from "@/lib/api/pagination";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { branchIdField, roleField } from "@/lib/members/http";
import { listMembers } from "@/lib/members/service";

// GET /api/v1/members                                                  (Users pages — a port of Octalve Edu's 0.5.4)
// The school's people — ADMIN only. Offset-paged (the shared helpers: strict, never clamped) and filtered by role, branch, status
// (default: active) and a search over name and address. A person is returned as { id, userId, name, email, role, branch, status,
// joinedAt } and nothing else of their account; `id` is the MEMBERSHIP's id, which every action addresses.
const query = z.object({
  role: roleField.optional(),
  branchId: branchIdField.optional(),
  status: z.enum(["active", "deactivated", "all"]).default("active"),
  q: z
    .string()
    .trim()
    .max(64, "Search for at most 64 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export const GET = withAuth(
  validate({ query }, async (req, _auth, _ctx: unknown, { query: filters }) => {
    const page = parseOffsetPagination(req.nextUrl.searchParams);
    if (!page.ok)
      return fail(
        "Some of the query parameters are not valid.",
        400,
        "VALIDATION",
        page.issues.map((i) => ({ ...i, path: `query.${i.path}` })),
      );
    const { members, total } = await listMembers(filters, page);
    return ok({ members }, offsetMeta({ page: page.page, limit: page.limit, total }));
  }),
  { roles: ["ADMIN"] },
);
