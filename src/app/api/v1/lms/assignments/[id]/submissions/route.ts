import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { submitAssignmentSchema } from "@/lib/lms/validation";
import { submitAssignment, getAssignmentById, LmsError } from "@/lib/lms/service";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/lms/assignments/[id]/submissions?branchId=...
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
      return ok(assignment.submissions);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to retrieve submissions", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] }
);

/**
 * POST /api/v1/lms/assignments/[id]/submissions
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = submitAssignmentSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid submission", 400, "VALIDATION");
      }

      // Resolve student record ID from studentId in payload (admin/teacher testing) or auth.userId
      let studentId = body.studentId;
      if (!studentId) {
        const studentRec = await prisma.studentRecord.findFirst({
          where: { branchId, id: auth.userId },
        });
        studentId = studentRec?.id;
      }

      if (!studentId) {
        return fail("studentId is required to submit work", 400, "VALIDATION");
      }

      const submission = await submitAssignment(branchId, id, studentId, parsed.data);
      return ok(submission, {}, 201);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to submit assignment", 500, "INTERNAL");
    }
  },
  { roles: [Role.STUDENT, Role.ADMIN, Role.TEACHING_STAFF] }
);
