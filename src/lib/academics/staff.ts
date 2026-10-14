import { Prisma, Role, type StaffCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/academics/sessions";
import { ConflictError, audit } from "@/lib/academics/structure";

// Staff records and teaching assignments (Slice P1c). A record is how the BRANCH knows a person (a security guard has one and never an account); a sign-in
// account is a member of the same branch it may be linked to - once, by an administrator, and only to a member whose role fits the record's category. The
// caller's authority has ALREADY been checked by `withBranch` in the route (ADR 0015). Nothing is deleted except assignments; the database holds the same-branch
// rules (composite keys) and the uniqueness rules (partial indexes), so a race is answered by the index, not by luck.

export const roleForCategory = (category: StaffCategory): Role => (category === "TEACHING" ? Role.TEACHING_STAFF : Role.NON_TEACHING_STAFF);

const personName = z.string().trim().min(1, "Give a name.").max(80, "Use at most 80 characters.");
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+() -]{7,20}$/, "Use 7 to 20 digits (spaces, +, - and brackets are fine).");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That does not look like an email address.");
const category = z.enum(["TEACHING", "NON_TEACHING"]);

export const staffInput = z.strictObject({
  branchId: z.string().min(1),
  category,
  firstName: personName,
  lastName: personName,
  phone: phone.nullable().optional(),
  email: email.nullable().optional(),
});
export const staffPatch = z
  .strictObject({
    category: category.optional(),
    firstName: personName.optional(),
    lastName: personName.optional(),
    phone: phone.nullable().optional(),
    email: email.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const linkInput = z.strictObject({ userId: z.string().min(1) });
export const assignmentInput = z.strictObject({ subjectId: z.string().min(1), classArmId: z.string().min(1) });

export const staffBranchId = async (id: string) =>
  (await prisma.staffRecord.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

const EMAIL_TAKEN = "Another staff record in this branch already uses that email.";
const duplicate = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(message);
  throw error;
};

const INCLUDE = {
  membership: { select: { role: true, deactivatedAt: true, user: { select: { name: true, email: true } } } },
  _count: { select: { assignments: true } },
} satisfies Prisma.StaffRecordInclude;
type Row = Prisma.StaffRecordGetPayload<{ include: typeof INCLUDE }>;

export type StaffView = ReturnType<typeof toStaff>;
function toStaff(row: Row) {
  const account = row.userId
    ? {
        state: "linked" as const,
        userId: row.userId,
        name: row.membership?.user.name ?? null,
        email: row.membership?.user.email ?? null,
        role: row.membership?.role ?? null,
        deactivated: row.membership?.deactivatedAt != null,
        /// The member's role no longer matches the record's category (changed on the Users page) - shown, not forbidden.
        roleDiffers: row.membership ? row.membership.role !== roleForCategory(row.category) : false,
      }
    : { state: "none" as const };
  return {
    id: row.id,
    branchId: row.branchId,
    category: row.category,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    archived: row.archivedAt !== null,
    account,
    assignmentCount: row._count.assignments,
  };
}

const find = (id: string) => prisma.staffRecord.findUnique({ where: { id }, include: INCLUDE });
const mustFind = async (id: string) => {
  const row = await find(id);
  if (!row) throw new DomainError("Staff record not found.");
  return row;
};

// ---- the record ----
export async function listStaff(branchId: string, opts: { status?: "live" | "archived" | "all"; q?: string } = {}) {
  const status = opts.status ?? "live";
  const tokens = (opts.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await prisma.staffRecord.findMany({
    where: {
      branchId,
      ...(status === "live" ? { archivedAt: null } : status === "archived" ? { archivedAt: { not: null } } : {}),
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: "insensitive" as const } },
          { lastName: { contains: t, mode: "insensitive" as const } },
          { email: { contains: t, mode: "insensitive" as const } },
          { phone: { contains: t } },
        ],
      })),
    },
    include: INCLUDE,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 500,
  });
  return rows.map(toStaff);
}

const ASSIGNMENT_INCLUDE = {
  subject: { select: { name: true } },
  classArm: { select: { name: true, classGroup: { select: { name: true } } } },
} satisfies Prisma.StaffSubjectAssignmentInclude;
type AssignmentRow = Prisma.StaffSubjectAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;
const toAssignment = (row: AssignmentRow) => ({
  id: row.id,
  subjectId: row.subjectId,
  subjectName: row.subject.name,
  classArmId: row.classArmId,
  armName: row.classArm.name,
  classGroupName: row.classArm.classGroup.name,
});

export async function getStaff(id: string) {
  const row = await find(id);
  if (!row) return null;
  const assignments = await prisma.staffSubjectAssignment.findMany({
    where: { staffRecordId: id },
    include: ASSIGNMENT_INCLUDE,
    orderBy: [
      { classArm: { classGroup: { sortOrder: "asc" } } },
      { classArm: { classGroup: { name: "asc" } } },
      { classArm: { name: "asc" } },
      { subject: { name: "asc" } },
      { id: "asc" },
    ],
  });
  return { staff: toStaff(row), assignments: assignments.map(toAssignment) };
}

export async function createStaff(actorUserId: string, input: z.infer<typeof staffInput>) {
  try {
    const row = await prisma.staffRecord.create({
      data: {
        branchId: input.branchId,
        category: input.category,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
      },
      include: INCLUDE,
    });
    await audit(actorUserId, "STAFF_CREATED", "StaffRecord", row.id, { category: row.category, branchId: row.branchId });
    return toStaff(row);
  } catch (error) {
    return duplicate(error, EMAIL_TAKEN);
  }
}

export async function updateStaff(actorUserId: string, id: string, patch: z.infer<typeof staffPatch>) {
  const before = await find(id);
  if (!before) return null;
  if (before.archivedAt) throw new ConflictError("Restore this record before changing it.");
  const next = {
    category: patch.category ?? before.category,
    firstName: patch.firstName ?? before.firstName,
    lastName: patch.lastName ?? before.lastName,
    phone: patch.phone === undefined ? before.phone : patch.phone,
    email: patch.email === undefined ? before.email : patch.email,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) return toStaff(before);
  // A record with an account keeps its category: the account's role was matched to it, and the Users page is where roles change.
  if (changed.includes("category") && before.userId)
    throw new ConflictError("This person has a sign-in account; change their role on the Users page first.");
  try {
    const row = await prisma.staffRecord.update({ where: { id }, data: next, include: INCLUDE });
    await audit(actorUserId, "STAFF_UPDATED", "StaffRecord", id, { changed });
    return toStaff(row);
  } catch (error) {
    return duplicate(error, EMAIL_TAKEN);
  }
}

/// Archives (or restores) a record. Archiving is refused while subjects are still assigned to them: remove the assignments first.
export async function setStaffArchived(actorUserId: string, id: string, archived: boolean) {
  const before = await find(id);
  if (!before) return null;
  if (archived === (before.archivedAt !== null)) return toStaff(before);
  if (archived && before._count.assignments > 0) throw new ConflictError("Remove this person's subject assignments before archiving them.");
  try {
    const row = await prisma.staffRecord.update({ where: { id }, data: { archivedAt: archived ? new Date() : null }, include: INCLUDE });
    await audit(actorUserId, archived ? "STAFF_ARCHIVED" : "STAFF_RESTORED", "StaffRecord", id, { archived });
    return toStaff(row);
  } catch (error) {
    return duplicate(error, "Another live record already uses this email; change one of them first.");
  }
}

// ---- the sign-in account ----
/// Members of the branch an administrator may link: ACTIVE, holding the role that fits the category, and not already linked to a record.
export async function linkableAccounts(id: string) {
  const record = await mustFind(id);
  const members = await prisma.membership.findMany({
    where: { branchId: record.branchId, deactivatedAt: null, role: roleForCategory(record.category), staffRecords: { none: {} } },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
    take: 200,
  });
  return members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email }));
}

export async function linkAccount(actorUserId: string, id: string, input: z.infer<typeof linkInput>) {
  const record = await find(id);
  if (!record) return null;
  if (record.archivedAt) throw new ConflictError("Restore this record before linking an account.");
  if (record.userId) throw new ConflictError("This record already has a sign-in account.");
  const member = await prisma.membership.findUnique({
    where: { userId_branchId: { userId: input.userId, branchId: record.branchId } },
    select: { role: true, deactivatedAt: true },
  });
  if (!member || member.deactivatedAt || member.role !== roleForCategory(record.category))
    throw new ConflictError("That person is not an active member of this branch with the matching role.");
  try {
    // Conditional on userId IS NULL, so two administrators linking at once make one link.
    const done = await prisma.staffRecord.updateMany({ where: { id, userId: null, archivedAt: null }, data: { userId: input.userId } });
    if (done.count !== 1) throw new ConflictError("This record already has a sign-in account.");
  } catch (error) {
    return duplicate(error, "That person is already linked to another staff record.");
  }
  await audit(actorUserId, "STAFF_ACCOUNT_LINKED", "StaffRecord", id, { userId: input.userId });
  return toStaff(await mustFind(id));
}

/// Clears the link; the account and its membership are untouched.
export async function unlinkAccount(actorUserId: string, id: string) {
  const record = await find(id);
  if (!record) return null;
  if (!record.userId) throw new ConflictError("This record has no sign-in account.");
  const was = record.userId;
  const done = await prisma.staffRecord.updateMany({ where: { id, userId: was }, data: { userId: null } });
  if (done.count !== 1) throw new ConflictError("This record has no sign-in account.");
  await audit(actorUserId, "STAFF_ACCOUNT_UNLINKED", "StaffRecord", id, { userId: null }, { userId: was });
  return toStaff(await mustFind(id));
}

// ---- assignments ----
/// A subject may be assigned to an arm only when the arm's class studies it (`SubjectOffering`), and everything must be live and in the record's branch.
export async function addAssignment(actorUserId: string, staffId: string, input: z.infer<typeof assignmentInput>) {
  const record = await prisma.staffRecord.findUnique({ where: { id: staffId } });
  if (!record) return null;
  if (record.archivedAt) throw new ConflictError("Restore this record before assigning subjects.");
  const subject = await prisma.subject.findFirst({
    where: { id: input.subjectId, branchId: record.branchId, archivedAt: null },
    select: { id: true },
  });
  if (!subject) throw new ConflictError("That subject does not exist in this branch (or is archived).");
  const arm = await prisma.classArm.findFirst({
    where: { id: input.classArmId, branchId: record.branchId, archivedAt: null, classGroup: { archivedAt: null } },
    select: { id: true, classGroupId: true },
  });
  if (!arm) throw new ConflictError("That class arm does not exist in this branch (or is archived).");
  const offered = await prisma.subjectOffering.findFirst({
    where: { classGroupId: arm.classGroupId, subjectId: subject.id },
    select: { id: true },
  });
  if (!offered) throw new ConflictError("That class does not study this subject yet; add it to the class first.");
  try {
    const created = await prisma.staffSubjectAssignment.create({
      data: { branchId: record.branchId, staffRecordId: staffId, subjectId: subject.id, classArmId: arm.id },
      include: ASSIGNMENT_INCLUDE,
    });
    await audit(actorUserId, "STAFF_ASSIGNED", "StaffSubjectAssignment", created.id, {
      staffRecordId: staffId,
      subjectId: subject.id,
      classArmId: arm.id,
    });
    return toAssignment(created);
  } catch (error) {
    return duplicate(error, "This person already teaches that subject to that arm.");
  }
}

/// Removes an assignment (a real delete: nothing references one yet). `null` when the assignment is not this record's.
export async function removeAssignment(actorUserId: string, staffId: string, assignmentId: string) {
  const current = await prisma.staffSubjectAssignment.findFirst({ where: { id: assignmentId, staffRecordId: staffId } });
  if (!current) return null;
  const done = await prisma.staffSubjectAssignment.deleteMany({ where: { id: assignmentId, staffRecordId: staffId } });
  if (done.count !== 1) return null;
  await audit(
    actorUserId,
    "STAFF_UNASSIGNED",
    "StaffSubjectAssignment",
    assignmentId,
    { removed: true },
    { staffRecordId: staffId, subjectId: current.subjectId, classArmId: current.classArmId },
  );
  return true;
}
