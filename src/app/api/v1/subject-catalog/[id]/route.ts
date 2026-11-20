import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { updateCatalogEntry } from "@/lib/academics/subject-catalog";
import { catalogPatch } from "@/lib/academics/subject-catalog-rules";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/subject-catalog/[id] { name?, code?, tags?, archived?, renameInBranches? }   (task 0119) SUPERADMIN only.
// `renameInBranches: true` (with a name) also renames the branches' own subjects linked to it, all or none: 409 naming the branches that already have another subject with that name.
const WRITES_PER_WINDOW = 60;

export const PATCH = withAuth<Context>(
  validate({ body: catalogPatch }, async (_req, auth, ctx, { body }) => {
    if (!(await reserveAttempt(`catalog:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SUBJECT_CATALOG_UPDATE", async () => {
      const updated = await updateCatalogEntry(auth.userId, (await ctx.params).id, body);
      return updated ? ok({ entry: updated }) : notFound("Subject");
    });
  }),
  { superAdmin: true },
);
