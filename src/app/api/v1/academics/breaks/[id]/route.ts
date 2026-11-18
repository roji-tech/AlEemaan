import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { DomainError } from "@/lib/academics/sessions";
import { branchOfBreak, breakBodySchema, getBreak, removeBreak, updateBreak } from "@/lib/academics/session-breaks";
import { readJsonBody } from "@/lib/api/validate";

type Context = { params: Promise<{ id: string }> };

const shape = (b: { id: string; periodId: string; branchId: string; label: string; startDate: Date; endDate: Date }) => ({
  id: b.id,
  periodId: b.periodId,
  branchId: b.branchId,
  label: b.label,
  startDate: b.startDate.toISOString().slice(0, 10),
  endDate: b.endDate.toISOString().slice(0, 10),
});

const options = {
  of: async (_input: unknown, _req: unknown, context: Context) => branchOfBreak((await context.params).id),
  as: "administer" as const,
  refuse: async (_why: unknown, context: Context) => fail(`Break "${(await context.params).id}" not found`, 404, "NOT_FOUND"),
};

/**
 * PATCH /api/v1/academics/breaks/[id]   body { label, startDate, endDate }
 * DELETE /api/v1/academics/breaks/[id]
 * Administrators of the break's branch (another branch's break is "not found", like an unknown id). Changes or removes a break (task 0098); the same rules as adding one (inside its term, no
 * overlap). A removed break is archived, never deleted. An announcement already sent about it is not withdrawn. One audit entry with the before and after.
 */
export const PATCH = withAuth<Context>(
  async (req, admin, context) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = breakBodySchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid break",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return change(req, admin, context, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const change = withBranch<ReturnType<typeof breakBodySchema.parse>, { userId: string }, Context>(
  options,
  async (_req, admin, context, data) => {
    const { id } = await context.params;
    try {
      const before = await getBreak(id);
      if (!before) return fail(`Break "${id}" not found`, 404, "NOT_FOUND");
      const updated = await updateBreak(id, data);
      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_BREAK_UPDATED",
          targetType: "AcademicBreak",
          targetId: id,
          beforeValue: shape(before),
          afterValue: shape(updated),
        },
      });
      return ok({ break: updated });
    } catch (error: unknown) {
      if (error instanceof DomainError) return fail(error.message, 400, "VALIDATION");
      console.error("[ACADEMIC_BREAK_UPDATE_ERROR]", error);
      return fail("Failed to save the break", 500, "INTERNAL");
    }
  },
);

export const DELETE = withAuth<Context>((req, admin, context) => remove(req, admin, context, undefined), { roles: [Role.ADMIN] });

const remove = withBranch<undefined, { userId: string }, Context>(options, async (_req, admin, context) => {
  const { id } = await context.params;
  try {
    const before = await getBreak(id);
    if (!before) return fail(`Break "${id}" not found`, 404, "NOT_FOUND");
    await removeBreak(id);
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.userId,
        action: "ACADEMIC_BREAK_REMOVED",
        targetType: "AcademicBreak",
        targetId: id,
        beforeValue: shape(before),
      },
    });
    return ok({ removed: true });
  } catch (error: unknown) {
    if (error instanceof DomainError) return fail(error.message, 400, "VALIDATION");
    console.error("[ACADEMIC_BREAK_REMOVE_ERROR]", error);
    return fail("Failed to remove the break", 500, "INTERNAL");
  }
});
