import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { createTimetableSlotSchema } from "@/lib/timetable/validation";
import { listTimetableSlots, createTimetableSlot, TimetableClashError } from "@/lib/timetable/service";

/**
 * GET /api/v1/timetable?branchId=...&classArmId=...&staffRecordId=...&dayOfWeek=...
 */
export const GET = withAuthGated(
  "read-any",
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const classArmId = searchParams.get("classArmId") ?? undefined;
      const staffRecordId = searchParams.get("staffRecordId") ?? undefined;
      const dayOfWeekParam = searchParams.get("dayOfWeek");
      const dayOfWeek = dayOfWeekParam ? parseInt(dayOfWeekParam, 10) : undefined;

      const slots = await listTimetableSlots({
        branchId,
        classArmId,
        staffRecordId,
        dayOfWeek,
      });

      return ok(slots);
    } catch (error) {
      console.error("[TIMETABLE_LIST_ERROR]", error);
      return fail("Unable to retrieve timetable slots", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT] },
);

/**
 * POST /api/v1/timetable
 * Creates a single timetable slot with real-time clash detection.
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = createTimetableSlotSchema.safeParse(body);

      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid timetable slot payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const authorized = await canAdminister(auth.userId, parsed.data.branchId);
      if (!authorized) {
        return fail("You do not have permission to schedule slots for this branch", 403, "FORBIDDEN");
      }

      const created = await createTimetableSlot(parsed.data.branchId, parsed.data);
      return ok(created, {}, 201);
    } catch (error) {
      if (error instanceof TimetableClashError) {
        return fail(error.message, 409, "SCHEDULE_CLASH", [{ path: "clashes", message: JSON.stringify(error.clashes) }]);
      }
      console.error("[TIMETABLE_CREATE_ERROR]", error);
      return fail("Unable to create timetable slot", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
