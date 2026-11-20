import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { structureCall, notFound } from "@/lib/academics/structure-http";
import { attendanceInput, saveAttendance, traitsStudentBranch } from "@/lib/results/report-traits";

type Context = { params: Promise<{ id: string }> };

// PUT /api/v1/students/[id]/report-attendance { periodId, timesOpen?, timesPresent?, timesAbsent? }   the attendance numbers printed on a pupil's report card for a term. A number sets that
//   field, null clears it back to what the register gives, a field left out is unchanged. Present and absent cannot exceed the times the school opened. An administrator of the branch, or the
//   class teacher of the pupil's arm (another teacher: 403); 409 once the pupil's results for the term are published. Nothing is invented: with no number entered and no register, the card
//   shows a dash.
export const PUT = withAuth<Context>(
  validate(
    { body: attendanceInput },
    withBranch<Parsed<z.infer<typeof attendanceInput>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => traitsStudentBranch((await ctx.params).id), as: "staff-write", refuse: () => notFound("Student") },
      async (_req, auth, ctx, { body }, branch) =>
        structureCall("REPORT_ATTENDANCE_SAVE", async () =>
          noStore(ok(await saveAttendance({ userId: auth.userId, role: branch.role }, branch.branchId, (await ctx.params).id, body))),
        ),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
