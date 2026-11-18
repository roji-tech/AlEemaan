import { z } from "zod";
import { pagedOk, readPage } from "@/lib/api/paged";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { branchIdField, roleField, scopeOrForbidden } from "@/lib/members/http";
import { listMembers } from "@/lib/members/service";

// GET /api/v1/members                                                  (Users pages — a port of Octalve Edu's 0.5.4)
// The school's people — administrators only: a superadmin sees everyone, a branch administrator the people of their own branches. Offset-paged (the shared helpers: strict, never clamped) and filtered by role, branch, status
// (default: active), `readsFormResults=true` (only the people who hold CAN_VIEW_FORM_RESULTS) and a search over name and address. A person is returned as { id, userId, name, email, role, branch, status,
// joinedAt } and nothing else of their account; `id` is the MEMBERSHIP's id, which every action addresses.
const query = z.object({
  role: roleField.optional(),
  branchId: branchIdField.optional(),
  status: z.enum(["active", "deactivated", "all"]).default("active"),
  // Only the value `true` exists ("show only the people who read form results"); there is no "false", so anything else is a 400 and a typo cannot silently show everyone.
  readsFormResults: z
    .literal("true")
    .optional()
    .transform((value) => value === "true"),
  q: z
    .string()
    .trim()
    .max(64, "Search for at most 64 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export const GET = withAuth(
  validate({ query }, async (req, auth, _ctx: unknown, { query: filters }) => {
    const page = readPage(req);
    if (page instanceof Response) return page;
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const { members, total } = await listMembers(filters, page, scope);
    return pagedOk("members", members, page, total);
  }),
  { roles: ["ADMIN"] },
);
