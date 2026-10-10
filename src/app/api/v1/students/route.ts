import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { listStudents, createStudent, studentInputSchema } from "@/lib/students/service";

/**
 * GET /api/v1/students
 * Authenticated. Lists students with pagination, search, and branch filtering.
 */
export const GET = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;
    const status = (searchParams.get("status") as "live" | "archived" | "all") || "live";
    const q = searchParams.get("q") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

    const result = await listStudents({ branchId, status, q, page, limit });
    return ok(result);
  } catch (error) {
    console.error("[STUDENTS_GET_ERROR]", error);
    return fail("Unable to list students", 500, "INTERNAL");
  }
});

/**
 * POST /api/v1/students
 * Admin-only. Registers a new student, enforcing namesake duplicate detection
 * with audited administrative override (ADR-0011).
 */
export const POST = withAuth(
  async (req, admin) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = studentInputSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid student payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const result = await createStudent(admin.userId, parsed.data);

      if (!result.ok) {
        if (result.code === "POSSIBLE_DUPLICATE") {
          return fail(result.error, 409, "POSSIBLE_DUPLICATE", [{ path: "allowDuplicate", message: result.error }]);
        }
        return fail(result.error, 400, result.code);
      }

      return ok(result.data, {}, 201);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create student";
      console.error("[STUDENT_CREATE_ERROR]", error);
      return fail(msg, 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
