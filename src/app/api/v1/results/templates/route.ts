import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";
import { NeedsConfirmation, createTemplate, listTemplates, templateCreateInput } from "@/lib/results/templates";

// GET  /api/v1/results/templates?branchId=[&archived=1]   the branch's result templates with the classes each holds, the coverage of every class (which template it uses, whether anyone
//      placed it, its own scheme if any) and the choices a template can name (layouts, live schemes, live grade scales). Any staff role of that branch; another branch is a 404.
// POST /api/v1/results/templates { branchId, name, description?, layoutCode?, layoutOptions?, schemeId?, gradeScaleId?, copyFrom?, classGroupIds?, confirmMoves? }   makes a template
//      (copyFrom duplicates the look, scheme and scale, never the classes). Administrators of that branch (another branch in the body: 403). Any number of templates is allowed.
const query = z.object({ branchId: z.string().trim().min(1, "branchId is required").max(64), archived: z.enum(["1"]).optional() });
type Query = Parsed<undefined, z.infer<typeof query>>;
type Body = Parsed<z.infer<typeof templateCreateInput>, undefined>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("RESULT_TEMPLATES_LIST", async () => noStore(ok(await listTemplates(query.branchId, query.archived === "1")))),
    ),
  ),
  { roles: READ_ROLES },
);

export const POST = withAuth(
  validate(
    { body: templateCreateInput },
    withBranch<Body, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("RESULT_TEMPLATE_CREATE", async () => {
          try {
            return noStore(ok(await createTemplate(auth.userId, body), {}, 201));
          } catch (error) {
            if (error instanceof NeedsConfirmation)
              return fail(
                error.message,
                409,
                "CONFIRM_MOVES",
                error.moves.map((m) => ({ path: m.classGroupId, message: `${m.className} leaves ${m.fromTemplateName}` })),
              );
            throw error;
          }
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
