import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { bulkMarkAttendanceSchema, rollCallQuerySchema, attendanceFailure } from "@/lib/attendance/http";
import { getBranchRollCall, markBranchAttendance } from "@/lib/attendance/service";
import { checkArmAttendanceAccess } from "@/lib/attendance/access";

const STAFF_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;
const WRITE_ROLES = [Role.ADMIN, Role.TEACHING_STAFF] as const;

export const academicsAttendanceQuerySchema = rollCallQuerySchema.extend({
  classArmId: z.string().optional(),
});

export const academicsBulkMarkSchema = bulkMarkAttendanceSchema.extend({
  classArmId: z.string().optional(),
});

/**
 * GET /api/v1/academics/attendance?branchId=...&className=...&arm=...&classArmId=...
 * Staff only. Retrieves roll-call roster with arm permission enforcement.
 */
export const GET = withAuth(
  async (req, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const query = academicsAttendanceQuerySchema.safeParse({
        branchId: searchParams.get("branchId") ?? undefined,
        className: searchParams.get("className") ?? undefined,
        arm: searchParams.get("arm") || undefined,
        classArmId: searchParams.get("classArmId") || undefined,
        date: searchParams.get("date") || undefined,
      });

      if (!query.success) {
        return fail(
          query.error.issues[0]?.message ?? "Invalid query",
          400,
          "VALIDATION",
          query.error.issues.map((i) => ({ path: `query.${i.path.join(".")}`, message: i.message })),
        );
      }

      return rollCallInBranch(req, auth, undefined, query.data);
    } catch (error) {
      console.error("[ACADEMICS_ATTENDANCE_GET_ERROR]", error);
      return fail("Unable to retrieve attendance roll call", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);

const rollCallInBranch = withBranch<z.infer<typeof academicsAttendanceQuerySchema>, AuthContext, unknown>(
  { of: (q) => q.branchId, as: "staff-read", refuse: () => attendanceFailure("NOT_FOUND") },
  async (_req, auth, _ctx, query, { role }) => {
    let armIdToCheck = query.classArmId;
    let resolvedClassName = query.className;
    let resolvedArm = query.arm;

    if (armIdToCheck) {
      const arm = await prisma.classArm.findFirst({
        where: { id: armIdToCheck, branchId: query.branchId, archivedAt: null },
        include: { classGroup: { select: { name: true } } },
      });
      if (arm) {
        resolvedClassName = arm.classGroup.name;
        resolvedArm = arm.name;
      }
    } else if (resolvedArm && resolvedClassName) {
      const arm = await prisma.classArm.findFirst({
        where: { branchId: query.branchId, name: resolvedArm, classGroup: { name: resolvedClassName }, archivedAt: null },
        select: { id: true },
      });
      armIdToCheck = arm?.id;
    }

    if (role !== Role.ADMIN && armIdToCheck) {
      const access = await checkArmAttendanceAccess(query.branchId, auth.userId, armIdToCheck);
      if (!access.allowed) {
        return fail("You do not have permission to view attendance for this arm.", 403, "FORBIDDEN");
      }
    }

    const dateStr = query.date ?? new Date().toISOString().slice(0, 10);
    const result = await getBranchRollCall({
      branchId: query.branchId,
      className: resolvedClassName,
      arm: resolvedArm,
      dateStr,
      actorRole: role,
    });

    if (!result.ok) {
      return attendanceFailure(result.failure);
    }

    return ok(result.data);
  },
);

/**
 * POST /api/v1/academics/attendance
 * Staff only. Records or updates attendance roll call with arm permission enforcement.
 */
export const POST = withAuth(
  validate(
    { body: academicsBulkMarkSchema },
    withBranch<Parsed<z.infer<typeof academicsBulkMarkSchema>, undefined>, AuthContext, unknown>(
      {
        of: ({ body }) => body.branchId,
        as: "staff-write",
        refuse: (why) => attendanceFailure(why === "FORBIDDEN" ? "UNAUTHORIZED" : "NOT_FOUND"),
      },
      async (_req, auth, _ctx, { body }, { role }) => {
        // Enforce arm-scoped permissions for non-admins
        if (role !== Role.ADMIN) {
          const armIdToCheck = body.classArmId;

          if (!armIdToCheck) {
            // Find class arm from students' enrollments
            const studentIds = body.records.map((r) => r.studentId);
            const activeSession = await prisma.academicSession.findFirst({
              where: { branchId: body.branchId, status: "ACTIVE", archivedAt: null },
              select: { id: true },
            });

            if (activeSession) {
              const enrollments = await prisma.studentEnrollment.findMany({
                where: {
                  branchId: body.branchId,
                  sessionId: activeSession.id,
                  studentId: { in: studentIds },
                  status: "ACTIVE",
                },
                select: { classArmId: true, className: true, arm: true },
              });

              for (const e of enrollments) {
                let armId = e.classArmId;
                if (!armId && e.arm) {
                  const foundArm = await prisma.classArm.findFirst({
                    where: { branchId: body.branchId, name: e.arm, classGroup: { name: e.className }, archivedAt: null },
                    select: { id: true },
                  });
                  armId = foundArm?.id ?? null;
                }

                if (armId) {
                  const access = await checkArmAttendanceAccess(body.branchId, auth.userId, armId);
                  if (!access.allowed) {
                    return fail("You do not have permission to mark attendance for this arm.", 403, "FORBIDDEN");
                  }
                } else {
                  return fail("You do not have permission to mark attendance for this arm.", 403, "FORBIDDEN");
                }
              }
            }
          } else {
            const access = await checkArmAttendanceAccess(body.branchId, auth.userId, armIdToCheck);
            if (!access.allowed) {
              return fail("You do not have permission to mark attendance for this arm.", 403, "FORBIDDEN");
            }
          }
        }

        const result = await markBranchAttendance({
          branchId: body.branchId,
          actorUserId: auth.userId,
          actorRole: role,
          input: body,
        });

        if (!result.ok) {
          return attendanceFailure(result.failure);
        }

        return ok(result.data);
      },
    ),
  ),
  { roles: WRITE_ROLES },
);
