import { ProgramStaffRole, ProgramStaffStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAFF_ROLES, viewerOf } from "./access";
import { change, done, refuse, writeAudit, type Result } from "./common";

// Programs: the people who run and teach in a program (design note 8.3; slice P3 added supervisors, teachers and recorders and the groups they are assigned to). Only a super
// admin names or ends a program admin, so nobody can promote themselves; the person must hold an active staff membership in a branch the program runs in, and the authority is
// read from that membership at every request (access.ts).

export const GROUP_ROLES: readonly ProgramStaffRole[] = [ProgramStaffRole.TEACHER, ProgramStaffRole.RECORDER];
const ROLE_TEXT: Record<ProgramStaffRole, string> = {
  ADMIN: "run this program",
  SUPERVISOR: "supervise this program",
  TEACHER: "teach in this program",
  RECORDER: "record for this program",
};

/// Names a person to a role in the program (slice P3 widened P1's "name a program admin"). Only a super admin names a program ADMIN, so nobody can promote themselves; a super admin
/// and a program admin name a SUPERVISOR (reads and corrects everything), a TEACHER or a RECORDER (take attendance for the groups they are assigned to). The person must hold an
/// active staff membership in a branch the program runs in, and the authority is read from that membership at every request (access.ts).
export async function nameProgramStaff(
  actorUserId: string,
  programId: string,
  input: { userId: string; branchId: string; role: ProgramStaffRole },
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, input.role === ProgramStaffRole.ADMIN ? "super" : "manage", async ({ tx, program }) => {
    const linked = await tx.programBranch.findUnique({
      where: { programId_branchId: { programId: program.id, branchId: input.branchId } },
    });
    if (!linked)
      return refuse(400, "VALIDATION", "The program does not run in that branch.", [
        { path: "body.branchId", message: "The program does not run in that branch." },
      ]);
    const membership = await tx.membership.findFirst({
      where: { userId: input.userId, branchId: input.branchId, deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
      select: { user: { select: { name: true, email: true } } },
    });
    if (!membership)
      return refuse(400, "VALIDATION", "That person is not a member of staff in that branch.", [
        { path: "body.userId", message: "That person is not a member of staff in that branch." },
      ]);

    const existing = await tx.programStaff.findUnique({
      where: { programId_userId_role: { programId: program.id, userId: input.userId, role: input.role } },
    });
    if (existing?.status === ProgramStaffStatus.ACTIVE)
      return refuse(409, "ALREADY", `That person already does this: they ${ROLE_TEXT[input.role]}.`);
    // A place that was ended and is named again starts with NO groups: an old assignment must never come back by itself (it is in the audit, if anyone wants to give it again).
    if (existing) await tx.programStaffGroup.deleteMany({ where: { programStaffId: existing.id } });
    const place = existing
      ? await tx.programStaff.update({
          where: { id: existing.id },
          data: { status: ProgramStaffStatus.ACTIVE, branchId: input.branchId, endedAt: null, createdByUserId: actorUserId },
        })
      : await tx.programStaff.create({
          data: { programId: program.id, userId: input.userId, branchId: input.branchId, role: input.role, createdByUserId: actorUserId },
        });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: input.role === ProgramStaffRole.ADMIN ? "ADMIN_NAMED" : "STAFF_NAMED",
      targetType: "User",
      targetId: input.userId,
      after: { name: membership.user.name ?? membership.user.email, branchId: input.branchId, role: input.role },
    });
    return done({ id: place.id });
  });
}

/// Ends a place in the program's staff (kept as history, with its group assignments, which stop counting at once because the place is no longer active). A program ADMIN's place is
/// ended by a super admin only; any other by a super admin or a program admin.
export async function endProgramStaff(actorUserId: string, programId: string, staffId: string): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program, viewer }) => {
    const place = await tx.programStaff.findFirst({
      where: { id: staffId, programId: program.id },
      include: { membership: { select: { user: { select: { name: true, email: true } } } } },
    });
    if (!place) return refuse(404, "NOT_FOUND", "That person was not found.");
    if (place.role === ProgramStaffRole.ADMIN && viewer.level !== "SUPER")
      return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    if (place.status === ProgramStaffStatus.ENDED) return done({ id: place.id });
    await tx.programStaff.update({ where: { id: place.id }, data: { status: ProgramStaffStatus.ENDED, endedAt: new Date() } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: place.role === ProgramStaffRole.ADMIN ? "ADMIN_ENDED" : "STAFF_ENDED",
      targetType: "User",
      targetId: place.userId,
      before: { name: place.membership.user.name ?? place.membership.user.email, branchId: place.branchId, role: place.role },
    });
    return done({ id: place.id });
  });
}

export const MAX_ASSIGNED_GROUPS = 200;

/// Replaces the groups a TEACHER or a RECORDER is assigned to. An assignment covers the groups inside it; a supervisor and an admin reach every group and take none.
export async function setStaffGroups(
  actorUserId: string,
  programId: string,
  staffId: string,
  groupIds: string[],
): Promise<Result<{ groupIds: string[] }>> {
  return change(actorUserId, programId, "manage", async ({ tx, program }) => {
    const place = await tx.programStaff.findFirst({
      where: { id: staffId, programId: program.id, status: ProgramStaffStatus.ACTIVE },
      include: { groups: true },
    });
    if (!place) return refuse(404, "NOT_FOUND", "That person was not found.");
    if (!GROUP_ROLES.includes(place.role))
      return refuse(
        409,
        "NO_GROUPS_FOR_ROLE",
        "A supervisor and a program admin reach every group. Only a teacher or a recorder is given groups.",
      );
    const wanted = [...new Set(groupIds)];
    if (wanted.length > MAX_ASSIGNED_GROUPS) return refuse(400, "VALIDATION", `At most ${MAX_ASSIGNED_GROUPS} groups.`);
    const live = await tx.programGroup.findMany({ where: { programId: program.id, archivedAt: null }, select: { id: true } });
    const liveIds = new Set(live.map((group) => group.id));
    // A group of another program, an archived one and an unknown one are all "not there".
    if (wanted.some((id) => !liveIds.has(id))) return refuse(404, "NOT_FOUND", "That group was not found.");
    const before = place.groups.map((row) => row.groupId).sort();
    const after = [...wanted].sort();
    if (before.length === after.length && before.every((id, i) => id === after[i])) return done({ groupIds: after });
    await tx.programStaffGroup.deleteMany({ where: { programStaffId: place.id, groupId: { notIn: wanted } } });
    const have = new Set(before);
    const fresh = wanted.filter((id) => !have.has(id));
    if (fresh.length > 0)
      await tx.programStaffGroup.createMany({
        data: fresh.map((groupId) => ({ programStaffId: place.id, programId: program.id, groupId, createdByUserId: actorUserId })),
      });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "STAFF_GROUPS_CHANGED",
      targetType: "User",
      targetId: place.userId,
      before: { role: place.role, groupIds: before },
      after: { role: place.role, groupIds: after },
    });
    return done({ groupIds: after });
  });
}

export type Candidate = { userId: string; name: string; email: string | null; branchId: string; branchName: string; role: string };

/// Who could be named to `role`: the active staff of the branches the program runs in, minus those who already hold that role. A program ADMIN is named by a super admin only, so only
/// a super admin sees candidates for it; the other roles are named by a super admin or a program admin.
export async function candidatesFor(
  userId: string,
  programId: string,
  role: ProgramStaffRole = ProgramStaffRole.ADMIN,
): Promise<Result<Candidate[]>> {
  const viewer = await viewerOf(userId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", "That program was not found.");
  if (role === ProgramStaffRole.ADMIN ? viewer.level !== "SUPER" : viewer.level !== "SUPER" && viewer.level !== "ADMIN")
    return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  const [links, running] = await Promise.all([
    prisma.programBranch.findMany({ where: { programId }, select: { branchId: true } }),
    prisma.programStaff.findMany({ where: { programId, role, status: ProgramStaffStatus.ACTIVE }, select: { userId: true } }),
  ]);
  const already = new Set(running.map((row) => row.userId));
  const members = await prisma.membership.findMany({
    where: { branchId: { in: links.map((link) => link.branchId) }, deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
    include: { user: { select: { name: true, email: true } }, branch: { select: { name: true } } },
    orderBy: [{ user: { name: "asc" } }],
    take: 500,
  });
  return done(
    members
      .filter((member) => !already.has(member.userId))
      .map((member) => ({
        userId: member.userId,
        name: member.user.name ?? member.user.email ?? "Unnamed",
        email: member.user.email,
        branchId: member.branchId,
        branchName: member.branch.name,
        role: member.role,
      })),
  );
}
