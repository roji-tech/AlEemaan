import { ProgramStaffRole, ProgramStaffStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAFF_ROLES, viewerOf } from "./access";
import { change, done, refuse, writeAudit, type Result } from "./common";

// Programs, slice P1: the program admins (design note 8.3). Only a super admin names or ends one, so nobody can promote themselves; the person must hold an active staff
// membership in a branch the program runs in, and the authority is read from that membership at every request (access.ts).

export async function nameProgramAdmin(
  actorUserId: string,
  programId: string,
  input: { userId: string; branchId: string },
): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "super", async ({ tx, program }) => {
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
      where: { programId_userId_role: { programId: program.id, userId: input.userId, role: ProgramStaffRole.ADMIN } },
    });
    if (existing?.status === ProgramStaffStatus.ACTIVE) return refuse(409, "ALREADY", "That person already runs this program.");
    const place = existing
      ? await tx.programStaff.update({
          where: { id: existing.id },
          data: { status: ProgramStaffStatus.ACTIVE, branchId: input.branchId, endedAt: null, createdByUserId: actorUserId },
        })
      : await tx.programStaff.create({
          data: {
            programId: program.id,
            userId: input.userId,
            branchId: input.branchId,
            role: ProgramStaffRole.ADMIN,
            createdByUserId: actorUserId,
          },
        });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "ADMIN_NAMED",
      targetType: "User",
      targetId: input.userId,
      after: { name: membership.user.name ?? membership.user.email, branchId: input.branchId, role: "ADMIN" },
    });
    return done({ id: place.id });
  });
}

export async function endProgramAdmin(actorUserId: string, programId: string, staffId: string): Promise<Result<{ id: string }>> {
  return change(actorUserId, programId, "super", async ({ tx, program }) => {
    const place = await tx.programStaff.findFirst({
      where: { id: staffId, programId: program.id, role: ProgramStaffRole.ADMIN },
      include: { membership: { select: { user: { select: { name: true, email: true } } } } },
    });
    if (!place) return refuse(404, "NOT_FOUND", "That person was not found.");
    if (place.status === ProgramStaffStatus.ENDED) return done({ id: place.id });
    await tx.programStaff.update({ where: { id: place.id }, data: { status: ProgramStaffStatus.ENDED, endedAt: new Date() } });
    await writeAudit(tx, {
      programId: program.id,
      actorUserId,
      action: "ADMIN_ENDED",
      targetType: "User",
      targetId: place.userId,
      before: { name: place.membership.user.name ?? place.membership.user.email, branchId: place.branchId },
    });
    return done({ id: place.id });
  });
}

export type Candidate = { userId: string; name: string; email: string | null; branchId: string; branchName: string; role: string };

/// Who could be named: the active staff of the branches the program runs in, minus those who already run it. A super admin only.
export async function candidatesFor(userId: string, programId: string): Promise<Result<Candidate[]>> {
  const viewer = await viewerOf(userId, programId);
  if (!viewer) return refuse(404, "NOT_FOUND", "That program was not found.");
  if (viewer.level !== "SUPER") return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  const [links, running] = await Promise.all([
    prisma.programBranch.findMany({ where: { programId }, select: { branchId: true } }),
    prisma.programStaff.findMany({
      where: { programId, role: ProgramStaffRole.ADMIN, status: ProgramStaffStatus.ACTIVE },
      select: { userId: true },
    }),
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
