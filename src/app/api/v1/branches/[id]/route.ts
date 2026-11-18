import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/members/http";
import { branchHoldings } from "@/lib/branches/holdings";

// GET, PATCH and DELETE /api/v1/branches/[id]: the single-branch page. Superadmin only (the list and the creation already are). The branch's `code` is shown and never changed: invoice
// numbers carry it (`INV-<code>-2026-0001`), so a new code would break every number already issued; only the name is edited. A branch is deleted only when nothing of people or history
// points at it (lib/branches/holdings.ts), after its exact name is typed back; the deletion and the check are one transaction with the branch row locked.
type Ctx = { params: Promise<{ id: string }> };
const NAME = z.string().trim().min(1, "Branch name is required").max(100, "Use at most 100 characters.");

const view = (b: { id: string; name: string; code: string; createdAt: Date }) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  createdAt: b.createdAt.toISOString(),
});

export const GET = withAuth(
  async (_req, _auth: AuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("branch");
    const branch = await prisma.branch.findUnique({ where: { id }, select: { id: true, name: true, code: true, createdAt: true } });
    if (!branch) return notFound("branch");
    const [holdings, branches] = await Promise.all([branchHoldings(prisma, id), prisma.branch.count()]);
    const onlyBranch = branches <= 1;
    return ok({ branch: view(branch), holdings, onlyBranch, canDelete: !onlyBranch && !holdings.some((h) => h.blocks) });
  },
  { superAdmin: true },
);

export const PATCH = withAuth(
  validate({ body: z.strictObject({ name: NAME }) }, async (_req, auth: AuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("branch");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const before = await tx.branch.findUnique({ where: { id }, select: { id: true, name: true, code: true, createdAt: true } });
        if (!before) return null;
        if (before.name === body.name) return { branch: before, changed: false };
        const branch = await tx.branch.update({
          where: { id },
          data: { name: body.name },
          select: { id: true, name: true, code: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: auth.userId,
            action: "BRANCH_RENAMED",
            targetType: "Branch",
            targetId: id,
            beforeValue: { name: before.name },
            afterValue: { name: branch.name },
          },
        });
        return { branch, changed: true };
      });
      if (!result) return notFound("branch");
      return ok({ branch: view(result.branch), changed: result.changed });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail("A branch with this name already exists", 409, "DUPLICATE_NAME");
      }
      console.error("[BRANCH_RENAME_ERROR]", error);
      return fail("An unexpected error occurred. Please try again.", 500, "INTERNAL");
    }
  }),
  { superAdmin: true },
);

export const DELETE = withAuth(
  validate({ body: z.strictObject({ confirmName: z.string().max(200) }) }, async (_req, auth: AuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("branch");
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // The row is locked first: anyone adding a pupil or a class to this branch while it is being checked waits for the commit, and then fails on the missing branch.
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Branch" WHERE id = ${id} FOR UPDATE`);
        if (locked.length === 0) return { kind: "missing" as const };
        const branch = await tx.branch.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, code: true } });
        if (body.confirmName.trim() !== branch.name) return { kind: "name" as const };
        if ((await tx.branch.count()) <= 1) return { kind: "last" as const };
        const holdings = await branchHoldings(tx, id);
        if (holdings.some((h) => h.blocks)) return { kind: "holds" as const, holdings };
        await tx.auditLog.create({
          data: {
            actorUserId: auth.userId,
            action: "BRANCH_DELETED",
            targetType: "Branch",
            targetId: id,
            beforeValue: { name: branch.name, code: branch.code, removedWithIt: holdings.map((h) => `${h.count} ${h.label}`) },
          },
        });
        await tx.branch.delete({ where: { id } });
        return { kind: "deleted" as const, name: branch.name, holdings };
      });
      if (outcome.kind === "missing") return notFound("branch");
      if (outcome.kind === "name")
        return fail("Type the branch's name exactly to confirm.", 400, "CONFIRM_NAME", [
          { path: "body.confirmName", message: "That is not the branch's name." },
        ]);
      if (outcome.kind === "last")
        return fail("The school needs at least one branch, so the last one cannot be deleted.", 409, "LAST_BRANCH");
      if (outcome.kind === "holds") {
        const blocking = outcome.holdings.filter((h) => h.blocks);
        return fail(
          `This branch still holds ${blocking.map((h) => `${h.count} ${h.label}`).join(", ")}. Move or remove them first.`,
          409,
          "BRANCH_NOT_EMPTY",
        );
      }
      return ok({ deleted: { id, name: outcome.name }, removedWithIt: outcome.holdings });
    } catch (error) {
      // A table that restricts the deletion (the question bank) answers with a foreign-key error even if it was not counted.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return fail("This branch still holds records, so it cannot be deleted.", 409, "BRANCH_NOT_EMPTY");
      }
      console.error("[BRANCH_DELETE_ERROR]", error);
      return fail("An unexpected error occurred. Please try again.", 500, "INTERNAL");
    }
  }),
  { superAdmin: true },
);
