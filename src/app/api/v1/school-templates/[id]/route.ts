import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { getSchoolTemplate, patchSchoolTemplate } from "@/lib/results/school-templates";
import { schoolTemplatePatch } from "@/lib/results/school-templates-rules";

type Context = { params: Promise<{ id: string }> };

// GET   /api/v1/school-templates/[id]   one master with its branches (SUPERADMIN only; another id is a 404).
// PATCH /api/v1/school-templates/[id] { name?, description?, layoutCode?, layoutOptions?, definition?, archived? }   (task 0120) SUPERADMIN only. A change to the name, description, look or definition
//       makes it version + 1 (the branches show "Behind" until updated); `archived` archives or restores it and changes no version. 409 for a taken name or a clashing scheme or scale name.
const WRITES_PER_WINDOW = 60;

export const GET = withAuth<Context>(
  async (_req, _auth, ctx) =>
    structureCall("SCHOOL_TEMPLATE_GET", async () => {
      const found = await getSchoolTemplate((await ctx.params).id);
      return found ? ok(found) : notFound("School template");
    }),
  { superAdmin: true },
);

export const PATCH = withAuth<Context>(
  validate({ body: schoolTemplatePatch }, async (_req, auth, ctx, { body }) => {
    if (!(await reserveAttempt(`school-template:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SCHOOL_TEMPLATE_UPDATE", async () => {
      const done = await patchSchoolTemplate(auth.userId, (await ctx.params).id, body);
      return done ? ok(done) : notFound("School template");
    });
  }),
  { superAdmin: true },
);
