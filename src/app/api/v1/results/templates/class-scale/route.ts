import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { structureCall } from "@/lib/academics/structure-http";
import { classScaleInput, setClassGradeScale } from "@/lib/results/templates";

// PUT /api/v1/results/templates/class-scale { branchId, classGroupId, gradeScaleId | null }   sets a class's OWN grade scale, or clears it with null (the class then follows its result template's
// scale, then the branch's default). It wins over both. A branch ADMINISTRATOR of that branch and a SUPERADMIN (everywhere) only; anyone else is 403 before the branch is looked up, and a branch
// that is not theirs is 403 (it is named in the body). The class and the scale must be live ones of the branch (409). Marks already entered keep the scale they were entered under. Audited.
type Body = Parsed<z.infer<typeof classScaleInput>, undefined>;

export const PUT = withAuth(
  validate(
    { body: classScaleInput },
    withBranch<Body, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("RESULT_CLASS_SCALE", async () =>
          noStore(ok(await setClassGradeScale(auth.userId, body.branchId, body.classGroupId, body.gradeScaleId))),
        ),
    ),
  ),
  { roles: [Role.ADMIN] },
);
