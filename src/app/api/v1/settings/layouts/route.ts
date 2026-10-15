import { z } from "zod";
import { Role, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { getReportCardLayouts, getBranchReportCardLayout } from "@/lib/settings/approvals";
import { audit } from "@/lib/academics/structure";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";

const getLayoutsQuery = z.object({
  branchId: z.string().optional(),
});

const patchBranchLayoutInput = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  layoutCode: z.enum(["DEFAULT", "LEGACY"]),
  options: z
    .strictObject({
      logo: z.boolean().optional(),
      signatureLine: z.boolean().optional(),
      nextTermDate: z.boolean().optional(),
    })
    .optional(),
});

type Query = Parsed<undefined, z.infer<typeof getLayoutsQuery>>;
type PatchBody = Parsed<z.infer<typeof patchBranchLayoutInput>, undefined>;

// GET /api/v1/settings/layouts?branchId=
// Read available layouts and current effective branch layout
export const GET = withAuth(
  validate({ query: getLayoutsQuery }, async (_req, _auth, _ctx, { query }: Query) =>
    structureCall("SETTINGS_LAYOUTS_GET", async () => {
      const layouts = await getReportCardLayouts();
      let activeLayout = null;

      if (query.branchId) {
        activeLayout = await getBranchReportCardLayout(query.branchId);
      }

      return ok({
        layouts: layouts.map((l) => ({
          code: l.code,
          name: l.name,
          type: l.type,
          isLegacy: l.isLegacy,
          options: l.options,
        })),
        activeLayout,
      });
    }),
  ),
  { roles: READ_ROLES },
);

// PATCH /api/v1/settings/layouts
// Set report card layout for a branch
export const PATCH = withAuth(
  validate(
    { body: patchBranchLayoutInput },
    withBranch<PatchBody, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }, branch) =>
        structureCall("SETTINGS_LAYOUT_SET", async () => {
          // Verify layoutCode exists
          const layout = await prisma.reportCardLayout.findUnique({
            where: { code: body.layoutCode },
          });

          if (!layout) {
            return fail("Specified layout code does not exist", 400, "BAD_REQUEST");
          }

          const value = {
            layoutCode: body.layoutCode,
            options: body.options ?? {},
          };

          const updated = await prisma.$transaction(async (tx) => {
            const saved = await tx.settingValue.upsert({
              where: {
                scope_branchId_key: {
                  scope: SettingScope.BRANCH,
                  branchId: branch.branchId,
                  key: "report_card_layout",
                },
              },
              create: {
                scope: SettingScope.BRANCH,
                branchId: branch.branchId,
                key: "report_card_layout",
                value,
                status: SettingStatus.APPROVED,
              },
              update: {
                value,
                status: SettingStatus.APPROVED,
              },
            });

            await tx.settingAudit.create({
              data: {
                settingKey: "report_card_layout",
                scope: SettingScope.BRANCH,
                branchId: branch.branchId,
                actorUserId: auth.userId,
                action: "LAYOUT_CONFIG_UPDATE",
                newValue: value,
              },
            });

            return saved;
          });

          await audit(auth.userId, "REPORT_CARD_LAYOUT_CONFIGURED", "SettingValue", updated.id, {
            branchId: branch.branchId,
            layoutCode: body.layoutCode,
          });

          const effective = await getBranchReportCardLayout(branch.branchId);
          return ok({ layout: effective });
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
