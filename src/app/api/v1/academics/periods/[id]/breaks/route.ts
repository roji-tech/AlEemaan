import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { DomainError } from "@/lib/academics/sessions";
import { branchOfPeriod, breakBodySchema, createBreak } from "@/lib/academics/session-breaks";
import { readJsonBody } from "@/lib/api/validate";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/academics/periods/[id]/breaks
 * Administrators of the term's branch (another branch's term is "not found", like an unknown id). Adds a break (the mid-term or mid-semester holiday) inside one term or semester
 * (task 0098). Body: { label, startDate, endDate } with "YYYY-MM-DD" days, the last day included. It must lie inside the term and not overlap another break of it. One audit entry.
 */
export const POST = withAuth<Context>(
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
    return add(req, admin, context, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const add = withBranch<ReturnType<typeof breakBodySchema.parse>, { userId: string }, Context>(
  {
    of: async (_input, _req, context) => branchOfPeriod((await context.params).id),
    as: "administer",
    refuse: async (_why, context) => fail(`Term "${(await context.params).id}" not found`, 404, "NOT_FOUND"),
  },
  async (_req, admin, context, data) => {
    const { id } = await context.params;
    try {
      const created = await createBreak(id, data);
      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_BREAK_CREATED",
          targetType: "AcademicBreak",
          targetId: created.id,
          afterValue: {
            id: created.id,
            periodId: id,
            branchId: created.branchId,
            label: created.label,
            startDate: created.startDate.toISOString().slice(0, 10),
            endDate: created.endDate.toISOString().slice(0, 10),
          },
        },
      });
      return ok({ break: created }, {}, 201);
    } catch (error: unknown) {
      if (error instanceof DomainError) return fail(error.message, 400, "VALIDATION");
      console.error("[ACADEMIC_BREAK_CREATE_ERROR]", error);
      return fail("Failed to save the break", 500, "INTERNAL");
    }
  },
);
