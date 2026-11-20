import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { NeedsConfirmation, assignClasses, classesInput, templateBranchId } from "@/lib/results/templates";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Result template");
type Body = Parsed<z.infer<typeof classesInput>, undefined>;

// PUT /api/v1/results/templates/[id]/classes { classGroupIds, confirmMoves? }   the template's WHOLE set of classes: those listed are placed in it, those it held that are not listed go
// back to "uses the default". A listed class that is in ANOTHER template moves only with `confirmMoves` (409 CONFIRM_MOVES listing each class and where it leaves, nothing changed).
// Administrators of the template's branch (another branch's template is a 404). Marks already entered are never touched.
export const PUT = withAuth<Context>(
  validate(
    { body: classesInput },
    withBranch<Body, AuthContext, Context>(
      { of: async (_input, _req, ctx) => templateBranchId((await ctx.params).id), as: "administer", refuse: gone },
      async (_req, auth, ctx, { body }) =>
        structureCall("RESULT_TEMPLATE_CLASSES", async () => {
          try {
            const done = await assignClasses(auth.userId, (await ctx.params).id, body);
            return done ? noStore(ok(done)) : gone();
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
