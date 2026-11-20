import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { liveSummaries } from "@/lib/scholarships/service";
import { listStudents, createStudent, studentInputSchema } from "@/lib/students/service";
import { readListFilters } from "@/lib/students/list-filters-server";
import { readJsonBody } from "@/lib/api/validate";

const STAFF_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;

/**
 * GET /api/v1/students
 * Staff only (a non-admin sees only the branches they belong to). Lists students with pagination, search, and branch filtering.
 */
export const GET = withAuth(
  async (req, auth) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId") || undefined;
      const status = (searchParams.get("status") as "live" | "archived" | "all") || "live";
      const standingParam = searchParams.get("standing");
      const standing = standingParam === "suspended" || standingParam === "expelled" ? standingParam : undefined;
      const q = searchParams.get("q") || undefined;
      const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

      const visible = await branchIdsFor(auth.userId);
      // A branch the caller does not belong to answers like an unknown one.
      if (branchId && visible !== "all" && !visible.includes(branchId)) return fail("No such branch.", 404, "NOT_FOUND");

      // Class, arm, gender and age (task 0103 D1): validated, and a class or arm of another branch answers like an unknown one.
      const read = await readListFilters(searchParams, branchId);
      if (!read.ok) return read.response;

      // Scholarships are financial (task 0113 S1): only an administrator of a pupil's branch (or a superadmin) is shown them, and only such a person may filter by them (a teacher doing so
      // would learn who holds one from which pupils come back).
      const scope = await adminScope(auth.userId);
      if (read.filters.scholarship && !(branchId ? mayAdminister(scope, branchId) : scope.superAdmin))
        return fail("Scholarships are for the branch's administrators.", 403, "FORBIDDEN");
      const result = await listStudents({ visible, branchId, status, standing, q, filters: read.filters, page, limit });
      const mine = result.students.filter((s) => mayAdminister(scope, s.branchId));
      const held = mine.length > 0 ? await liveSummaries(mine.map((s) => s.id)) : new Map();
      return ok({
        ...result,
        students: result.students.map((s) => (mayAdminister(scope, s.branchId) ? { ...s, scholarships: held.get(s.id) ?? [] } : s)),
      });
    } catch (error) {
      console.error("[STUDENTS_GET_ERROR]", error);
      return fail("Unable to list students", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);

/**
 * POST /api/v1/students
 * Admin-only. Registers a new student, enforcing namesake duplicate detection
 * with audited administrative override (ADR-0011).
 */
export const POST = withAuth(
  async (req, admin) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const body = read.json;

    const parsed = studentInputSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid student payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    // After the body is checked (as before): the caller must administer the branch they name (403 otherwise).
    return createInBranch(req, admin, undefined, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const createInBranch = withBranch<z.infer<typeof studentInputSchema>, { userId: string }, unknown>(
  { of: (input) => input.branchId, as: "administer", where: "body" },
  async (_req, admin, _ctx, data) => {
    try {
      const result = await createStudent(admin.userId, data);

      if (!result.ok) {
        if (result.code === "POSSIBLE_DUPLICATE") {
          return fail(result.error, 409, "POSSIBLE_DUPLICATE", [{ path: "allowDuplicate", message: result.error }]);
        }
        if (result.code === "GUARDIAN_NOT_FOUND")
          return fail(result.error, 404, "NOT_FOUND", [{ path: "guardianId", message: result.error }]);
        return fail(result.error, 400, result.code);
      }

      return ok(result.data, {}, 201);
    } catch (error: unknown) {
      console.error("[STUDENT_CREATE_ERROR]", error);
      // a fixed message: the exception's own text can name tables, columns and values (ISS-0006)
      return fail("Failed to create student.", 500, "INTERNAL");
    }
  },
);
