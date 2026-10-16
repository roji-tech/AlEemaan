import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { batchTimetableSlotSchema } from "@/lib/timetable/validation";
import { batchCreateTimetableSlots, TimetableClashError } from "@/lib/timetable/service";

/**
 * POST /api/v1/timetable/batch
 * Schedules a batch of timetable slots with clash verification.
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = batchTimetableSlotSchema.safeParse(body);

      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid batch timetable payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const authorized = await canAdminister(auth.userId, parsed.data.branchId);
      if (!authorized) {
        return fail("You do not have permission to schedule slots for this branch", 403, "FORBIDDEN");
      }

      const result = await batchCreateTimetableSlots(parsed.data.branchId, parsed.data.slots);
      return ok({ count: result.length, slots: result }, {}, 201);
    } catch (error) {
      if (error instanceof TimetableClashError) {
        return fail(error.message, 409, "SCHEDULE_CLASH", [
          { path: "clashes", message: JSON.stringify(error.clashes) },
        ]);
      }
      console.error("[TIMETABLE_BATCH_ERROR]", error);
      return fail("Unable to process batch timetable slots", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
