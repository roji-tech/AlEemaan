import { ProgramStaffRole, ProgramStaffStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, isSuperAdmin } from "@/lib/auth/branch-access";

// Who may see and change a program (task 0043, section 8.3). Read at every request from the live data: an ended program admin, a deactivated membership or an unlinked
// branch loses the authority at once, with nothing to clean up. A program the person has no place in is "not found", exactly like one that does not exist.

/// SUPER: a super admin. ADMIN: a program admin (named by a super admin, holding an active staff membership in a branch the program runs in). BRANCH: an administrator
/// of a branch the program runs in - they read the program and (from slice P2) manage their own branch's people, never its structure.
export type ProgramViewer = { level: "SUPER" } | { level: "ADMIN" } | { level: "BRANCH"; branchIds: string[] };

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

export async function viewerOf(userId: string, programId: string): Promise<ProgramViewer | null> {
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { branches: { select: { branchId: true } } } });
  if (!program) return null;
  if (await isSuperAdmin(userId)) return { level: "SUPER" };
  const linked = new Set(program.branches.map((link) => link.branchId));
  const places = await liveAdminPlaces(userId);
  if (places.some((place) => place.programId === programId && linked.has(place.branchId))) return { level: "ADMIN" };
  const scope = await adminScope(userId);
  const mine = [...linked].filter((branchId) => scope.branchIds.includes(branchId));
  return mine.length > 0 ? { level: "BRANCH", branchIds: mine } : null;
}

/// For each program the person can see, how: as a super admin (everything), as a program admin, or as an administrator of a branch it runs in. A program admin who is also
/// a branch administrator counts as a program admin (the wider of the two).
export async function levelsOf(userId: string): Promise<{ superAdmin: boolean; admin: Set<string>; branch: Set<string> }> {
  if (await isSuperAdmin(userId)) return { superAdmin: true, admin: new Set(), branch: new Set() };
  const [places, scope] = await Promise.all([liveAdminPlaces(userId), adminScope(userId)]);
  const [asProgramAdmin, asBranchAdmin] = await Promise.all([
    places.length === 0
      ? []
      : prisma.programBranch.findMany({
          where: { OR: places.map((place) => ({ programId: place.programId, branchId: place.branchId })) },
          select: { programId: true },
        }),
    scope.branchIds.length === 0
      ? []
      : prisma.programBranch.findMany({ where: { branchId: { in: [...scope.branchIds] } }, select: { programId: true } }),
  ]);
  const admin = new Set(asProgramAdmin.map((row) => row.programId));
  const branch = new Set(asBranchAdmin.map((row) => row.programId).filter((id) => !admin.has(id)));
  return { superAdmin: false, admin, branch };
}

/// Every program the person may see: "all" for a super admin, otherwise the ids of the programs they run or that run in a branch they administer.
export async function visibleProgramIds(userId: string): Promise<"all" | string[]> {
  const levels = await levelsOf(userId);
  return levels.superAdmin ? "all" : [...levels.admin, ...levels.branch];
}
