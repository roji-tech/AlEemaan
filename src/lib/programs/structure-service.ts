import type { Prisma } from "@prisma/client";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { MAX_LEVELS, MAX_LIVE_GROUPS, cleanName, sameName } from "./rules";

// Programs, slice P1: the program's own level names and its tree of groups (design note 8.5). Every change takes the program's lock, makes its checks, then writes.

/// Replaces the level names. A level cannot be taken away while any group is at it (live or archived: the history would lose its place); more levels (up to four) can be added.
export async function setLevelLabels(actorUserId: string, programId: string, labels: string[]): Promise<Result<{ labels: string[] }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    if (labels.length > MAX_LEVELS) return refuse(400, "VALIDATION", `A program can have at most ${MAX_LEVELS} level names.`);
    const deepest = await tx.programGroup.aggregate({ where: { programId: program.id }, _max: { levelIndex: true } });
    const inUse = (deepest._max.levelIndex ?? -1) + 1;
    if (labels.length < inUse) {
      return refuse(
        409,
        "LEVEL_IN_USE",
        `Groups already exist at level ${inUse}. Archive and remove them from the program before taking that level away.`,
        [{ path: "body.labels", message: `Level ${inUse} has groups in it.` }],
      );
    }
    const before = (await tx.programLevelLabel.findMany({ where: { programId: program.id }, orderBy: { levelIndex: "asc" } })).map(
      (row) => row.name,
    );
    if (before.length === labels.length && before.every((name, i) => name === labels[i])) return done({ labels });
    await tx.programLevelLabel.deleteMany({ where: { programId: program.id } });
    await tx.programLevelLabel.createMany({ data: labels.map((name, levelIndex) => ({ programId: program.id, levelIndex, name })) });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "LEVELS_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before,
      after: labels,
    });
    return done({ labels });
  });
}

type Tx = Prisma.TransactionClient;

const liveSiblings = (tx: Tx, programId: string, parentId: string | null) =>
  tx.programGroup.findMany({
    where: { programId, parentId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

export async function createGroup(
  actorUserId: string,
  programId: string,
  input: { parentId?: string | null; name: string },
): Promise<Result<{ id: string; levelIndex: number }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const parent = input.parentId ? await tx.programGroup.findFirst({ where: { id: input.parentId, programId: program.id } }) : null;
    // A parent from another program, an unknown one and an archived one are all "not there": nothing about another program is revealed.
    if (input.parentId && (!parent || parent.archivedAt)) return refuse(404, "NOT_FOUND", "That group was not found.");
    const levelIndex = parent ? parent.levelIndex + 1 : 0;
    const labelCount = await tx.programLevelLabel.count({ where: { programId: program.id } });
    if (levelIndex >= labelCount) {
      return refuse(409, "NO_LEVEL", "The program has no level below this one. Add a level name first.", [
        { path: "body.parentId", message: "There is no level below this group." },
      ]);
    }
    if ((await tx.programGroup.count({ where: { programId: program.id, archivedAt: null } })) >= MAX_LIVE_GROUPS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_LIVE_GROUPS} groups.`);
    const siblings = await liveSiblings(tx, program.id, parent?.id ?? null);
    if (siblings.some((sibling) => sameName(sibling.name, input.name)))
      return refuse(409, "DUPLICATE", "There is already a group with this name here.", [
        { path: "body.name", message: "There is already a group with this name here." },
      ]);
    const created = await tx.programGroup.create({
      data: {
        programId: program.id,
        parentId: parent?.id ?? null,
        levelIndex,
        name: cleanName(input.name),
        sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((sibling) => sibling.sortOrder)) + 1,
      },
    });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "GROUP_ADDED",
      targetType: "ProgramGroup",
      targetId: created.id,
      after: { name: created.name, parentId: created.parentId, levelIndex },
    });
    return done({ id: created.id, levelIndex });
  });
}

export type GroupChange = { name: string } | { move: "up" | "down" } | { archived: boolean };

export async function updateGroup(
  actorUserId: string,
  programId: string,
  groupId: string,
  input: GroupChange,
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const group = await tx.programGroup.findFirst({ where: { id: groupId, programId: program.id } });
    if (!group) return refuse(404, "NOT_FOUND", "That group was not found.");

    if ("name" in input) {
      const siblings = await liveSiblings(tx, program.id, group.parentId);
      if (!group.archivedAt && siblings.some((sibling) => sibling.id !== group.id && sameName(sibling.name, input.name)))
        return refuse(409, "DUPLICATE", "There is already a group with this name here.", [
          { path: "body.name", message: "There is already a group with this name here." },
        ]);
      if (group.name === input.name) return done({ id: group.id });
      await tx.programGroup.update({ where: { id: group.id }, data: { name: input.name } });
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: "GROUP_RENAMED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { name: group.name },
        after: { name: input.name },
      });
      return done({ id: group.id });
    }

    if ("move" in input) {
      if (group.archivedAt) return refuse(409, "ARCHIVED", "An archived group can't be moved.");
      const siblings = await liveSiblings(tx, program.id, group.parentId);
      const at = siblings.findIndex((sibling) => sibling.id === group.id);
      const to = input.move === "up" ? at - 1 : at + 1;
      if (to < 0 || to >= siblings.length) return done({ id: group.id }); // already first / last: nothing to do
      // Renumber the siblings 0..n-1 in their current order, then swap the two: no two siblings ever share a place afterwards.
      const order = siblings.map((sibling) => sibling.id);
      [order[at], order[to]] = [order[to]!, order[at]!];
      for (const [index, id] of order.entries()) {
        const current = siblings.find((sibling) => sibling.id === id)!;
        if (current.sortOrder !== index) await tx.programGroup.update({ where: { id }, data: { sortOrder: index } });
      }
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: "GROUP_MOVED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { place: at },
        after: { place: to },
      });
      return done({ id: group.id });
    }

    if (input.archived) {
      if (group.archivedAt) return done({ id: group.id });
      const inside = await tx.programGroup.count({ where: { programId: program.id, parentId: group.id, archivedAt: null } });
      if (inside > 0) return refuse(409, "HAS_GROUPS", "This group has groups inside it. Archive those first.");
      // A group with people in it (their place is still open) is not archived: "move or withdraw them first". Groups inside it are archived by now, so these are its own.
      const people = await tx.programParticipant.count({ where: { programId: program.id, groupId: group.id, status: "ACTIVE" } });
      if (people > 0)
        return refuse(
          409,
          "HAS_PEOPLE",
          `${people} ${people === 1 ? "person is" : "people are"} in this group. Move or withdraw them first.`,
        );
      // A teacher or a recorder assigned to the group keeps the assignment only while the group is live: "remove the assignment first" (only places that are still open count).
      const assigned = await tx.programStaffGroup.count({
        where: { programId: program.id, groupId: group.id, staff: { status: "ACTIVE" } },
      });
      if (assigned > 0)
        return refuse(
          409,
          "HAS_STAFF",
          `${assigned} ${assigned === 1 ? "teacher or recorder is" : "teachers or recorders are"} assigned to this group. Remove the assignment first.`,
        );
      await tx.programGroup.update({ where: { id: group.id }, data: { archivedAt: new Date() } });
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: "GROUP_ARCHIVED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { name: group.name },
      });
      return done({ id: group.id });
    }

    if (!group.archivedAt) return done({ id: group.id });
    if (group.parentId) {
      const parent = await tx.programGroup.findUnique({ where: { id: group.parentId } });
      if (!parent || parent.archivedAt) return refuse(409, "PARENT_ARCHIVED", "Restore the group it was inside first.");
    }
    const siblings = await liveSiblings(tx, program.id, group.parentId);
    if (siblings.some((sibling) => sameName(sibling.name, group.name)))
      return refuse(409, "DUPLICATE", "There is already a group with this name here.");
    if ((await tx.programGroup.count({ where: { programId: program.id, archivedAt: null } })) >= MAX_LIVE_GROUPS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_LIVE_GROUPS} groups.`);
    await tx.programGroup.update({
      where: { id: group.id },
      data: { archivedAt: null, sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((sibling) => sibling.sortOrder)) + 1 },
    });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "GROUP_RESTORED",
      targetType: "ProgramGroup",
      targetId: group.id,
      after: { name: group.name },
    });
    return done({ id: group.id });
  });
}
