import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { createSchoolTemplate, listSchoolTemplates } from "@/lib/results/school-templates";
import { schoolTemplateInput } from "@/lib/results/school-templates-rules";

// The school-wide result templates (task 0120). SUPERADMIN only: they belong to the school, not to a branch.
// GET  /api/v1/school-templates?archived=   every master (live, or archived with archived=true) with the branches that follow it and where each stands (Up to date / Behind / Customised here),
//      and the branches that do not follow it yet.
// POST /api/v1/school-templates { name, description?, layoutCode?, layoutOptions?, definition }   one master (version 1); 400 for a definition that is not valid (bands, marks, keys), 409 for a taken
//      name or a scheme or scale name that another master uses with different contents.
const WRITES_PER_WINDOW = 60; // per superadmin per 5 minutes
const listQuery = z.strictObject({ archived: z.enum(["true", "false"]).optional() });

export const GET = withAuth(
  validate({ query: listQuery }, async (_req, _auth, _ctx, { query }) =>
    structureCall("SCHOOL_TEMPLATE_LIST", async () => ok(await listSchoolTemplates({ archived: query.archived === "true" }))),
  ),
  { superAdmin: true },
);

export const POST = withAuth(
  validate({ body: schoolTemplateInput }, async (_req, auth, _ctx, { body }) => {
    if (!(await reserveAttempt(`school-template:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SCHOOL_TEMPLATE_CREATE", async () => ok(await createSchoolTemplate(auth.userId, body), {}, 201));
  }),
  { superAdmin: true },
);
