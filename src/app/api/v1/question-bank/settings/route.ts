import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { idSchema } from "@/lib/question-bank/validation";
import { bankSettingsView, changeBankSettings } from "@/lib/question-bank/settings-service";

// The question bank's switches (design note section 6). Who may call: an administrator of the branch named, or a superadmin (the only one who sees or changes the
// school-wide values). A branch may only NARROW what the school sets; that rule and every other rule about the values live in settings-service.ts.

const Query = z.object({ branchId: idSchema.optional() });

const Body = z
  .object({
    scope: z.enum(["GLOBAL", "BRANCH"]),
    branchId: idSchema.optional(),
    /// key -> new value, or null to clear. The keys and values are checked by the service, not trusted here.
    changes: z.record(z.string().max(80), z.unknown()).refine((value) => Object.keys(value).length <= 20, "At most 20 settings at a time."),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/// GET /api/v1/question-bank/settings?branchId=...  A branch's view (default, school value, the branch's own override, effective). Without branchId: the school-wide
/// values, superadmin only.
export const GET = withAuthGated(
  "administer",
  validate({ query: Query }, async (_req, auth, _ctx, { query }) => {
    if (!query.branchId) {
      if (!(await isSuperAdmin(auth.userId))) return fail("branchId is required", 400, "VALIDATION");
      return ok({ scope: "GLOBAL", branchId: null, settings: await bankSettingsView(null) });
    }
    const branch = await prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true } });
    if (!branch) return fail("Not found", 404, "NOT_FOUND");
    return ok({ scope: "BRANCH", branchId: branch.id, settings: await bankSettingsView(branch.id) });
  }),
  { roles: [Role.ADMIN] },
);

/// PUT /api/v1/question-bank/settings  { scope, branchId?, changes: { "bank.x": value | null }, reason? }
export const PUT = withAuthGated(
  "administer",
  validate({ body: Body }, async (_req, auth, _ctx, { body }) => {
    const result = await changeBankSettings({
      actorUserId: auth.userId,
      isSuperAdmin: await isSuperAdmin(auth.userId),
      scope: body.scope,
      branchId: body.branchId ?? null,
      changes: body.changes as Record<string, unknown>,
      reason: body.reason ?? null,
    });
    if (!result.ok) return fail(result.message, result.status, result.code, result.details);
    return ok({ changed: result.changed, settings: result.settings });
  }),
  { roles: [Role.ADMIN] },
);
