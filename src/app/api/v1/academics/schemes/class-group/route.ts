import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";
import { schemesForClassGroups } from "@/lib/academics/class-group-schemes";

// GET /api/v1/academics/schemes/class-group?branchId=   every live class of the branch, in the list's order, each with its own assessment scheme or `null` (task 0112).
// One request for the Scheme levels section instead of one per class (task 0108 D3). Who may read it is who may read one class's scheme: any staff role held IN that branch (a superadmin
// everywhere); another branch's id is a 404, as for the class list.
const query = z.object({ branchId: z.string().min(1, "branchId is required").max(64) });
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("CLASS_GROUP_SCHEMES_LIST", async () => {
        const groups = await prisma.classGroup.findMany({
          where: { branchId: query.branchId, archivedAt: null },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        });
        const schemes = await schemesForClassGroups(
          query.branchId,
          groups.map((g) => g.id),
        );
        return ok({ classGroups: groups.map((g) => ({ id: g.id, name: g.name, scheme: schemes[g.id] ?? null })) });
      }),
    ),
  ),
  { roles: READ_ROLES },
);
