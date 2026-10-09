import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { importStudents, type ImportStudentRow } from "@/lib/students/import";
import { z } from "zod";

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
    .min(1, "At least one student row is required"),
});

/**
 * POST /api/v1/students/import
 * Admin-only. Bulk imports students with duplicate detection and override capability.
 */
export const POST = withAuth(
  async (req, admin) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = importPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid import payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const rows: ImportStudentRow[] = parsed.data.rows.map((r) => ({
        ...r,
        branchId: parsed.data.branchId,
      }));

      const summary = await importStudents(admin.userId, parsed.data.branchId, rows, parsed.data.allowDuplicates);

      return ok({ summary });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to import students";
      console.error("[STUDENT_IMPORT_ERROR]", error);
      return fail(msg, 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
