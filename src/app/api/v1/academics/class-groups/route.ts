import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { classGroupInput, countUnmatchedEnrolments, createClassGroup, listClassGroups } from "@/lib/academics/structure";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";

// GET  /api/v1/academics/class-groups?branchId=&includeArchived=   the branch's classes with their arms (and enrolment counts) and the subjects each studies.
//                                                                    Any staff role held IN that branch; another branch's id is a 404.
// POST /api/v1/academics/class-groups { branchId, name, sortOrder? }   Administrators of that branch (a branch named in the body that is not theirs: 403).
const query = z.object({ branchId: z.string().min(1, "branchId is required"), includeArchived: z.enum(["true", "false"]).optional() });
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("CLASS_GROUPS_LIST", async () => {
        const [classGroups, unmatchedEnrolments] = await Promise.all([
          listClassGroups(query.branchId, query.includeArchived === "true"),
          countUnmatchedEnrolments(query.branchId),
        ]);
        return ok({ classGroups, unmatchedEnrolments });
      }),
    ),
  ),
  { roles: READ_ROLES },
);

export const POST = withAuth(
  validate(
    { body: classGroupInput },
    withBranch<Parsed<z.infer<typeof classGroupInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("CLASS_GROUP_CREATE", async () => ok({ classGroup: await createClassGroup(auth.userId, body) }, {}, 201)),
    ),
  ),
  { roles: [Role.ADMIN] },
);
