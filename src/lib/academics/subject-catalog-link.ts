import type { Prisma, PrismaClient } from "@prisma/client";

// Linking a branch's new subject to the catalogue (task 0119). Kept apart from `subject-catalog.ts` so `structure.ts` (which that file imports) can use it without a cycle.

type Db = Prisma.TransactionClient | PrismaClient;

/// The id of the LIVE catalogue entry with this name (ignoring case) that the branch has no live subject linked to yet, or null. A subject created the usual way (the single form, a file)
/// is linked to it so the school sees it is the same subject as in the other branches. Nothing is ever CREATED in the catalogue from here: only a superadmin's screens do that.
export async function catalogIdForName(db: Db, branchId: string, name: string): Promise<string | null> {
  const entry = await db.subjectCatalog.findFirst({
    where: { archivedAt: null, name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (!entry) return null;
  const taken = await db.subject.count({ where: { branchId, catalogId: entry.id, archivedAt: null } });
  return taken > 0 ? null : entry.id;
}
