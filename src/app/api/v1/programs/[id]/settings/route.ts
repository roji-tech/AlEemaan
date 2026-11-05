import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { updateProgramSettings } from "@/lib/programs/attendance-service";
import { programSettingsSchema } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/programs/[id]/settings { attendanceEnabled?, lowAttendancePercent? }
 * The program's own attendance switch (the third level under the school's and the branch's: attendance is on only when all are) and the percentage under which a person is flagged.
 * A super admin or a program admin, while the program is a draft or active. Audited.
 */
export const PATCH = withAuth(
  validate({ body: programSettingsSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await updateProgramSettings(auth.userId, (await params).id, body)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
