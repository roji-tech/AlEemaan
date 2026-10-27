import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { setCurrentPeriod, DomainError } from "@/lib/academics/sessions";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/validate";

type Context = { params: Promise<{ id: string }> };

const patchPeriodSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
  isCurrent: z.literal(true, { message: "Only setting isCurrent to true is supported directly" }),
});

/**
 * PATCH /api/v1/academics/periods/[id]
 * Admin-only. Activates a period as the current term for its branch and parent session.
 */
export const PATCH = withAuth<Context>(
  async (req, admin, context) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const body = read.json;

    const parsed = patchPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid payload", 400, "VALIDATION");
    }

    // After the body is checked (as before): the caller must administer the branch they name (403 otherwise).
    return setCurrentInBranch(req, admin, context, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const setCurrentInBranch = withBranch<z.infer<typeof patchPeriodSchema>, { userId: string }, Context>(
  { of: (input) => input.branchId, as: "administer", where: "body" },
  async (_req, admin, context, data) => {
    const { id } = await context.params;
    try {
      const updated = await setCurrentPeriod(data.branchId, id);

      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_PERIOD_SET_CURRENT",
          targetType: "AcademicPeriod",
          targetId: id,
          afterValue: {
            id,
            label: updated.label,
            ordinal: updated.ordinal,
            sessionId: updated.sessionId,
            branchId: updated.branchId,
          },
        },
      });

      return ok({ period: updated });
    } catch (error: unknown) {
      const msg = error instanceof DomainError ? error.message : "Failed to set current term";
      console.error("[ACADEMIC_PERIOD_PATCH_ERROR]", error);
      return fail(msg, 400, "PERIOD_UPDATE_FAILED");
    }
  },
);
