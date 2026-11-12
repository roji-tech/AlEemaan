import { ProgramStaffRole, ProgramStaffStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, isSuperAdmin } from "@/lib/auth/branch-access";
import { groupAndInner } from "./people-rules";

// Who may see and change a program (task 0043, section 8.3). Read at every request from the live data: an ended program admin, a deactivated membership or an unlinked
// branch loses the authority at once, with nothing to clean up. A program the person has no place in is "not found", exactly like one that does not exist.

/// SUPER: a super admin. ADMIN: a program admin (named by a super admin, holding an active staff membership in a branch the program runs in). BRANCH: an administrator
/// of a branch the program runs in - they read the program and (from slice P2) manage their own branch's people, never its structure.
/// STAFF (slice P3): a supervisor, a teacher or a recorder of the program, named by a super admin or a program admin. They READ the program; what else they may do is decided per
/// group (a supervisor reads and corrects everything; a teacher or a recorder takes attendance for the groups they are assigned to) and never by this level.
export type ProgramViewer =
  | { level: "SUPER" }
  | { level: "ADMIN" }
  | { level: "BRANCH"; branchIds: string[] }
  | { level: "STAFF"; userId: string; supervisor: boolean };

export const canManage = (viewer: ProgramViewer): boolean => viewer.level === "SUPER" || viewer.level === "ADMIN";

/// The roles of a membership that can carry a program role (a pupil's or parent's membership cannot).
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

const liveAdminPlaces = (userId: string) =>
  prisma.programStaff.findMany({
    where: {
      userId,
      role: ProgramStaffRole.ADMIN,
      status: ProgramStaffStatus.ACTIVE,
      membership: { deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
    },
    select: { programId: true, branchId: true },
  });

const STAFF_PLACE_ROLES = [ProgramStaffRole.SUPERVISOR, ProgramStaffRole.TEACHER, ProgramStaffRole.RECORDER];

/// The live places a person holds as a supervisor, teacher or recorder: the place is active and the membership behind it is an active staff one (a deactivated membership ends the
/// authority at once, as for a program admin).
const liveStaffPlaces = (userId: string, programId?: string) =>
  prisma.programStaff.findMany({
    where: {
      userId,
      ...(programId ? { programId } : {}),
      role: { in: STAFF_PLACE_ROLES },
      status: ProgramStaffStatus.ACTIVE,
      membership: { deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
    },
    select: { id: true, programId: true, branchId: true, role: true },
  });

/// The groups a teacher or a recorder is assigned to in a program, and everything inside them. A supervisor and an administrator reach every group and do not need this.
export async function assignedGroupIds(userId: string, programId: string): Promise<string[]> {
  const [places, linked] = await Promise.all([
    liveStaffPlaces(userId, programId),
    prisma.programBranch.findMany({ where: { programId }, select: { branchId: true } }),
  ]);
  const branches = new Set(linked.map((link) => link.branchId));
  const mine = places.filter((place) => place.role !== ProgramStaffRole.SUPERVISOR && branches.has(place.branchId));
  if (mine.length === 0) return [];
  const [assigned, groups] = await Promise.all([
    prisma.programStaffGroup.findMany({ where: { programStaffId: { in: mine.map((place) => place.id) } }, select: { groupId: true } }),
    prisma.programGroup.findMany({ where: { programId }, select: { id: true, parentId: true, name: true } }),
  ]);
  return [...new Set(assigned.flatMap((row) => groupAndInner(groups, row.groupId)))];
}

/// The groups (and everything inside them) a teacher and a recorder are each assigned to, kept apart (progress records let the program choose which of the two write).
export async function assignedGroupsByRole(userId: string, programId: string): Promise<{ TEACHER: string[]; RECORDER: string[] }> {
  const [places, linked, groups] = await Promise.all([
    liveStaffPlaces(userId, programId),
    prisma.programBranch.findMany({ where: { programId }, select: { branchId: true } }),
    prisma.programGroup.findMany({ where: { programId }, select: { id: true, parentId: true, name: true } }),
  ]);
  const branches = new Set(linked.map((link) => link.branchId));
  const out = { TEACHER: [] as string[], RECORDER: [] as string[] };
  for (const role of ["TEACHER", "RECORDER"] as const) {
    const mine = places.filter((place) => place.role === role && branches.has(place.branchId));
    if (mine.length === 0) continue;
    const assigned = await prisma.programStaffGroup.findMany({
      where: { programStaffId: { in: mine.map((place) => place.id) } },
      select: { groupId: true },
    });
    out[role] = [...new Set(assigned.flatMap((row) => groupAndInner(groups, row.groupId)))];
  }
  return out;
}

/// Whether the person is an active supervisor of the program (reads and corrects every group).
export async function isSupervisor(userId: string, programId: string): Promise<boolean> {
  const [places, linked] = await Promise.all([
    liveStaffPlaces(userId, programId),
    prisma.programBranch.findMany({ where: { programId }, select: { branchId: true } }),
  ]);
  const branches = new Set(linked.map((link) => link.branchId));
  return places.some((place) => place.role === ProgramStaffRole.SUPERVISOR && branches.has(place.branchId));
}

export async function viewerOf(userId: string, programId: string): Promise<ProgramViewer | null> {
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { branches: { select: { branchId: true } } } });
  if (!program) return null;
  if (await isSuperAdmin(userId)) return { level: "SUPER" };
  const linked = new Set(program.branches.map((link) => link.branchId));
  const places = await liveAdminPlaces(userId);
  if (places.some((place) => place.programId === programId && linked.has(place.branchId))) return { level: "ADMIN" };
  const scope = await adminScope(userId);
  const mine = [...linked].filter((branchId) => scope.branchIds.includes(branchId));
  if (mine.length > 0) return { level: "BRANCH", branchIds: mine };
  const staff = (await liveStaffPlaces(userId, programId)).filter((place) => linked.has(place.branchId));
  return staff.length > 0
    ? { level: "STAFF", userId, supervisor: staff.some((place) => place.role === ProgramStaffRole.SUPERVISOR) }
    : null;
}

/// For each program the person can see, how: as a super admin (everything), as a program admin, or as an administrator of a branch it runs in. A program admin who is also
/// a branch administrator counts as a program admin (the wider of the two).
export async function levelsOf(
  userId: string,
): Promise<{ superAdmin: boolean; admin: Set<string>; branch: Set<string>; staff: Set<string> }> {
  if (await isSuperAdmin(userId)) return { superAdmin: true, admin: new Set(), branch: new Set(), staff: new Set() };
  const [places, scope, staffPlaces] = await Promise.all([liveAdminPlaces(userId), adminScope(userId), liveStaffPlaces(userId)]);
  const programsOf = (where: { programId: string; branchId: string }[]) =>
    where.length === 0
      ? Promise.resolve([] as { programId: string }[])
      : prisma.programBranch.findMany({ where: { OR: where }, select: { programId: true } });
  const [asProgramAdmin, asBranchAdmin, asStaff] = await Promise.all([
    programsOf(places.map((place) => ({ programId: place.programId, branchId: place.branchId }))),
    scope.branchIds.length === 0
      ? Promise.resolve([] as { programId: string }[])
      : prisma.programBranch.findMany({ where: { branchId: { in: [...scope.branchIds] } }, select: { programId: true } }),
    programsOf(staffPlaces.map((place) => ({ programId: place.programId, branchId: place.branchId }))),
  ]);
  const admin = new Set(asProgramAdmin.map((row) => row.programId));
  const branch = new Set(asBranchAdmin.map((row) => row.programId).filter((id) => !admin.has(id)));
  const staff = new Set(asStaff.map((row) => row.programId).filter((id) => !admin.has(id) && !branch.has(id)));
  return { superAdmin: false, admin, branch, staff };
}

/// Every program the person may see: "all" for a super admin, otherwise the ids of the programs they run or that run in a branch they administer.
export async function visibleProgramIds(userId: string): Promise<"all" | string[]> {
  const levels = await levelsOf(userId);
  return levels.superAdmin ? "all" : [...levels.admin, ...levels.branch, ...levels.staff];
}
