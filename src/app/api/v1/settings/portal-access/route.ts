import { z } from "zod";
import { SettingScope } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { ID_PATTERN } from "@/lib/api/ids";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { DEFAULT_PORTAL_ACCESS, PORTAL_ACCESS_KEY } from "@/lib/portal/access";
import { portalAccessInput } from "@/lib/portal/access-input";
import { getPortalAccess, setPortalAccess } from "@/lib/portal/access-service";

// What a pupil and a guardian may do in the portal, per branch (task 0040). Superadmin only, like the rest of the school settings: it decides what a family sees of fees and
// results. Every change is written to SettingAudit in the same transaction; a change that gives somebody more than before is marked CHANGED_WIDENING.

const branchIdSchema = z.string().regex(ID_PATTERN, "Choose a branch.");
const getQuery = z.object({ branchId: branchIdSchema });
const patchBody = z.strictObject({ branchId: branchIdSchema, access: portalAccessInput });
type GetQuery = Parsed<undefined, z.infer<typeof getQuery>>;
type PatchBody = Parsed<z.infer<typeof patchBody>, undefined>;

const HISTORY = 20;

async function history(branchId: string) {
  const rows = await prisma.settingAudit.findMany({
    where: { scope: SettingScope.BRANCH, branchId, settingKey: PORTAL_ACCESS_KEY },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: { id: true, action: true, actorUserId: true, createdAt: true },
  });
  const ids = [...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
  const who = new Map(people.map((person) => [person.id, person.name || person.email]));
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    by: row.actorUserId ? (who.get(row.actorUserId) ?? "Someone who no longer has an account") : "The system",
    widening: row.action === "CHANGED_WIDENING",
  }));
}

// GET /api/v1/settings/portal-access?branchId=   The branch's value (the default when none is stored), the defaults, and the last changes.
export const GET = withAuth(
  validate({ query: getQuery }, async (_req, _admin, _ctx, { query }: GetQuery) =>
    structureCall("SETTINGS_PORTAL_ACCESS_GET", async () => {
      const branch = await prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true } });
      if (!branch) return notFound("Branch");
      return ok({ branchId: branch.id, access: await getPortalAccess(branch.id), defaults: DEFAULT_PORTAL_ACCESS, history: await history(branch.id) });
    }),
  ),
  { superAdmin: true },
);

// PATCH /api/v1/settings/portal-access   Body { branchId, access: { pupil, guardian } }, every key of both, nothing else. Takes effect on the next request of every portal session.
export const PATCH = withAuth(
  validate({ body: patchBody }, async (_req, admin: { userId: string }, _ctx, { body }: PatchBody) =>
    structureCall("SETTINGS_PORTAL_ACCESS_PATCH", async () => {
      const branch = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { id: true } });
      if (!branch) return notFound("Branch");
      const change = await setPortalAccess(branch.id, body.access, admin.userId);
      return ok({ branchId: branch.id, access: change.after, changed: change.changed, widening: change.widening, history: await history(branch.id) });
    }),
  ),
  { superAdmin: true },
);
