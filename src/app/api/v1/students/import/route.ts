import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { branchOutOfScope } from "@/lib/students/scope";
import { importStudents, type ImportStudentRow } from "@/lib/students/import";
import { z } from "zod";

/// One import is one transaction-sized batch: more rows than this is split by the caller (ISS-0006).
export const IMPORT_MAX_ROWS = 1000;

const importPayloadSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
  allowDuplicates: z.boolean().optional().default(false),
  rows: z
    .array(
      z.object({
        firstName: z.string().trim().min(1),
        middleName: z.string().trim().nullable().optional(),
        lastName: z.string().trim().min(1),
        gender: z.enum(["MALE", "FEMALE"]),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        admissionNo: z.string().trim().nullable().optional(),
        className: z.string().trim().nullable().optional(),
        arm: z.string().trim().nullable().optional(),
        guardianName: z.string().trim().nullable().optional(),
        guardianPhone: z.string().trim().nullable().optional(),
        guardianEmail: z.string().trim().nullable().optional(),
      }),
    )
    .min(1, "At least one student row is required")
    .max(IMPORT_MAX_ROWS, `Import at most ${IMPORT_MAX_ROWS} students at a time.`),
});

/**
 * POST /api/v1/students/import
 * Admin-only. Bulk imports students with duplicate detection and override capability.
 */
export const POST = withAuth(
  validate({ body: importPayloadSchema }, async (_req, admin: { userId: string }, _ctx: unknown, { body }) => {
    const outOfScope = await branchOutOfScope(admin.userId, body.branchId);
    if (outOfScope) return outOfScope;

    try {
      const rows: ImportStudentRow[] = body.rows.map((r) => ({ ...r, branchId: body.branchId }));
      const summary = await importStudents(admin.userId, body.branchId, rows, body.allowDuplicates);
      return ok({ summary });
    } catch (error: unknown) {
      // Never hand the exception's own text to the caller (ISS-0006): it can name tables, columns and values.
      console.error("[STUDENT_IMPORT_ERROR]", error);
      return fail("The import could not be completed. Nothing was imported.", 500, "INTERNAL");
    }
  }),
  { roles: [Role.ADMIN] },
);
