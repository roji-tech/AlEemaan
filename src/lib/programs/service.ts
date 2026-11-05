import { Prisma, ProgramKind, ProgramStaffStatus, ProgramStatus, type Program } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canManage, levelsOf, viewerOf, type ProgramViewer } from "./access";
import { NOT_FOUND, change, done, refuse, schoolEnabled, writeAudit, type Result } from "./common";
import { branchesTakingPart } from "./settings-service";
import { mayReadGroup } from "./attendance-rules";
import { accessOf, attendanceStateOf } from "./attendance-service";
import { peopleByGroup } from "./people-service";
import { endDateFor, groupPath, isEditableStatus, parseIsoDate, statusAfter, toIsoDate, type StatusAction } from "./rules";
import type { CreateProgramInput, UpdateProgramInput } from "./validation";

// Programs, slice P1: reading, creating, changing and the lifecycle of a program, and the branches it runs in. The structure (levels, groups) is in structure-service.ts,
// the program admins in staff-service.ts, the school's switch in settings-service.ts.

const dateOrNull = (date: Date | null): string | null => (date ? toIsoDate(date) : null);

export type ProgramSummary = {
  id: string;
  name: string;
  kind: ProgramKind;
  status: ProgramStatus;
  startsOn: string | null;
  endsOn: string | null;
  access: ProgramViewer["level"];
  branches: { id: string; name: string }[];
  groupCount: number;
};

export async function listPrograms(userId: string): Promise<{ enabled: boolean; programs: ProgramSummary[] }> {
  const levels = await levelsOf(userId);
  const enabled = (await schoolEnabled()) !== false;
  // With programs switched off the school's super admin can still read what exists; nobody else is shown anything.
  if (!enabled && !levels.superAdmin) return { enabled, programs: [] };
  const rows = await prisma.program.findMany({
    where: levels.superAdmin ? {} : { id: { in: [...levels.admin, ...levels.branch, ...levels.staff] } },
    orderBy: [{ name: "asc" }],
    include: {
      branches: { include: { branch: { select: { id: true, name: true } } }, orderBy: { branch: { name: "asc" } } },
      _count: { select: { groups: { where: { archivedAt: null } } } },
    },
  });
  const order: Record<ProgramStatus, number> = { ACTIVE: 0, DRAFT: 1, COMPLETED: 2, ARCHIVED: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  return {
    enabled,
    programs: rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      startsOn: dateOrNull(row.startsOn),
      endsOn: dateOrNull(row.endsOn),
      access: levels.superAdmin ? "SUPER" : levels.admin.has(row.id) ? "ADMIN" : levels.branch.has(row.id) ? "BRANCH" : "STAFF",
      branches: row.branches.map((link) => link.branch),
      groupCount: row._count.groups,
    })),
  };
}

export type ProgramDetail = {
  id: string;
  name: string;
  description: string | null;
  kind: ProgramKind;
  status: ProgramStatus;
  startsOn: string | null;
  endsOn: string | null;
  ownBranchId: string | null;
  createdAt: string;
  access: ProgramViewer["level"];
  /// What this person may do here, decided on the server (a button is shown from this and every action checks again).
  can: { editDetails: boolean; editStructure: boolean; administer: boolean; restore: boolean; people: boolean; settings: boolean };
  /// The branches whose people this viewer may add and manage: every branch of the program for a super admin and a program admin, their own for a branch administrator.
  manageBranchIds: string[];
  /// Attendance (slice P3): whether it is on for this program and who decided if not, the program's own switch and threshold, the groups this person may read the roll of, and the
  /// groups they may mark. A courtesy for the screens: every route checks again.
  attendance: {
    on: boolean;
    offBy: "SCHOOL" | "PROGRAM" | "BRANCH" | null;
    branchesOff: { id: string; name: string }[];
    enabled: boolean;
    lowPercent: number;
    readGroupIds: string[];
    markGroupIds: string[];
  };
  /// Programs are switched off for the school: the program is read only.
  switchedOff: boolean;
  branches: { id: string; name: string; own: boolean; takingPart: boolean }[];
  levelLabels: string[];
  /// `people`: the places still open in the group and in the groups inside it, among the people this viewer may see (slice P2).
  groups: {
    id: string;
    parentId: string | null;
    levelIndex: number;
    name: string;
    sortOrder: number;
    archived: boolean;
    path: string;
    people: number;
  }[];
  /// `groupIds`: for a teacher or a recorder, the groups they are assigned to (empty for the other roles).
  staff: {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    branchId: string;
    branchName: string;
    role: string;
    groupIds: string[];
  }[];
  /// The latest entries, for the people who may manage the program.
  audit: { id: string; action: string; targetType: string; actor: string; at: string; reason: string | null }[] | null;
};

const AUDIT_SHOWN = 50;

export async function getProgram(userId: string, programId: string): Promise<Result<ProgramDetail>> {
  const viewer = await viewerOf(userId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      branches: { include: { branch: { select: { id: true, name: true } } } },
      levelLabels: { orderBy: { levelIndex: "asc" } },
      groups: { orderBy: [{ levelIndex: "asc" }, { sortOrder: "asc" }, { name: "asc" }] },
      staff: {
        where: { status: ProgramStaffStatus.ACTIVE },
        include: {
          membership: { include: { user: { select: { name: true, email: true } }, branch: { select: { name: true } } } },
          groups: { select: { groupId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!program) return refuse(404, "NOT_FOUND", NOT_FOUND);

  const manage = canManage(viewer);
  const switchedOff = (await schoolEnabled()) === false;
  const taking = await branchesTakingPart(program.branches.map((link) => link.branchId));
  const editable = manage && !switchedOff && isEditableStatus(program.status);
  const nodes = program.groups.map((group) => ({ id: group.id, parentId: group.parentId, name: group.name }));
  const headCounts = await peopleByGroup(viewer, programId, nodes);
  const [attendance, access] = await Promise.all([
    attendanceStateOf(programId, program.attendanceEnabled),
    accessOf(userId, programId, viewer),
  ]);
  const liveGroups = program.groups.filter((group) => group.archivedAt === null).map((group) => group.id);

  let audit: ProgramDetail["audit"] = null;
  if (manage) {
    const rows = await prisma.programAudit.findMany({ where: { programId }, orderBy: { createdAt: "desc" }, take: AUDIT_SHOWN });
    const actors = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.actorUserId))] } },
      select: { id: true, name: true, email: true },
    });
    const nameOf = new Map(actors.map((actor) => [actor.id, actor.name ?? actor.email ?? "Someone"]));
    audit = rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      actor: nameOf.get(row.actorUserId) ?? "A person who has left",
      at: row.createdAt.toISOString(),
      reason: row.reason,
    }));
  }

  return done({
    id: program.id,
    name: program.name,
    description: program.description,
    kind: program.kind,
    status: program.status,
    startsOn: dateOrNull(program.startsOn),
    endsOn: dateOrNull(program.endsOn),
    ownBranchId: program.ownBranchId,
    createdAt: program.createdAt.toISOString(),
    access: viewer.level,
    can: {
      editDetails: editable,
      editStructure: editable,
      administer: viewer.level === "SUPER" && !switchedOff && isEditableStatus(program.status),
      restore: viewer.level === "SUPER" && !switchedOff && program.status === ProgramStatus.ARCHIVED,
      people: viewer.level !== "STAFF" && !switchedOff && isEditableStatus(program.status),
      settings: editable,
    },
    manageBranchIds:
      viewer.level === "STAFF" ? [] : viewer.level === "BRANCH" ? viewer.branchIds : program.branches.map((link) => link.branchId),
    attendance: {
      on: attendance.on,
      offBy: attendance.offBy,
      branchesOff: attendance.branchesOff,
      enabled: program.attendanceEnabled,
      lowPercent: program.lowAttendancePercent,
      readGroupIds: liveGroups.filter((id) => mayReadGroup(access, id)),
      markGroupIds: liveGroups.filter((id) => access.markAll || access.groups.has(id)),
    },
    switchedOff,
    branches: program.branches
      .map((link) => ({
        id: link.branch.id,
        name: link.branch.name,
        own: program.ownBranchId === link.branchId,
        takingPart: taking.get(link.branchId) ?? true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    levelLabels: program.levelLabels.map((label) => label.name),
    groups: program.groups.map((group) => ({
      id: group.id,
      parentId: group.parentId,
      levelIndex: group.levelIndex,
      name: group.name,
      sortOrder: group.sortOrder,
      archived: group.archivedAt !== null,
      path: groupPath(nodes, group.id),
      people: headCounts[group.id] ?? 0,
    })),
    // A branch administrator reads the structure and who runs the program, without the e-mail addresses of staff of other branches.
    staff: program.staff.map((place) => ({
      id: place.id,
      userId: place.userId,
      name: place.membership.user.name ?? place.membership.user.email ?? "Unnamed",
      email: manage ? place.membership.user.email : null,
      branchId: place.branchId,
      branchName: place.membership.branch.name,
      role: place.role,
      groupIds: place.groups.map((row) => row.groupId),
    })),
    audit,
  });
}

async function liveNameTaken(tx: Prisma.TransactionClient, name: string, exceptId?: string): Promise<boolean> {
  const found = await tx.program.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      status: { not: ProgramStatus.ARCHIVED },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

/// Creates a program. A super admin only (checked by the route and here): a program reaches across branches, which is school-wide authority.
export async function createProgram(actorUserId: string, input: CreateProgramInput): Promise<Result<{ id: string }>> {
  if ((await schoolEnabled()) === false) return refuse(409, "PROGRAMS_OFF", "Programs are switched off for the school.");
  const startsOn = input.startsOn ? parseIsoDate(input.startsOn) : null;
  let endsOn = input.endsOn ? parseIsoDate(input.endsOn) : null;
  if (input.kind === ProgramKind.FIXED_TERM && startsOn && input.duration) endsOn = endDateFor(startsOn, input.duration);

  const branches =
    input.branchIds.length > 0
      ? await prisma.branch.findMany({ where: { id: { in: input.branchIds } }, select: { id: true, name: true } })
      : [];
  if (branches.length !== input.branchIds.length)
    return refuse(400, "VALIDATION", "One of the branches was not found.", [
      { path: "body.branchIds", message: "One of the branches was not found." },
    ]);
  const taking = await branchesTakingPart(branches.map((branch) => branch.id));
  const off = branches.filter((branch) => taking.get(branch.id) === false);
  if (off.length > 0) {
    const message = `${off.map((branch) => branch.name).join(", ")} ${off.length === 1 ? "has" : "have"} switched programs off.`;
    return refuse(409, "BRANCH_PROGRAMS_OFF", message, [{ path: "body.branchIds", message }]);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (await liveNameTaken(tx, input.name))
        return refuse(409, "DUPLICATE", "A program with this name already exists.", [
          { path: "body.name", message: "A program with this name already exists." },
        ]);
      const ownBranch = input.ownBranch ? await tx.branch.create({ data: { name: input.ownBranch.name } }) : null;
      const linked = [...branches.map((branch) => branch.id), ...(ownBranch ? [ownBranch.id] : [])];
      const program = await tx.program.create({
        data: {
          name: input.name,
          description: input.description?.trim() || null,
          kind: input.kind,
          status: ProgramStatus.DRAFT,
          startsOn,
          endsOn: input.kind === ProgramKind.FIXED_TERM ? endsOn : null,
          ownBranchId: ownBranch?.id ?? null,
          createdByUserId: actorUserId,
          branches: { create: linked.map((branchId) => ({ branchId })) },
          levelLabels: { create: input.levelLabels.map((name, levelIndex) => ({ levelIndex, name })) },
        },
      });
      if (ownBranch) {
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "BRANCH_CREATED",
            targetType: "Branch",
            targetId: ownBranch.id,
            afterValue: { name: ownBranch.name, programId: program.id },
          },
        });
      }
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: "PROGRAM_CREATED",
        targetType: "Program",
        targetId: program.id,
        after: {
          name: program.name,
          kind: program.kind,
          startsOn: dateOrNull(program.startsOn),
          endsOn: dateOrNull(program.endsOn),
          branches: linked,
          ownBranchId: ownBranch?.id ?? null,
          levelLabels: input.levelLabels,
        },
      });
      return done({ id: program.id });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      return target.includes("Branch")
        ? refuse(409, "DUPLICATE", "A branch with this name already exists.", [
            { path: "body.ownBranch.name", message: "A branch with this name already exists." },
          ])
        : refuse(409, "DUPLICATE", "A program with this name already exists.", [
            { path: "body.name", message: "A program with this name already exists." },
          ]);
    }
    throw error;
  }
}

export async function updateProgram(actorUserId: string, programId: string, input: UpdateProgramInput): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const bad = (path: string, message: string) => refuse(400, "VALIDATION", message, [{ path: `body.${path}`, message }]);
    const startsOn = input.startsOn === undefined ? program.startsOn : input.startsOn === null ? null : parseIsoDate(input.startsOn);
    const endsOn = input.endsOn === undefined ? program.endsOn : input.endsOn === null ? null : parseIsoDate(input.endsOn);
    if (program.kind === ProgramKind.ONGOING && input.endsOn) return bad("endsOn", "A program that never ends has no end date.");
    if (program.kind === ProgramKind.FIXED_TERM) {
      if (!startsOn) return bad("startsOn", "A program for a period needs a start date.");
      if (!endsOn) return bad("endsOn", "A program for a period needs an end date.");
      if (endsOn <= startsOn) return bad("endsOn", "The end date must be after the start date.");
    }
    if (
      input.name !== undefined &&
      input.name.toLowerCase() !== program.name.toLowerCase() &&
      (await liveNameTaken(tx, input.name, program.id))
    )
      return refuse(409, "DUPLICATE", "A program with this name already exists.", [
        { path: "body.name", message: "A program with this name already exists." },
      ]);

    const data: Prisma.ProgramUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const track = <K extends keyof Program>(key: K, was: unknown, now: unknown) => {
      if (JSON.stringify(was) === JSON.stringify(now)) return false;
      before[key] = was;
      after[key] = now;
      return true;
    };
    if (input.name !== undefined && track("name", program.name, input.name)) data.name = input.name;
    if (input.description !== undefined) {
      const next = input.description === null || input.description.trim() === "" ? null : input.description.trim();
      if (track("description", program.description, next)) data.description = next;
    }
    if (input.startsOn !== undefined && track("startsOn", dateOrNull(program.startsOn), dateOrNull(startsOn))) data.startsOn = startsOn;
    if (input.endsOn !== undefined && track("endsOn", dateOrNull(program.endsOn), dateOrNull(endsOn))) data.endsOn = endsOn;
    if (Object.keys(data).length === 0) return done({ id: program.id });

    await tx.program.update({ where: { id: program.id }, data });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "PROGRAM_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before: before as Prisma.InputJsonObject,
      after: after as Prisma.InputJsonObject,
    });
    return done({ id: program.id });
  });
}

/// Activate, archive (a program or a draft; read only afterwards) or restore (a super admin brings an archived program back as a draft). COMPLETED is reached only by
/// slice P5's complete action.
export async function changeStatus(
  actorUserId: string,
  programId: string,
  action: StatusAction,
): Promise<Result<{ status: ProgramStatus }>> {
  return change(
    actorUserId,
    programId,
    action === "restore" ? "super" : "manage",
    async ({ tx, program }) => {
      const next = statusAfter(action, program.status);
      if (!next) return refuse(409, "NOT_APPLICABLE", `A ${program.status.toLowerCase()} program can't be ${action}d.`);
      if (action === "restore" && (await liveNameTaken(tx, program.name, program.id)))
        return refuse(409, "DUPLICATE", "Another program now has this name. Rename that one first.");
      await tx.program.update({
        where: { id: program.id },
        data: { status: next, archivedAt: next === ProgramStatus.ARCHIVED ? new Date() : null },
      });
      await writeAudit(tx, {
        programId: program.id,
        actorUserId,
        action: action === "activate" ? "PROGRAM_ACTIVATED" : action === "archive" ? "PROGRAM_ARCHIVED" : "PROGRAM_RESTORED",
        targetType: "Program",
        targetId: program.id,
        before: { status: program.status },
        after: { status: next },
      });
      return done({ status: next });
    },
    { allowArchived: action === "restore" },
  );
}

export async function linkBranch(actorUserId: string, programId: string, branchId: string): Promise<Result<{ branchId: string }>> {
  return change(actorUserId, programId, "super", async ({ tx, program }) => {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    if (!branch) return refuse(404, "NOT_FOUND", "That branch was not found.");
    if (await tx.programBranch.findUnique({ where: { programId_branchId: { programId: program.id, branchId } } }))
      return refuse(409, "ALREADY_LINKED", "The program already runs in this branch.");
    if ((await branchesTakingPart([branchId])).get(branchId) === false)
      return refuse(409, "BRANCH_PROGRAMS_OFF", `${branch.name} has switched programs off.`);
    await tx.programBranch.create({ data: { programId: program.id, branchId } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "BRANCH_LINKED",
      targetType: "Branch",
      targetId: branchId,
      after: { name: branch.name },
    });
    return done({ branchId });
  });
}

export async function unlinkBranch(actorUserId: string, programId: string, branchId: string): Promise<Result<{ branchId: string }>> {
  return change(actorUserId, programId, "super", async ({ tx, program }) => {
    const link = await tx.programBranch.findUnique({
      where: { programId_branchId: { programId: program.id, branchId } },
      include: { branch: { select: { name: true } } },
    });
    if (!link) return refuse(404, "NOT_FOUND", "The program does not run in that branch.");
    if (program.ownBranchId === branchId) return refuse(409, "OWN_BRANCH", "A program can't leave its own branch.");
    if ((await tx.programBranch.count({ where: { programId: program.id } })) <= 1)
      return refuse(409, "LAST_BRANCH", "A program must run in at least one branch.");
    const serving = await tx.programStaff.count({ where: { programId: program.id, branchId, status: ProgramStaffStatus.ACTIVE } });
    if (serving > 0) return refuse(409, "BRANCH_IN_USE", "End the program admins who serve through this branch first.");
    // People are in the program THROUGH a branch (the database's foreign key refuses the removal too): a person who has left still counts, because their history stays with it.
    if ((await tx.programParticipant.count({ where: { programId: program.id, branchId } })) > 0)
      return refuse(
        409,
        "BRANCH_HAS_PEOPLE",
        "People are, or were, in the program through this branch, so it can't be removed. Their history stays with it.",
      );
    await tx.programBranch.delete({ where: { programId_branchId: { programId: program.id, branchId } } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "BRANCH_UNLINKED",
      targetType: "Branch",
      targetId: branchId,
      before: { name: link.branch.name },
    });
    return done({ branchId });
  });
}
