import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { updateTimetableSlotSchema } from "@/lib/timetable/validation";
import { getTimetableSlot, updateTimetableSlot, deleteTimetableSlot, TimetableClashError } from "@/lib/timetable/service";
import { readJsonObject } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/timetable/[id]?branchId=...
 */
export const GET = withAuthGated<RouteParams>(
  "read-any",
  async (req: NextRequest, _auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const slot = await getTimetableSlot(branchId, id);
      if (!slot) {
        return fail("Timetable slot not found", 404, "NOT_FOUND");
      }

      return ok(slot);
    } catch (error) {
      console.error("[TIMETABLE_GET_ERROR]", error);
      return fail("Unable to retrieve timetable slot", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT] },
);

/**
 * PATCH /api/v1/timetable/[id]
 */
export const PATCH = withAuth<RouteParams>(
  async (req: NextRequest, auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json as { branchId?: string } & Record<string, unknown>;
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const authorized = await canAdminister(auth.userId, branchId);
      if (!authorized) {
        return fail("You do not have permission to modify timetable slots in this branch", 403, "FORBIDDEN");
      }

      const parsed = updateTimetableSlotSchema.safeParse(body);
      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid update payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const updated = await updateTimetableSlot(branchId, id, parsed.data);
      if (!updated) {
        return fail("Timetable slot not found", 404, "NOT_FOUND");
      }

      return ok(updated);
    } catch (error) {
      if (error instanceof TimetableClashError) {
        return fail(error.message, 409, "SCHEDULE_CLASH", [{ path: "clashes", message: JSON.stringify(error.clashes) }]);
      }
      console.error("[TIMETABLE_UPDATE_ERROR]", error);
      return fail("Unable to update timetable slot", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * DELETE /api/v1/timetable/[id]?branchId=...
 */
export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const authorized = await canAdminister(auth.userId, branchId);
      if (!authorized) {
        return fail("You do not have permission to delete timetable slots in this branch", 403, "FORBIDDEN");
      }

      const deleted = await deleteTimetableSlot(branchId, id);
      if (!deleted) {
        return fail("Timetable slot not found", 404, "NOT_FOUND");
      }

      return ok({ success: true, id: deleted.id });
    } catch (error) {
      console.error("[TIMETABLE_DELETE_ERROR]", error);
      return fail("Unable to delete timetable slot", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
