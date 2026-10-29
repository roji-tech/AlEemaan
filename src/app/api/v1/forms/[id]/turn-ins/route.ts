import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import {
  getPaperWorkForStaff,
  updateTurnIn,
  batchUpdateTurnIns,
  PaperWorkError,
} from "@/lib/forms/paper-work-service";
import {
  updateTurnInSchema,
  batchUpdateTurnInsSchema,
} from "@/lib/forms/validation";
import { BANK_STAFF_ROLES, badId, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { TurnInStatus } from "@prisma/client";

/**
 * GET /api/v1/forms/[id]/turn-ins
 * Returns the roll call roster and submission summary for paper work.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const data = await getPaperWorkForStaff(branchId, id, auth.userId);
      return ok(data);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Get roll call turn-ins error:", err);
      return fail("Failed to load roll call", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);

/**
 * PATCH /api/v1/forms/[id]/turn-ins
 * Updates roll call status for a single student or batch of students.
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const raw = (read.json && typeof read.json === "object" ? read.json : {}) as Record<string, unknown>;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId") || (typeof raw.branchId === "string" ? raw.branchId : null);
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      // Check if batch update
      if (Array.isArray(raw.updates)) {
        const parsed = batchUpdateTurnInsSchema.safeParse(raw);
        if (!parsed.success) {
          return fail(parsed.error.issues[0]?.message ?? "Invalid batch updates payload", 400, "VALIDATION");
        }

        const result = await batchUpdateTurnIns(
          branchId,
          auth.userId,
          id,
          parsed.data.updates.map((u) => ({
            studentId: u.studentId,
            status: u.status as TurnInStatus,
            note: u.note,
          })),
        );
        return ok(result);
      }

      // Single update
      const studentId = typeof raw.studentId === "string" ? raw.studentId : "";
      if (!studentId) {
        return fail("studentId is required for single turn-in update", 400, "VALIDATION");
      }

      const parsed = updateTurnInSchema.safeParse(raw);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid turn-in update payload", 400, "VALIDATION");
      }

      const result = await updateTurnIn(branchId, auth.userId, id, studentId, {
        status: parsed.data.status as TurnInStatus,
        note: parsed.data.note,
      });

      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Update turn-in error:", err);
      return fail("Failed to update roll call", 500);
    }
  },
  { roles: FORM_STAFF_ROLES },
);
