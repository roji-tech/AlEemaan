import { z } from "zod";
import { SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { updateGlobalScheme } from "@/lib/academics/global-schemes";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/schemes/global/[id] { name, examMax, components, isDefault? }   (task 0128) Edits a school-wide scheme in place; `[id]` is the scope id the list gives. A SUPERADMIN only. The whole scheme
// is sent and checked as when creating one (parts and exam add up to exactly 100). Making it the default clears the previous default. 409 for an archived or locked scheme, a bad sum or a taken
// name; nothing changes then. An unknown id is a 404. Audited GLOBAL_SCHEME_UPDATE with before and after.
const body = z.strictObject({
  name: z.string().trim().min(1, "Name is required").max(60, "Use at most 60 characters"),
  examMax: z.number({ error: "Exam max is required" }),
  components: z
    .array(z.strictObject({ name: z.string().optional(), maxScore: z.number({ error: "Max score is required" }) }))
    .min(1, "At least one CA component is required")
    .max(10, "Use at most 10 components"),
  isDefault: z.boolean().optional(),
});

export const PATCH = withAuth<Context>(
  validate<z.infer<typeof body>, undefined, AuthContext, Context>({ body }, async (_req, auth, ctx, { body }) =>
    structureCall("GLOBAL_SCHEME_UPDATE", async () => {
      const id = (await ctx.params).id;
      const result = await updateGlobalScheme(auth.userId, id, body);
      if (!result) return notFound("Scheme");
      const row = await prisma.assessmentSchemeScope.findFirstOrThrow({
        where: { id, level: SchemeScopeLevel.GLOBAL },
        include: { scheme: { include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
      });
      return ok({
        changed: result.changed,
        scheme: {
          id: row.scheme.id,
          scopeId: row.id,
          name: row.scheme.name,
          isDefault: row.isDefault,
          examMax: Number(row.scheme.examMax),
          totalMax: Number(row.scheme.totalMax),
          components: row.scheme.components.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
        },
      });
    }),
  ),
  { superAdmin: true },
);
