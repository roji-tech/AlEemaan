import { Prisma, Role, StaffCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LIVE_STAFF } from "@/lib/drafts/live";

// Accounts and staff records (task 0112, the maintainer 2026-11-19: "if I invite a new user ... as admin for a branch, why am I not seeing the person as part of the staff of that branch?").
// A sign-in account (a membership: a role in a branch) and a staff record (how the branch knows a person) were never joined unless someone linked them by hand, and an administrator's
// account could not be linked at all. Now:
//   - accepting an invitation puts the person on the branch's staff list: an unlinked live record of the branch with the same e-mail is linked, otherwise a record is made from the
//     account's name and e-mail, linked (Teaching staff -> Teaching; Non-teaching staff and Administrator -> Non-teaching, an administrator with the job title "Administrator");
//   - an administrator's account may be linked to a record of either kind (an administrator who also teaches);
//   - the members who sign in to a branch and are on no record of it are listed for an administrator, each with "Add to staff".

export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

/// May an account with this role in the branch be the account of a record of this kind? The kind's own role, or an administrator.
export const accountFitsRecord = (role: Role, category: StaffCategory): boolean =>
  role === Role.ADMIN || role === (category === StaffCategory.TEACHING ? Role.TEACHING_STAFF : Role.NON_TEACHING_STAFF);

export const categoryForRole = (role: Role): StaffCategory =>
  role === Role.TEACHING_STAFF ? StaffCategory.TEACHING : StaffCategory.NON_TEACHING;

/// First and last name from an account's name ("Amina Yusuf Bello" -> Amina / Yusuf Bello), or from the e-mail's local part when there is no usable name.
export function namesFrom(name: string | null, email: string): { firstName: string; lastName: string } {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return { firstName: words[0].slice(0, 80), lastName: words.slice(1).join(" ").slice(0, 80) };
  const local = email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const parts = local.split(/\s+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  if (words.length === 1) return { firstName: words[0].slice(0, 80), lastName: cap(parts[1] ?? parts[0] ?? "-").slice(0, 80) };
  return { firstName: cap(parts[0] ?? "Staff").slice(0, 80), lastName: cap(parts[1] ?? "-").slice(0, 80) };
}

type Tx = Prisma.TransactionClient;

/// Puts a member on the branch's staff list, in the caller's transaction: nothing when the role is not a staff role or the account already has a record here; else links an unlinked LIVE
/// record (not archived, not a draft: task 0101 D1) with the same e-mail and a fitting kind, else makes one. Returns what it did. A DRAFT that holds the address is left alone ("draft": it is
/// unfinished, so it is neither linked nor duplicated; the person shows under "not on the staff list yet" until the draft is completed); another live record holding it is "none".
export async function ensureStaffRecord(
  tx: Tx,
  input: { userId: string; branchId: string; role: Role; actorUserId: string; why: string },
): Promise<"none" | "linked" | "created" | "draft"> {
  if (!STAFF_ROLES.includes(input.role)) return "none";
  if ((await tx.staffRecord.count({ where: { branchId: input.branchId, userId: input.userId } })) > 0) return "none";
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } });
  if (!user?.email) return "none";
  const holder = await tx.staffRecord.findFirst({
    where: { branchId: input.branchId, userId: null, archivedAt: null, email: { equals: user.email, mode: Prisma.QueryMode.insensitive } },
    select: { id: true, category: true, isDraft: true },
  });
  if (holder?.isDraft) return "draft";
  const existing = holder;
  if (existing && accountFitsRecord(input.role, existing.category)) {
    await tx.staffRecord.updateMany({ where: { id: existing.id, userId: null, ...LIVE_STAFF }, data: { userId: input.userId } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "STAFF_ACCOUNT_LINKED",
        targetType: "StaffRecord",
        targetId: existing.id,
        afterValue: { userId: input.userId, why: input.why },
      },
    });
    return "linked";
  }
  if (existing) return "none";
  try {
    const made = await tx.staffRecord.create({
      data: {
        branchId: input.branchId,
        category: categoryForRole(input.role),
        ...namesFrom(user.name, user.email),
        email: user.email.toLowerCase(),
        designation: input.role === Role.ADMIN ? "Administrator" : null,
        userId: input.userId,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "STAFF_CREATED",
        targetType: "StaffRecord",
        targetId: made.id,
        afterValue: { branchId: input.branchId, userId: input.userId, why: input.why },
      },
    });
    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "none";
    throw error;
  }
}

/// The members who sign in to this branch with a staff role and are on no record of it (for "Add to staff").
export async function unlistedMembers(branchId: string) {
  const rows = await prisma.membership.findMany({
    where: { branchId, deactivatedAt: null, role: { in: [...STAFF_ROLES] }, staffRecords: { none: {} } },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
    take: 200,
  });
  return rows.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }));
}
