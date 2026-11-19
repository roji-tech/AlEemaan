import { GuardianRelationship, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AdminScope } from "@/lib/auth/branch-access";
import { cleanEmail, cleanPhone, guardianQuery, mayActForGuardian, mayManageLink, mirrorOf, phoneKey, sameName } from "./rules";

// Guardians as records of their own (task 0113 D1-D5, D9, D10). Every write that changes who a child's guardians are, or what a guardian's details are, ends with `syncGuardianMirror`
// for each child it touched, so the pupil's old guardian columns (read by broadcasts, programs, exports, finance and the lookup tool) always show the first allowed guardian.
// The caller has checked the authority (routes: withAuth, withBranch, and `mayActForGuardian` / `mayManageLink` from ./rules); these functions do what they are told.

type Tx = Prisma.TransactionClient;

export class GuardianError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: string,
  ) {
    super(message);
  }
}

export const GUARDIAN_NOT_FOUND = "Guardian not found";
export const NOT_EVERY_BRANCH =
  "Only a superadmin, or an administrator of every branch where this guardian has a child, can do this: their access code and details cover all their children.";

/// The guardians an administrator may see: a superadmin all; anyone else those with at least one child in a branch they administer.
export const guardianInScope = (scope: AdminScope): Prisma.GuardianWhereInput =>
  scope.superAdmin ? {} : { children: { some: { branchId: { in: [...scope.branchIds] } } } };

/// The links an administrator may see (a branch administrator: their own branches' children only).
const visible = (scope: AdminScope, branchId: string) => scope.superAdmin || scope.branchIds.includes(branchId);

/// The branches a guardian's children are in (every link, blocked or not): what `mayActForGuardian` is asked about.
export async function childBranchIds(db: Tx | typeof prisma, guardianId: string): Promise<string[]> {
  const rows = await db.studentGuardian.findMany({ where: { guardianId }, select: { branchId: true }, distinct: ["branchId"] });
  return rows.map((r) => r.branchId);
}

/// The pupil's old guardian columns, from their links (task 0113 D3). The ONE writer of those columns.
export async function syncGuardianMirror(tx: Tx, studentId: string): Promise<void> {
  const links = await tx.studentGuardian.findMany({
    where: { studentId },
    select: {
      isMain: true,
      createdAt: true,
      blockedAt: true,
      guardian: { select: { name: true, phone: true, email: true, archivedAt: true } },
    },
  });
  await tx.studentRecord.update({ where: { id: studentId }, data: mirrorOf(links) });
}

async function syncMirrorsOfGuardian(tx: Tx, guardianId: string): Promise<void> {
  const links = await tx.studentGuardian.findMany({ where: { guardianId }, select: { studentId: true } });
  for (const link of links) await syncGuardianMirror(tx, link.studentId);
}

const audit = (tx: Tx, actorUserId: string, action: string, targetType: string, targetId: string, afterValue: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { actorUserId, action, targetType, targetId, afterValue } });

export type GuardianFields = { name: string; phone?: string | null; email?: string | null };

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 100);

/// The guardian with this whole phone number (or, with no phone, this e-mail) AND the same name, among those the administrator may see; else a new one (task 0113 D9). Two people who
/// share a phone but have different names stay two guardians. Never looks outside the administrator's reach, so it never confirms that someone is a guardian in another branch.
export async function findOrCreateGuardian(
  tx: Tx,
  scope: AdminScope,
  fields: GuardianFields,
  actorUserId: string,
): Promise<{ id: string; created: boolean }> {
  const name = cleanName(fields.name);
  const phone = cleanPhone(fields.phone);
  const key = phoneKey(phone);
  const email = cleanEmail(fields.email);
  const by: Prisma.GuardianWhereInput | null = key ? { phoneKey: key } : email ? { email } : null;
  if (by) {
    const candidates = await tx.guardian.findMany({
      where: { ...by, archivedAt: null, ...guardianInScope(scope) },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const same = candidates.find((c) => sameName(c.name, name));
    if (same) return { id: same.id, created: false };
  }
  const made = await tx.guardian.create({ data: { name, phone, phoneKey: key, email }, select: { id: true } });
  await audit(tx, actorUserId, "GUARDIAN_CREATED", "Guardian", made.id, { id: made.id });
  return { id: made.id, created: true };
}

/// Links a guardian to a child, or changes an existing link's relationship or main contact. The first guardian of a child is the main contact unless told otherwise; making one the main
/// contact makes the others not. Ends with the mirror.
export async function linkGuardian(
  tx: Tx,
  input: {
    studentId: string;
    branchId: string;
    guardianId: string;
    relationship?: GuardianRelationship | null;
    isMain?: boolean;
    actorUserId: string;
  },
): Promise<{ id: string }> {
  const { studentId, guardianId } = input;
  const existing = await tx.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId } },
    select: { id: true, isMain: true },
  });
  const otherMain = (await tx.studentGuardian.count({ where: { studentId, isMain: true, NOT: { guardianId } } })) > 0;
  const isMain = input.isMain ?? (existing ? existing.isMain : !otherMain);
  if (isMain) await tx.studentGuardian.updateMany({ where: { studentId, isMain: true, NOT: { guardianId } }, data: { isMain: false } });
  const link = existing
    ? await tx.studentGuardian.update({
        where: { id: existing.id },
        data: { isMain, ...(input.relationship !== undefined ? { relationship: input.relationship } : {}) },
        select: { id: true },
      })
    : await tx.studentGuardian.create({
        data: { studentId, guardianId, branchId: input.branchId, relationship: input.relationship ?? null, isMain },
        select: { id: true },
      });
  await audit(tx, input.actorUserId, existing ? "GUARDIAN_LINK_CHANGED" : "GUARDIAN_LINKED", "StudentGuardian", link.id, {
    studentId,
    guardianId,
    isMain,
    ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
  });
  await syncGuardianMirror(tx, studentId);
  return link;
}

/// Removes a guardian from a child. When they were the main contact, the earliest other guardian becomes it. The guardian record stays (they may have other children).
export async function unlinkGuardian(tx: Tx, input: { studentId: string; guardianId: string; actorUserId: string }): Promise<boolean> {
  const link = await tx.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId: input.studentId, guardianId: input.guardianId } },
    select: { id: true, isMain: true },
  });
  if (!link) return false;
  await tx.studentGuardian.delete({ where: { id: link.id } });
  if (link.isMain) {
    const next = await tx.studentGuardian.findFirst({
      where: { studentId: input.studentId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (next) await tx.studentGuardian.update({ where: { id: next.id }, data: { isMain: true } });
  }
  await audit(tx, input.actorUserId, "GUARDIAN_UNLINKED", "StudentGuardian", link.id, {
    studentId: input.studentId,
    guardianId: input.guardianId,
  });
  await syncGuardianMirror(tx, input.studentId);
  return true;
}

/// Blocks or unblocks a guardian from one child (task 0113 D5). Raises the guardian's session version, so an open sign-in ends at its next request. The reason is kept on the link (the
/// audit records that one was given, not the words). Ends with the mirror: a blocked guardian is no longer the child's contact.
export async function setLinkBlocked(
  tx: Tx,
  input: { studentId: string; guardianId: string; blocked: boolean; reason?: string | null; actorUserId: string },
): Promise<boolean> {
  const link = await tx.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId: input.studentId, guardianId: input.guardianId } },
    select: { id: true, blockedAt: true },
  });
  if (!link) return false;
  if (input.blocked === Boolean(link.blockedAt)) return true;
  await tx.studentGuardian.update({
    where: { id: link.id },
    data: input.blocked
      ? { blockedAt: new Date(), blockedById: input.actorUserId, blockedReason: (input.reason ?? "").trim().slice(0, 500) || null }
      : { blockedAt: null, blockedById: null, blockedReason: null },
  });
  await tx.guardian.update({ where: { id: input.guardianId }, data: { portalVersion: { increment: 1 } } });
  await audit(tx, input.actorUserId, input.blocked ? "GUARDIAN_LINK_BLOCKED" : "GUARDIAN_LINK_UNBLOCKED", "StudentGuardian", link.id, {
    studentId: input.studentId,
    guardianId: input.guardianId,
    sessionsEnded: true,
    ...(input.blocked ? { reasonGiven: Boolean(input.reason?.trim()) } : {}),
  });
  await syncGuardianMirror(tx, input.studentId);
  return true;
}

/// Changes a guardian's details (the caller checked `mayActForGuardian`). One edit for all their children: every child's mirror is refreshed. The audit names the fields, not the values.
export async function updateGuardian(
  tx: Tx,
  guardianId: string,
  patch: { name?: string; phone?: string | null; email?: string | null },
  actorUserId: string,
): Promise<boolean> {
  const before = await tx.guardian.findUnique({ where: { id: guardianId }, select: { name: true, phone: true, email: true } });
  if (!before) return false;
  const next = {
    name: patch.name !== undefined ? cleanName(patch.name) || before.name : before.name,
    phone: patch.phone !== undefined ? cleanPhone(patch.phone) : before.phone,
    email: patch.email !== undefined ? cleanEmail(patch.email) : before.email,
  };
  const fields = (["name", "phone", "email"] as const).filter((f) => next[f] !== before[f]);
  if (fields.length === 0) return true;
  await tx.guardian.update({ where: { id: guardianId }, data: { ...next, phoneKey: phoneKey(next.phone) } });
  await audit(tx, actorUserId, "GUARDIAN_UPDATED", "Guardian", guardianId, { fields });
  await syncMirrorsOfGuardian(tx, guardianId);
  return true;
}

/// The old student form's three guardian fields, as the child's MAIN guardian (task 0113 D9; existing callers and the form keep working):
///   all three empty      the main guardian is unlinked from this child;
///   a main guardian the administrator may act for (`mayActForGuardian`)   changed in place, for all their children;
///   otherwise            the guardian with that phone and name in reach (or a new one) becomes the main contact, and the previous main guardian is unlinked from this child.
/// `undefined` fields keep the main guardian's current value.
export async function applyMainGuardianFields(
  tx: Tx,
  scope: AdminScope,
  input: {
    student: { id: string; branchId: string; firstName: string; lastName: string };
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    relationship?: GuardianRelationship | null;
    actorUserId: string;
  },
): Promise<void> {
  const { student, actorUserId } = input;
  const main =
    (await tx.studentGuardian.findFirst({ where: { studentId: student.id, isMain: true }, include: { guardian: true } })) ??
    (await tx.studentGuardian.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "asc" }, include: { guardian: true } }));
  const target = {
    name: (input.name !== undefined ? input.name : main?.guardian.name) ?? "",
    phone: (input.phone !== undefined ? input.phone : main?.guardian.phone) ?? "",
    email: (input.email !== undefined ? input.email : main?.guardian.email) ?? "",
  };
  const empty = !target.name.trim() && !cleanPhone(target.phone) && !cleanEmail(target.email);
  if (empty) {
    if (main) await unlinkGuardian(tx, { studentId: student.id, guardianId: main.guardianId, actorUserId });
    return;
  }
  const name = target.name.trim() || main?.guardian.name || `Guardian of ${student.firstName} ${student.lastName}`;
  if (main && mayActForGuardian(scope, await childBranchIds(tx, main.guardianId))) {
    await updateGuardian(tx, main.guardianId, { name, phone: target.phone, email: target.email }, actorUserId);
    if (!main.isMain || input.relationship !== undefined)
      await linkGuardian(tx, {
        studentId: student.id,
        branchId: student.branchId,
        guardianId: main.guardianId,
        isMain: true,
        relationship: input.relationship,
        actorUserId,
      });
    return;
  }
  const found = await findOrCreateGuardian(tx, scope, { name, phone: target.phone, email: target.email }, actorUserId);
  await linkGuardian(tx, {
    studentId: student.id,
    branchId: student.branchId,
    guardianId: found.id,
    isMain: true,
    relationship: input.relationship,
    actorUserId,
  });
  if (main && main.guardianId !== found.id) await unlinkGuardian(tx, { studentId: student.id, guardianId: main.guardianId, actorUserId });
}

// --- Reading ---

const childSelect = {
  id: true,
  studentId: true,
  branchId: true,
  relationship: true,
  isMain: true,
  blockedAt: true,
  blockedById: true,
  blockedReason: true,
  createdAt: true,
  student: {
    select: {
      firstName: true,
      middleName: true,
      lastName: true,
      admissionNo: true,
      archivedAt: true,
      branch: { select: { name: true } },
      enrollments: { orderBy: { enrolledAt: "desc" as const }, take: 1, select: { className: true, arm: true } },
    },
  },
} satisfies Prisma.StudentGuardianSelect;

type ChildRow = Prisma.StudentGuardianGetPayload<{ select: typeof childSelect }>;

const classOf = (row: ChildRow) => {
  const e = row.student.enrollments[0];
  return e ? `${e.className}${e.arm ? ` ${e.arm}` : ""}` : null;
};

export type GuardianCard = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  codeAt: string | null;
  children: number;
  otherBranches: number;
  blocked: number;
};

/// Users > Guardians (task 0113 D10): the guardians in reach, searched by name, phone (the national digits, so any way of writing it) or e-mail, a page at a time. A branch administrator's
/// counts are of their own branches' children, with how many more there are elsewhere (no names).
export async function listGuardians(
  scope: AdminScope,
  args: { q?: string; status?: "blocked" | "nocode"; skip: number; take: number },
): Promise<{ items: GuardianCard[]; total: number }> {
  const { text, digits } = guardianQuery(args.q ?? "");
  const mine: Prisma.StudentGuardianWhereInput = scope.superAdmin ? {} : { branchId: { in: [...scope.branchIds] } };
  const where: Prisma.GuardianWhereInput = {
    archivedAt: null,
    ...guardianInScope(scope),
    // "Blocked from a child" counts the viewer's own branches' children only; "No code yet" is the guardian's.
    ...(args.status === "blocked" ? { AND: [{ children: { some: { ...mine, blockedAt: { not: null } } } }] } : {}),
    ...(args.status === "nocode" ? { codeHash: null } : {}),
    ...(text
      ? {
          OR: [
            { name: { contains: text, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: text.toLowerCase() } },
            ...(digits ? [{ phoneKey: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.guardian.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: args.skip,
      take: args.take,
      select: { id: true, name: true, phone: true, email: true, codeAt: true, children: { select: { branchId: true, blockedAt: true } } },
    }),
    prisma.guardian.count({ where }),
  ]);
  return {
    items: rows.map((g) => {
      const mine = g.children.filter((c) => visible(scope, c.branchId));
      return {
        id: g.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        codeAt: g.codeAt?.toISOString() ?? null,
        children: mine.length,
        otherBranches: g.children.length - mine.length,
        blocked: mine.filter((c) => c.blockedAt).length,
      };
    }),
    total,
  };
}

export type GuardianChild = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string | null;
  branchId: string;
  branchName: string;
  archived: boolean;
  relationship: GuardianRelationship | null;
  isMain: boolean;
  blocked: { at: string; by: string | null; reason: string | null } | null;
  canManage: boolean;
};

async function namesOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name?.trim() || u.email || "A former user"]));
}

const childOf = (scope: AdminScope, row: ChildRow, names: Map<string, string>): GuardianChild => ({
  studentId: row.studentId,
  name: [row.student.firstName, row.student.middleName, row.student.lastName].filter(Boolean).join(" "),
  admissionNo: row.student.admissionNo,
  className: classOf(row),
  branchId: row.branchId,
  branchName: row.student.branch.name,
  archived: row.student.archivedAt !== null,
  relationship: row.relationship,
  isMain: row.isMain,
  blocked: row.blockedAt
    ? { at: row.blockedAt.toISOString(), by: row.blockedById ? (names.get(row.blockedById) ?? null) : null, reason: row.blockedReason }
    : null,
  canManage: mayManageLink(scope, row.branchId),
});

/// One guardian as Users > Guardians opens it: details, the children in reach (with who blocked whom and why), how many more elsewhere, and what this administrator may do. Null when
/// unknown or out of reach (the route's 404).
export async function guardianDetail(scope: AdminScope, guardianId: string) {
  const g = await prisma.guardian.findFirst({
    where: { id: guardianId, ...guardianInScope(scope) },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      codeAt: true,
      archivedAt: true,
      children: { select: childSelect, orderBy: { createdAt: "asc" } },
    },
  });
  if (!g) return null;
  const mine = g.children.filter((c) => visible(scope, c.branchId));
  const names = await namesOf(mine.map((c) => c.blockedById));
  const allBranches = [...new Set(g.children.map((c) => c.branchId))];
  const acts = mayActForGuardian(scope, allBranches);
  return {
    guardian: {
      id: g.id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      codeAt: g.codeAt?.toISOString() ?? null,
      archived: g.archivedAt !== null,
    },
    children: mine.map((c) => childOf(scope, c, names)),
    otherBranches: g.children.length - mine.length,
    can: { edit: acts, code: acts },
  };
}

/// The guardians in reach with exactly this phone number (any way of writing it) or e-mail: how the student form finds an existing guardian instead of typing them again. Each with the
/// names of their children in reach, so the administrator can tell who it is.
export async function matchGuardians(scope: AdminScope, contact: string) {
  const c = contact.trim();
  const email = c.includes("@") ? cleanEmail(c) : null;
  const key = email ? null : phoneKey(c);
  if (!email && !key) return [];
  const rows = await prisma.guardian.findMany({
    where: { archivedAt: null, ...guardianInScope(scope), ...(email ? { email } : { phoneKey: key }) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 10,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      children: { select: { branchId: true, student: { select: { firstName: true, lastName: true } } } },
    },
  });
  return rows.map((g) => {
    const mine = g.children.filter((x) => visible(scope, x.branchId));
    return {
      id: g.id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      children: mine.map((x) => `${x.student.firstName} ${x.student.lastName}`),
      otherBranches: g.children.length - mine.length,
    };
  });
}

/// A pupil's guardians, for the pupil's Guardians dialog: every link (blocked ones too), the main contact first, with what this administrator may do about each guardian's details and code.
export async function studentGuardians(scope: AdminScope, studentId: string) {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    select: {
      guardianId: true,
      relationship: true,
      isMain: true,
      blockedAt: true,
      blockedById: true,
      blockedReason: true,
      guardian: { select: { name: true, phone: true, email: true, codeAt: true, children: { select: { branchId: true } } } },
    },
  });
  const names = await namesOf(links.map((l) => l.blockedById));
  return links.map((l) => {
    const branches = [...new Set(l.guardian.children.map((c) => c.branchId))];
    return {
      guardianId: l.guardianId,
      name: l.guardian.name,
      phone: l.guardian.phone,
      email: l.guardian.email,
      codeAt: l.guardian.codeAt?.toISOString() ?? null,
      relationship: l.relationship,
      isMain: l.isMain,
      blocked: l.blockedAt
        ? { at: l.blockedAt.toISOString(), by: l.blockedById ? (names.get(l.blockedById) ?? null) : null, reason: l.blockedReason }
        : null,
      otherChildren: l.guardian.children.length - 1,
      canAct: mayActForGuardian(scope, branches),
    };
  });
}

/// The guardian's branches and whether this administrator may see them, for a route that must answer 404 (not in reach) or 403 (in reach, but not every branch).
export async function guardianAuthority(scope: AdminScope, guardianId: string): Promise<"none" | "see" | "act"> {
  const exists = await prisma.guardian.findUnique({ where: { id: guardianId }, select: { id: true } });
  if (!exists) return "none";
  const branches = await childBranchIds(prisma, guardianId);
  if (!(scope.superAdmin || branches.some((b) => scope.branchIds.includes(b)))) return "none";
  return mayActForGuardian(scope, branches) ? "act" : "see";
}
