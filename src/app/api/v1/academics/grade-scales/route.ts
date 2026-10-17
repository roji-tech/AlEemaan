import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { listScales, scaleInput, createScale, WAEC_TEMPLATE } from "@/lib/academics/assessment";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";

// GET  /api/v1/academics/grade-scales?branchId=&includeArchived=   the branch's grade scales. Any staff role held IN that branch; another branch's id is a 404.
// POST /api/v1/academics/grade-scales { branchId, ... }              Administrators of that branch (a branch named in the body that is not theirs: 403).
const query = z.object({ branchId: z.string().min(1, "branchId is required"), includeArchived: z.enum(["true", "false"]).optional() });
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("GRADE_SCALES_LIST", async () =>
        ok({ scales: await listScales(query.branchId, query.includeArchived === "true"), template: WAEC_TEMPLATE }),
      ),
    ),
  ),
  { roles: READ_ROLES },
);

export const POST = withAuth(
  validate(
    { body: scaleInput },
    withBranch<Parsed<z.infer<typeof scaleInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("SCALE_CREATE", async () => ok({ scale: await createScale(auth.userId, body) }, {}, 201)),
    ),
  ),
  { roles: [Role.ADMIN] },
);
