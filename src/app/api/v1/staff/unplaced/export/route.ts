import { z } from "zod";
import { Role, StaffCategory } from "@prisma/client";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/academics/structure";
import { unplacedStaffForExport } from "@/lib/academics/staff";
import { schoolDay } from "@/lib/students/list-filters";
import { resolveSchoolTimeZone } from "@/lib/question-bank/school-day";
import { EXPORT_LIMIT, EXPORT_MAX_IDS, EXPORT_MAX_ROWS, exportFileStem, exportTable, exportValues } from "@/lib/bulk/list-export";

// POST /api/v1/staff/unplaced/export { scope, includeArchived?, ids? }   the staff with no branch yet, as the staff import template's columns (task 0126). Personal data in bulk leaving the
// system, so as the branch export: a SUPERADMIN only (these records belong to no branch; 403 for anyone else), the rows chosen here (live ones, the archived too with "all", or the ids on the
// screen with "shown"), audited as EXPORT_CREATED (who, what, how many; never the data), rate limited with the other exports, never cached.
const cuid = z.string().trim().min(1).max(64);
const body = z.strictObject({
  scope: z.enum(["shown", "all"]),
  includeArchived: z.boolean().optional(),
  ids: z.array(cuid).max(EXPORT_MAX_IDS).optional(),
});
const TOO_MANY = `More than ${EXPORT_MAX_ROWS.toLocaleString("en")} rows: narrow the list with its filters and export it in parts.`;

export const POST = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, input) => {
    if (!(await isSuperAdmin(auth.userId)))
      return noStore(fail("Only a superadmin can export staff who are not placed in a branch.", 403, "FORBIDDEN"));
    const limitKey = `export:user:${auth.userId}`;
    if (!(await reserveAttempt(limitKey, EXPORT_LIMIT)))
      return noStore(
        fail("You have made several exports in the last few minutes. Please wait a few minutes and try again.", 429, "RATE_LIMITED"),
      );
    try {
      const b = input.body;
      const rows = await unplacedStaffForExport(
        { ids: b.scope === "shown" ? (b.ids ?? []) : null, includeArchived: b.includeArchived === true },
        EXPORT_MAX_ROWS + 1,
      );
      if (rows.length > EXPORT_MAX_ROWS) {
        await refundAttempt(limitKey);
        return noStore(fail(TOO_MANY, 413, "TOO_MANY_ROWS"));
      }
      const values = rows.map((r) => exportValues.staff({ ...r, category: r.category as StaffCategory, departments: [] }));
      const { headers, rows: table } = exportTable("staff", values);
      await audit(auth.userId, "EXPORT_CREATED", "StaffRecord", "unplaced", {
        kind: "staff",
        scope: b.scope,
        unplaced: true,
        includeArchived: b.scope === "all" ? Boolean(b.includeArchived) : null,
        filters: b.scope === "shown" ? { ids: b.ids?.length ?? 0 } : null,
        rows: table.length,
      });
      const stem = exportFileStem("staff", "not placed in a branch", schoolDay(new Date(), resolveSchoolTimeZone()), b.scope);
      return noStore(ok({ fileStem: stem, headers, rows: table, count: table.length }));
    } catch (error) {
      await refundAttempt(limitKey);
      console.error("[EXPORT_UNPLACED_ERROR]", error);
      return noStore(fail("The export could not be made. Please try again.", 500, "INTERNAL"));
    }
  }),
  { roles: [Role.ADMIN] },
);
