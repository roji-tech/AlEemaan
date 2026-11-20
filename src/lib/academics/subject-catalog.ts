import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/academics/structure";
import {
  CATALOG_TAKEN,
  MAX_CATALOG_LIST,
  planAdd,
  renameClashes,
  renameClashMessage,
  type AddResult,
  type catalogInput,
  type catalogPatch,
} from "@/lib/academics/subject-catalog-rules";

// The shared subject catalogue (task 0119). The authority is the ROUTE's (a superadmin for the catalogue itself; the administrator of a branch for "add from catalogue" into that branch);
// this module never decides who may act. A branch's subject stays the branch's own row: a catalogue entry only links the same subject across branches, so nothing here lets a mark, an
// offering or an assignment cross a branch.

const isTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/// The whole catalogue for a superadmin: each entry with the branches that offer it (the branch's own subject, whether it is live, and how many classes of that branch take it).
export async function listCatalog(input: { q?: string; archived?: boolean; tag?: string }) {
  const q = input.q?.trim();
  const rows = await prisma.subjectCatalog.findMany({
    where: {
      archivedAt: input.archived ? { not: null } : null,
      ...(input.tag ? { tags: { has: input.tag } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_CATALOG_LIST,
    select: {
      id: true,
      name: true,
      code: true,
      tags: true,
      archivedAt: true,
      subjects: {
        orderBy: [{ branch: { name: "asc" } }, { id: "asc" }],
        select: { id: true, archivedAt: true, branch: { select: { id: true, name: true } }, _count: { select: { offerings: true } } },
      },
    },
  });
  return rows.map((e) => {
    const branches = e.subjects.map((s) => ({
      branchId: s.branch.id,
      branchName: s.branch.name,
      subjectId: s.id,
      live: s.archivedAt === null,
      classes: s._count.offerings,
    }));
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      archivedAt: e.archivedAt,
      branches,
      liveBranches: branches.filter((b) => b.live).length,
    };
  });
}

export async function createCatalogEntry(actorUserId: string, input: z.infer<typeof catalogInput>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.subjectCatalog.create({ data: { name: input.name, code: input.code ?? null, tags: input.tags ?? [] } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "SUBJECT_CATALOG_CREATED",
          targetType: "SubjectCatalog",
          targetId: created.id,
          afterValue: { name: created.name, code: created.code, tags: created.tags },
        },
      });
      return created;
    });
  } catch (error) {
    if (isTaken(error)) throw new ConflictError(CATALOG_TAKEN);
    throw error;
  }
}

/// Renames, recodes, archives or restores an entry (null for an unknown id). With `renameInBranches` the branches' own LIVE subjects linked to it take the new name too, all or none: a branch
/// that already has another live subject with that name refuses the whole rename (409 naming those branches). The entry's code is never copied to the branches.
export async function updateCatalogEntry(actorUserId: string, id: string, patch: z.infer<typeof catalogPatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.subjectCatalog.findUnique({ where: { id } });
      if (!before) return null;
      let renamed = 0;
      if (patch.renameInBranches === true && patch.name !== undefined) {
        const linked = await tx.subject.findMany({
          where: { catalogId: id, archivedAt: null },
          select: { id: true, branchId: true, name: true, code: true, branch: { select: { name: true } } },
        });
        const live = await tx.subject.findMany({
          where: { branchId: { in: [...new Set(linked.map((l) => l.branchId))] }, archivedAt: null },
          select: { id: true, branchId: true, name: true },
        });
        const byBranch = new Map<string, { id: string; name: string }[]>();
        for (const s of live) byBranch.set(s.branchId, [...(byBranch.get(s.branchId) ?? []), { id: s.id, name: s.name }]);
        const clashes = renameClashes(
          linked.map((l) => ({ branchId: l.branchId, branchName: l.branch.name, subjectId: l.id })),
          byBranch,
          patch.name,
        );
        if (clashes.length > 0) throw new ConflictError(renameClashMessage(clashes));
        for (const l of linked) {
          if (l.name === patch.name) continue;
          await tx.subject.update({ where: { id: l.id }, data: { name: patch.name } });
          await tx.auditLog.create({
            data: {
              actorUserId,
              action: "SUBJECT_UPDATED",
              targetType: "Subject",
              targetId: l.id,
              afterValue: { name: patch.name, code: l.code, via: "catalogue", catalogId: id },
              beforeValue: { name: l.name, code: l.code },
            },
          });
          renamed += 1;
        }
      }
      const updated = await tx.subjectCatalog.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.code !== undefined ? { code: patch.code } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
        },
      });
      const renamedEntry = patch.name !== undefined && patch.name !== before.name;
      await tx.auditLog.create({
        data: {
          actorUserId,
          action:
            patch.archived === true
              ? "SUBJECT_CATALOG_ARCHIVED"
              : patch.archived === false
                ? "SUBJECT_CATALOG_RESTORED"
                : renamedEntry
                  ? "SUBJECT_CATALOG_RENAMED"
                  : "SUBJECT_CATALOG_UPDATED",
          targetType: "SubjectCatalog",
          targetId: id,
          afterValue: {
            name: updated.name,
            code: updated.code,
            tags: updated.tags,
            archived: updated.archivedAt !== null,
            renamedInBranches: renamed,
          },
          beforeValue: { name: before.name, code: before.code, tags: before.tags, archived: before.archivedAt !== null },
        },
      });
      return { ...updated, renamedInBranches: renamed };
    });
  } catch (error) {
    if (isTaken(error)) throw new ConflictError(CATALOG_TAKEN);
    throw error;
  }
}

/// What a branch administrator may take: the live entries the branch has no live subject linked to. `linksExisting` says the branch already has a live subject with that name (not linked),
/// which taking the entry will LINK rather than duplicate. Nothing about other branches is in the answer.
export async function availableForBranch(branchId: string, tag?: string) {
  const [entries, own] = await Promise.all([
    prisma.subjectCatalog.findMany({
      where: { archivedAt: null, ...(tag ? { tags: { has: tag } } : {}), subjects: { none: { branchId, archivedAt: null } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_CATALOG_LIST,
      select: { id: true, name: true, code: true, tags: true },
    }),
    prisma.subject.findMany({ where: { branchId, archivedAt: null }, select: { name: true } }),
  ]);
  const names = new Set(own.map((s) => s.name.trim().toLowerCase()));
  return entries.map((e) => ({ ...e, linksExisting: names.has(e.name.trim().toLowerCase()) }));
}

/// Puts one entry into one branch, in the caller's transaction. A branch that already has it is left alone ("already"); a live subject of the same name that is not linked is linked, not
/// duplicated ("linked"); one linked to another entry is a "clash"; otherwise the branch gets its own new subject ("added"; the code is left off when the branch already uses it).
async function addOneIn(tx: Prisma.TransactionClient, actorUserId: string, catalogId: string, branchId: string): Promise<AddResult> {
  const entry = await tx.subjectCatalog.findFirst({
    where: { id: catalogId, archivedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!entry) return "gone";
  const live = await tx.subject.findMany({
    where: { branchId, archivedAt: null },
    select: { id: true, name: true, code: true, catalogId: true },
  });
  const plan = planAdd(entry, live);
  if (plan.kind === "already") return "already";
  if (plan.kind === "clash") return "clash";
  if (plan.kind === "link") {
    await tx.subject.update({ where: { id: plan.subjectId }, data: { catalogId: entry.id } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "SUBJECT_ADDED_FROM_CATALOG",
        targetType: "Subject",
        targetId: plan.subjectId,
        afterValue: { catalogId: entry.id, name: entry.name, branchId, linked: true },
      },
    });
    return "linked";
  }
  const created = await tx.subject.create({
    data: { branchId, name: entry.name, code: plan.withCode ? entry.code : null, catalogId: entry.id },
    select: { id: true, name: true, code: true },
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      action: "SUBJECT_ADDED_FROM_CATALOG",
      targetType: "Subject",
      targetId: created.id,
      afterValue: { catalogId: entry.id, name: created.name, code: created.code, branchId, linked: false },
    },
  });
  return "added";
}

/// Each attempt is its own transaction, so one refusal does not undo the others. A unique rule hit under a race (two people adding at once) is reported as a "clash", never as a 500.
async function addOne(actorUserId: string, catalogId: string, branchId: string): Promise<AddResult> {
  try {
    return await prisma.$transaction((tx) => addOneIn(tx, actorUserId, catalogId, branchId));
  } catch (error) {
    if (isTaken(error)) return "clash";
    throw error;
  }
}

/// A branch takes several entries (the administrator's "Add from catalogue"). The branch has been checked by the route. An unknown or archived entry is "gone" and names nothing.
export async function addEntriesToBranch(actorUserId: string, branchId: string, catalogIds: readonly string[]) {
  const out: { catalogId: string; name: string | null; result: AddResult }[] = [];
  for (const catalogId of [...new Set(catalogIds)]) {
    const result = await addOne(actorUserId, catalogId, branchId);
    const entry = result === "gone" ? null : await prisma.subjectCatalog.findUnique({ where: { id: catalogId }, select: { name: true } });
    out.push({ catalogId, name: entry?.name ?? null, result });
  }
  return out;
}

/// A superadmin puts one entry into several branches. Null when the entry does not exist; 409 when it is archived (restore it first). An unknown branch id is reported as "gone".
export async function addEntryToBranches(actorUserId: string, catalogId: string, branchIds: readonly string[]) {
  const entry = await prisma.subjectCatalog.findUnique({ where: { id: catalogId }, select: { archivedAt: true } });
  if (!entry) return null;
  if (entry.archivedAt) throw new ConflictError("This subject is archived in the catalogue. Restore it first.");
  const out: { branchId: string; branchName: string | null; result: AddResult }[] = [];
  for (const branchId of [...new Set(branchIds)]) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
    out.push({ branchId, branchName: branch?.name ?? null, result: branch ? await addOne(actorUserId, catalogId, branchId) : "gone" });
  }
  return out;
}
