import { Prisma, SchemeScopeLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/academics/structure";
import { validateHierarchicalScheme } from "@/lib/settings/approvals";

// The school-wide default scheme (task 0128): changing one in place. A superadmin's alone (the route checks). The scheme is hosted by one branch (the first), so its rows are guarded by that branch's
// scheme lock; it is NOT read by marks entry (a result names its own branch's scheme: see `copySchoolWideScheme`), so nothing already entered can depend on it, but it is still refused once locked.

export type GlobalSchemeEdit = { name: string; examMax: number; components: { name?: string; maxScore: number }[]; isDefault?: boolean };

const SAME_NAME = "A scheme with that name already exists. Choose another name.";

/// `null` for an unknown scope. A 409 (ConflictError) with the reason for a scheme that is archived or locked, a bad sum (the same rule as creating one), or a taken name.
export async function updateGlobalScheme(actorUserId: string, scopeId: string, edit: GlobalSchemeEdit) {
  const valid = validateHierarchicalScheme({ examMax: edit.examMax, caParts: edit.components });
  if (!valid.valid || !valid.normalizedComponents) throw new ConflictError(valid.error ?? "Invalid assessment scheme components");
  const parts = valid.normalizedComponents;
  const name = edit.name.replace(/\s+/g, " ").trim();
  try {
    return await prisma.$transaction(async (tx) => {
      const scope = await tx.assessmentSchemeScope.findFirst({
        where: { id: scopeId, level: SchemeScopeLevel.GLOBAL },
        include: { scheme: { include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
      });
      if (!scope) return null;
      const scheme = scope.scheme;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assessment-scheme:${scheme.branchId}`}::text))`;
      const fresh = await tx.assessmentScheme.findUniqueOrThrow({ where: { id: scheme.id }, select: { archivedAt: true, lockedAt: true } });
      if (fresh.archivedAt) throw new ConflictError("That school-wide scheme is archived.");
      if (fresh.lockedAt)
        throw new ConflictError("Results already use this scheme, so it cannot be edited. Make a new school-wide scheme instead.");
      const before = {
        name: scheme.name,
        examMax: Number(scheme.examMax),
        components: scheme.components.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
        isDefault: scope.isDefault,
      };
      const after = {
        name,
        examMax: edit.examMax,
        components: parts.map((c) => ({ name: c.name, maxScore: c.maxScore })),
        isDefault: edit.isDefault ?? scope.isDefault,
      };
      if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false };
      await tx.assessmentScheme.update({ where: { id: scheme.id }, data: { name, examMax: edit.examMax } });
      await tx.assessmentComponent.deleteMany({ where: { schemeId: scheme.id } });
      await tx.assessmentComponent.createMany({
        data: parts.map((c) => ({
          branchId: scheme.branchId,
          schemeId: scheme.id,
          name: c.name,
          maxScore: c.maxScore,
          sortOrder: c.sortOrder,
        })),
      });
      if (after.isDefault !== scope.isDefault) {
        // Only one school-wide scheme is the default.
        if (after.isDefault)
          await tx.assessmentSchemeScope.updateMany({
            where: { level: SchemeScopeLevel.GLOBAL, isDefault: true },
            data: { isDefault: false },
          });
        await tx.assessmentSchemeScope.update({ where: { id: scope.id }, data: { isDefault: after.isDefault } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "GLOBAL_SCHEME_UPDATE",
          targetType: "AssessmentScheme",
          targetId: scheme.id,
          beforeValue: before as Prisma.InputJsonValue,
          afterValue: { scopeId: scope.id, ...after } as Prisma.InputJsonValue,
        },
      });
      return { changed: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(SAME_NAME);
    throw error;
  }
}
