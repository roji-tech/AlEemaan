import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { updateAssignmentSchema } from "@/lib/lms/validation";
import { getAssignmentById, updateAssignment, archiveAssignment, LmsError } from "@/lib/lms/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/lms/assignments/[id]?branchId=...
 */
export const GET = withAuth(
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const assignment = await getAssignmentById(branchId, id);
      return ok(assignment);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode, "NOT_FOUND");
      }
      return fail("Unable to retrieve assignment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * PATCH /api/v1/lms/assignments/[id]
 */
export const PATCH = withAuth(
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = updateAssignmentSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid payload", 400, "VALIDATION");
      }

      const updated = await updateAssignment(branchId, id, parsed.data);
      return ok(updated);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to update assignment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

/**
 * DELETE /api/v1/lms/assignments/[id]?branchId=...
 */
export const DELETE = withAuth(
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      await archiveAssignment(branchId, id);
      return ok({ archived: true });
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to archive assignment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
