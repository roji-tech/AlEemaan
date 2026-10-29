import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { createSection } from "@/lib/academics/approver-settings";
import { approverSettingsFailure, createSectionBody, proofRefusal, settingsWriteLimited } from "@/lib/academics/approver-settings-http";

type PostBody = Parsed<z.infer<typeof createSectionBody>, undefined>;

// POST /api/v1/settings/results-approval/sections   { branchId, name, sortOrder?, stepUp }   Superadmin only. Adds a section (Primary, JSS, SSS) to a branch. A live name is unique
// within the branch, ignoring case (409 NAME_TAKEN).
export const POST = withAuth(
  validate({ body: createSectionBody }, async (_req, admin: { userId: string }, _ctx, { body }: PostBody) =>
    structureCall("SETTINGS_SECTION_CREATE", async () => {
      const limited = await settingsWriteLimited(admin.userId);
      if (limited) return limited;
      if (!(await prisma.branch.findUnique({ where: { id: body.branchId }, select: { id: true } }))) return notFound("Branch");
      const refused = await proofRefusal(admin.userId, body.stepUp);
      if (refused) return refused;
      const result = await createSection(admin.userId, { branchId: body.branchId, name: body.name, sortOrder: body.sortOrder });
      return result.ok ? ok({ section: result.section }, {}, 201) : approverSettingsFailure(result.reason, result.what);
    }),
  ),
  { superAdmin: true },
);
