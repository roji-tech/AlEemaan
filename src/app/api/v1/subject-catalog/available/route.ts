import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { structureCall } from "@/lib/academics/structure-http";
import { availableForBranch } from "@/lib/academics/subject-catalog";
import { availableQuery } from "@/lib/academics/subject-catalog-rules";

type Query = Parsed<undefined, z.infer<typeof availableQuery>>;

// GET /api/v1/subject-catalog/available?branchId=&tag=   (task 0119) the live catalogue subjects this branch does not have yet (with their tags; `linksExisting` when the branch already has a live
// subject of that name, which taking it will link). Administrators of that branch, or a superadmin; another branch's id is the same 404 as an unknown one. Nothing about other branches is in it.
export const GET = withAuth(
  validate(
    { query: availableQuery },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "administer" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("SUBJECT_CATALOG_AVAILABLE", async () => ok({ entries: await availableForBranch(query.branchId, query.tag) })),
    ),
  ),
  { roles: [Role.ADMIN] },
);
