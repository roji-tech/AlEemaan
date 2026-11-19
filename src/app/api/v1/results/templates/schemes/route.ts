import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { structureCall } from "@/lib/academics/structure-http";
import { createTemplateScheme, templateSchemeInput } from "@/lib/results/templates";

// POST /api/v1/results/templates/schemes { branchId, name, examMax, components, totalMax? }   a marks structure made for result templates (not for a class and not the branch default), so
// several templates can have different ones. The same rules as any scheme (parts and exam add up to the total); it can then be chosen by a template. Administrators of that branch.
type Body = Parsed<z.infer<typeof templateSchemeInput>, undefined>;

export const POST = withAuth(
  validate(
    { body: templateSchemeInput },
    withBranch<Body, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("RESULT_TEMPLATE_SCHEME_CREATE", async () =>
          noStore(ok({ scheme: await createTemplateScheme(auth.userId, body) }, {}, 201)),
        ),
    ),
  ),
  { roles: [Role.ADMIN] },
);
