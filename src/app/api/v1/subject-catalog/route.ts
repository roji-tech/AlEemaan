import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { createCatalogEntry, listCatalog } from "@/lib/academics/subject-catalog";
import { catalogInput, listQuery } from "@/lib/academics/subject-catalog-rules";

// The school's subject catalogue (task 0119). SUPERADMIN only: it belongs to the school, not to a branch.
// GET  /api/v1/subject-catalog?q=&archived=&tag=   every entry (live, or archived with archived=true) with the branches offering it and its tags. At most 500, by name.
// POST /api/v1/subject-catalog { name, code?, tags? }   one entry; 409 for a taken name or code.
const WRITES_PER_WINDOW = 60; // per superadmin per 5 minutes

export const GET = withAuth(
  validate({ query: listQuery }, async (_req, _auth, _ctx, { query }) =>
    structureCall("SUBJECT_CATALOG_LIST", async () =>
      ok({ entries: await listCatalog({ q: query.q, archived: query.archived === "true", tag: query.tag }) }),
    ),
  ),
  { superAdmin: true },
);

export const POST = withAuth(
  validate({ body: catalogInput }, async (_req, auth, _ctx, { body }) => {
    if (!(await reserveAttempt(`catalog:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SUBJECT_CATALOG_CREATE", async () => ok({ entry: await createCatalogEntry(auth.userId, body) }, {}, 201));
  }),
  { superAdmin: true },
);
