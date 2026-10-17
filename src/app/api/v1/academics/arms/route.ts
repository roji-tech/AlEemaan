import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { armInput, classGroupBranchId, createArm } from "@/lib/academics/structure";
import { notFound, structureCall } from "@/lib/academics/structure-http";

// POST /api/v1/academics/arms { classGroupId, name, capacity? }   Adds an arm to a class. Administrators of the class's branch; a class of another branch is the
// same 404 as an unknown id. An archived class takes no new arm (409).
export const POST = withAuth(
  validate(
    { body: armInput },
    withBranch<Parsed<z.infer<typeof armInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => classGroupBranchId(body.classGroupId), as: "administer", refuse: () => notFound("Class") },
      async (_req, auth, _ctx, { body }) =>
        structureCall("CLASS_ARM_CREATE", async () => {
          const created = await createArm(auth.userId, body);
          return created ? ok({ arm: created }, {}, 201) : notFound("Class");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
