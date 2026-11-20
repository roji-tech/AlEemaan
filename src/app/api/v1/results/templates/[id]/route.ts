import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { LAYOUT_KEY, fileRequest, needsApproval, type TemplateLayoutValue } from "@/lib/settings/changes";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { ConflictError } from "@/lib/academics/structure";
import { applyTemplateLayout, templateBranchId, templatePatchInput, updateTemplate } from "@/lib/results/templates";
import type { LayoutOptions } from "@/lib/results/templates-rules";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Result template");
type Body = Parsed<z.infer<typeof templatePatchInput>, undefined>;

// PATCH /api/v1/results/templates/[id] { name?, description?, layoutCode?, layoutOptions?, schemeId?, gradeScaleId?, acknowledge?, reason? }
// Renames, describes, or changes the look, scheme or grade scale of a template. Administrators of the template's branch (another branch's template is a 404). A scheme or scale change when
// marks are already entered for the template's classes in the open session needs `acknowledge` (409 with the count otherwise): those marks keep the structure they were entered under.
// The LAYOUT follows the branch's approval rule: where a superadmin has put layout changes behind approval, an administrator's change is filed with `reason` and answers 202; the other
// fields of the same request are applied at once.
export const PATCH = withAuth<Context>(
  validate(
    { body: templatePatchInput },
    withBranch<Body, AuthContext, Context>(
      { of: async (_input, _req, ctx) => templateBranchId((await ctx.params).id), as: "administer", refuse: gone },
      async (_req, auth, ctx, { body }) =>
        structureCall("RESULT_TEMPLATE_UPDATE", async () => {
          const { id } = await ctx.params;
          const current = await prisma.resultTemplate.findUnique({ where: { id } });
          if (!current) return gone();
          const layoutTouched = body.layoutCode !== undefined || body.layoutOptions !== undefined;
          const layout = {
            layoutCode: body.layoutCode !== undefined ? body.layoutCode : (current.layoutCode as TemplateLayoutValue["layoutCode"]),
            layoutOptions:
              ((body.layoutOptions !== undefined ? body.layoutOptions : current.layoutOptions) as LayoutOptions | null) ?? null,
          };
          // The layout is asked about BEFORE anything is written, so a missing reason changes nothing.
          const held = layoutTouched && (await needsApproval(await isSuperAdmin(auth.userId), current.branchId, LAYOUT_KEY));
          if (held && !body.reason)
            return fail("Say why this change is needed: it goes to a superadmin for approval.", 400, "VALIDATION", [
              { path: "body.reason", message: "A reason is required while a superadmin has put the report-card layout behind approval." },
            ]);
          const updated = await updateTemplate(auth.userId, id, body);
          if (!updated) return gone();
          if (!layoutTouched) return noStore(ok({ template: { id }, pending: false }));
          if (held) {
            const request = await fileRequest({
              key: LAYOUT_KEY,
              targetType: "SETTING",
              branchId: current.branchId,
              actorUserId: auth.userId,
              reason: body.reason!,
              proposedValue: {
                layoutCode: layout.layoutCode,
                options: layout.layoutCode ? (layout.layoutOptions ?? {}) : null,
                templateId: id,
              } as Prisma.InputJsonValue,
            });
            return noStore(ok({ template: { id }, pending: true, approvalId: request.id }, {}, 202));
          }
          try {
            await prisma.$transaction((tx) => applyTemplateLayout(tx, auth.userId, id, current.branchId, layout));
          } catch (error) {
            if (error instanceof ConflictError) return fail(error.message, 409, "CONFLICT");
            throw error;
          }
          return noStore(ok({ template: { id }, pending: false }));
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
