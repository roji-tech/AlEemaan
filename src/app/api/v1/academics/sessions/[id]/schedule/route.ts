import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { DomainError, getSession, updateSchedule, updateScheduleSchema } from "@/lib/academics/sessions";
import { readJsonBody } from "@/lib/api/validate";

type Context = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/academics/sessions/[id]/schedule
 * Administrators of the session's branch (another branch's session is "not found", like an unknown id). Sets the first and last day of the session and of EVERY term or semester in it
 * in one go (task 0097), checked as a whole: the session ends after it starts, each period lies inside it, in order, without overlap. Body: { startDate, endDate, periods: [{ id, startDate, endDate }] }
 * with "YYYY-MM-DD" days. One transaction, one audit entry with the before and after.
 */
export const PUT = withAuth<Context>(
  async (req, admin, context) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = updateScheduleSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid dates",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return setSchedule(req, admin, context, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const setSchedule = withBranch<ReturnType<typeof updateScheduleSchema.parse>, { userId: string }, Context>(
  {
    of: async (_input, _req, context) => (await getSession((await context.params).id))?.branchId ?? null,
    as: "administer",
    refuse: async (_why, context) => fail(`Academic session "${(await context.params).id}" not found`, 404, "NOT_FOUND"),
  },
  async (_req, admin, context, data) => {
    const { id } = await context.params;
    try {
      const before = await getSession(id);
      if (!before) return fail(`Academic session "${id}" not found`, 404, "NOT_FOUND");
      const updated = await updateSchedule(id, data);
      const shape = (s: NonNullable<typeof before>) => ({
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate.toISOString().slice(0, 10),
        periods: s.periods.map((p) => ({
          id: p.id,
          label: p.label,
          startDate: p.startDate.toISOString().slice(0, 10),
          endDate: p.endDate?.toISOString().slice(0, 10) ?? null,
        })),
      });
      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_SESSION_SCHEDULE_UPDATED",
          targetType: "AcademicSession",
          targetId: id,
          beforeValue: shape(before),
          afterValue: shape(updated!),
        },
      });
      return ok({ session: updated });
    } catch (error: unknown) {
      if (error instanceof DomainError) return fail(error.message, 400, "VALIDATION");
      console.error("[ACADEMIC_SESSION_SCHEDULE_ERROR]", error);
      return fail("Failed to update the dates", 500, "INTERNAL");
    }
  },
);
