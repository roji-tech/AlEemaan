import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId } from "@/lib/students/scope";
import { ScholarshipError, change, end } from "@/lib/scholarships/service";

type Context = { params: Promise<{ id: string; scholarshipId: string }> };

// PATCH /api/v1/students/[id]/scholarships/[scholarshipId] { percent?, startsOn?, endsOn?, note?, end? }   change a scholarship that has not ended, or end it (`end: true`, alone).
// Invoices already issued are not changed by either. A superadmin or an administrator of the pupil's branch (the same 404 as unknown for another branch's pupil or another pupil's scholarship).
// Audited. Never cached.
const day = z
  .union([z.literal(""), z.iso.date("Write the day as YYYY-MM-DD.")])
  .nullable()
  .optional();
const body = z
  .strictObject({
    percent: z
      .number()
      .int("The share must be a whole number.")
      .min(1, "The share is at least 1%.")
      .max(100, "The share is at most 100%.")
      .optional(),
    startsOn: day,
    endsOn: day,
    note: z.string().trim().max(300).nullable().optional(),
    end: z.literal(true).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change." })
  .refine((b) => !b.end || Object.keys(b).length === 1, { message: "Ending a scholarship is done on its own.", path: ["end"] });

const notFound = () => noStore(fail("Scholarship not found", 404, "NOT_FOUND"));

export const PATCH = withAuth<Context>(
  validate<z.infer<typeof body>, undefined, AuthContext, Context>(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => studentBranchId((await ctx.params).id), as: "administer", refuse: () => notFound() },
      async (_req, auth, ctx, { body: patch }) => {
        const { id: studentId, scholarshipId } = await ctx.params;
        try {
          const { end: ending, ...changes } = patch;
          const done = ending
            ? await end(auth.userId, studentId, scholarshipId)
            : await change(auth.userId, studentId, scholarshipId, changes);
          return done ? noStore(ok({ scholarship: done })) : notFound();
        } catch (error) {
          if (error instanceof ScholarshipError) return noStore(fail(error.message, error.status, error.code));
          throw error;
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
