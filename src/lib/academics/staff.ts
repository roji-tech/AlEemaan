import { classLabel } from "@/lib/academics/class-label";
import { Prisma, Role, type StaffCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { branchIdsFor } from "@/lib/auth/branch-access";
import { accountFitsRecord } from "@/lib/academics/staff-accounts";
import { DomainError } from "@/lib/academics/sessions";
import { ConflictError, audit } from "@/lib/academics/structure";
import {
  detailOrNull,
  personName,
  staffCategory as category,
  staffDetail,
  staffEmail as email,
  staffGender,
  staffPhone as phone,
  staffRole,
  staffTitle,
} from "@/lib/academics/staff-rules";
import { staffMissing } from "@/lib/drafts/rules";

// Staff records and teaching assignments (Slice P1c). A record is how the BRANCH knows a person (a security guard has one and never an account); a sign-in
// account is a member of the same branch it may be linked to - once, by an administrator, and only to a member whose role fits the record's category. The
// caller's authority has ALREADY been checked by `withBranch` in the route (ADR 0015). Nothing is deleted except assignments; the database holds the same-branch
// rules (composite keys) and the uniqueness rules (partial indexes), so a race is answered by the index, not by luck.

export const roleForCategory = (category: StaffCategory): Role => (category === "TEACHING" ? Role.TEACHING_STAFF : Role.NON_TEACHING_STAFF);

export const staffInput = z.strictObject({
  branchId: z.string().min(1),
  category,
  firstName: personName,
  lastName: personName,
  phone: phone.nullable().optional(),
  email: email.nullable().optional(),
  /// Task 0111: a title (Mr, Mrs…), gender, a job title (`designation`), a qualification, and whether they are an NYSC corps member.
  title: staffTitle.nullable().optional(),
  gender: staffGender.nullable().optional(),
  designation: staffDetail.nullable().optional(),
  qualification: staffDetail.nullable().optional(),
  corpsMember: z.boolean().optional(),
  /// A short display role label (e.g. "Head of Science", "Form Tutor"). Optional for any category.
  role: staffRole.nullable().optional(),
  /// Save as a draft (task 0101 D1): the record is kept unfinished and left out of everything that acts on staff until it is completed. Absent or false is a normal record.
  isDraft: z.boolean().optional(),
});
export const staffPatch = z
  .strictObject({
    category: category.optional(),
    firstName: personName.optional(),
    lastName: personName.optional(),
    phone: phone.nullable().optional(),
    email: email.nullable().optional(),
    title: staffTitle.nullable().optional(),
    gender: staffGender.nullable().optional(),
    designation: staffDetail.nullable().optional(),
    qualification: staffDetail.nullable().optional(),
    corpsMember: z.boolean().optional(),
    role: staffRole.nullable().optional(),
    /// `true` marks the record as a draft. A PATCH never clears the flag: `POST /api/v1/staff/[id]/complete` does, after checking the record is complete.
    isDraft: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const linkInput = z.strictObject({ userId: z.string().min(1) });
export const assignmentInput = z.strictObject({ subjectId: z.string().min(1), classArmId: z.string().min(1) });

export const staffBranchId = async (id: string) =>
  (await prisma.staffRecord.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

export const EMAIL_TAKEN = "Another staff record in this branch already uses that email.";
export const UNPLACED_EMAIL_TAKEN = "Another staff record that is not placed in a branch yet already uses that email.";
/// The sentence for what an unplaced record (task 0101 D3) cannot have or do until a superadmin places it in a branch.
export const PLACE_FIRST = "Place this record in a branch first.";
const duplicate = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(message);
  throw error;
};

const INCLUDE = {
  branch: { select: { name: true } },
  membership: { select: { role: true, deactivatedAt: true, user: { select: { name: true, email: true } } } },
  _count: { select: { assignments: true } },
  /// The newest invitation sent from this record that is neither accepted nor revoked (task 0114): "Invited" on the card until it is accepted or runs out.
  invitations: { where: { acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true } },
  /// The arms this person is class teacher of (task 0114: shown on the card and in Manage).
  teacherOfArms: {
    where: { archivedAt: null },
    orderBy: [{ classGroup: { sortOrder: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, classGroup: { select: { name: true } } },
  },
  /// The live departments this person is in, head or member (task 0101 D7): fetched with the list in the same request, so the card needs no call per person.
  departments: {
    where: { department: { archivedAt: null } },
    orderBy: { department: { name: "asc" } },
    select: { isHead: true, department: { select: { id: true, name: true } } },
  },
} satisfies Prisma.StaffRecordInclude;
type Row = Prisma.StaffRecordGetPayload<{ include: typeof INCLUDE }>;

export type StaffView = ReturnType<typeof toStaff>;
/// `alsoIn`: the other branches this person has a live record in (task 0114, the records that share `personId`).
function toStaff(row: Row, alsoIn: { branchId: string; branchName: string }[] = []) {
  const account = row.userId
    ? {
        state: "linked" as const,
        userId: row.userId,
        name: row.membership?.user.name ?? null,
        email: row.membership?.user.email ?? null,
        role: row.membership?.role ?? null,
        deactivated: row.membership?.deactivatedAt != null,
        /// The member's role no longer matches the record's category (changed on the Users page) - shown, not forbidden.
        roleDiffers: row.membership ? !accountFitsRecord(row.membership.role, row.category) : false,
      }
    : { state: "none" as const };
  const invitation = row.invitations[0];
  return {
    id: row.id,
    branchId: row.branchId,
    /// The branch's name (task 0117: the list across branches says where each person is); null for a record not placed in a branch yet (task 0101 D3).
    branchName: row.branch?.name ?? null,
    category: row.category,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    /// Task 0111: the title (Mr, Mrs…), gender, the job title, the qualification and the NYSC corps member flag.
    title: row.title,
    gender: row.gender,
    designation: row.designation,
    qualification: row.qualification,
    corpsMember: row.corpsMember,
    /// A short display role label (e.g. "Head of Science", "Form Tutor").
    role: row.role,
    archived: row.archivedAt !== null,
    /// A draft (task 0101 D1): saved unfinished. `missing` is what a draft still needs to be complete (the server's rule, so no screen has its own); a record that is not a draft has none.
    isDraft: row.isDraft,
    missing: row.isDraft ? staffMissing(row) : [],
    /// Suspended (until a date, or until lifted) or terminated, as stored (task 0045); a lifted or reinstated person is ACTIVE.
    standing: row.standing,
    standingUntil: row.standingUntil ? row.standingUntil.toISOString().slice(0, 10) : null,
    account,
    /// An invitation sent from this record is waiting (task 0114): until when; `expired` once the link has run out without being accepted.
    invited:
      !row.userId && invitation?.expiresAt
        ? { until: invitation.expiresAt.toISOString(), expired: invitation.expiresAt <= new Date() }
        : null,
    /// An invitation for this person is saved as a DRAFT (task 0101 D2): not sent, so not "Invited"; it is sent from the Pending invitations tab.
    inviteDraft: !row.userId && !!invitation && invitation.expiresAt === null,
    assignmentCount: row._count.assignments,
    /// "JSS 1 A": the arms this person is class teacher of.
    classTeacherOf: row.teacherOfArms.map((a) => ({ armId: a.id, label: classLabel(a.classGroup.name, a) })),
    personId: row.personId,
    alsoIn,
    /// The departments the person is in, with whether they are its head (task 0101 D7). Always sent; the screen shows them only while the branch uses departments.
    departments: row.departments.map((d) => ({ id: d.department.id, name: d.department.name, isHead: d.isHead })),
  };
}

/// The other branches each person has a live record in, for a set of rows (one query).
async function alsoInFor(rows: Row[]): Promise<Map<string, { branchId: string; branchName: string }[]>> {
  const people = [...new Set(rows.flatMap((r) => (r.personId ? [r.personId] : [])))];
  const answer = new Map<string, { branchId: string; branchName: string }[]>();
  if (people.length === 0) return answer;
  const others = await prisma.staffRecord.findMany({
    where: { personId: { in: people }, archivedAt: null, branchId: { not: null } },
    select: { id: true, personId: true, branchId: true, branch: { select: { name: true } } },
    orderBy: { branch: { name: "asc" } },
  });
  for (const row of rows) {
    if (!row.personId) continue;
    answer.set(
      row.id,
      others
        .filter((o) => o.personId === row.personId && o.id !== row.id && o.branchId !== row.branchId)
        .flatMap((o) => (o.branchId && o.branch ? [{ branchId: o.branchId, branchName: o.branch.name }] : [])),
    );
  }
  return answer;
}
const viewOf = async (row: Row) => toStaff(row, (await alsoInFor([row])).get(row.id) ?? []);

const find = (id: string) => prisma.staffRecord.findUnique({ where: { id }, include: INCLUDE });
const mustFind = async (id: string) => {
  const row = await find(id);
  if (!row) throw new DomainError("Staff record not found.");
  return row;
};

// ---- the record ----
/// The status and search part of a list's `where`, shared by one branch's list and the list across branches, so the two can never filter differently.
function listFilter(opts: { status?: "live" | "archived" | "all"; q?: string }): Prisma.StaffRecordWhereInput {
  const status = opts.status ?? "live";
  const tokens = (opts.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    ...(status === "live" ? { archivedAt: null } : status === "archived" ? { archivedAt: { not: null } } : {}),
    AND: tokens.map((t) => ({
      OR: [
        { firstName: { contains: t, mode: "insensitive" as const } },
        { lastName: { contains: t, mode: "insensitive" as const } },
        { email: { contains: t, mode: "insensitive" as const } },
        { phone: { contains: t } },
      ],
    })),
  };
}

export async function listStaff(branchId: string, opts: { status?: "live" | "archived" | "all"; q?: string } = {}) {
  const rows = await prisma.staffRecord.findMany({
    where: { branchId, ...listFilter(opts) },
    include: INCLUDE,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 500,
  });
  const also = await alsoInFor(rows);
  return rows.map((row) => toStaff(row, also.get(row.id) ?? []));
}

/// The most records the list across branches answers with (task 0117); more are reported as `truncated`, so the page can say "showing the first 1000".
export const STAFF_ACROSS_CAP = 1000;

/// "All branches" (task 0117): the staff of every branch the caller holds a STAFF role in (a superadmin: every branch), never more, in one query. The branch of each record is named in the
/// view. The caller's authority is the `branchIdsFor` answer, so a record of a branch they cannot read is never in it.
export async function listStaffAcross(userId: string, opts: { status?: "live" | "archived" | "all"; q?: string } = {}) {
  const scope = await branchIdsFor(userId);
  if (scope !== "all" && scope.length === 0) return { staff: [], truncated: false };
  const rows = await prisma.staffRecord.findMany({
    // A record not placed in a branch is nobody's branch list: even "every branch" never includes one (task 0101 D3; a superadmin finds them under "Not placed in a branch").
    where: { branchId: scope === "all" ? { not: null } : { in: scope }, ...listFilter(opts) },
    include: INCLUDE,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { branch: { name: "asc" } }, { id: "asc" }],
    take: STAFF_ACROSS_CAP + 1,
  });
  const truncated = rows.length > STAFF_ACROSS_CAP;
  const kept = truncated ? rows.slice(0, STAFF_ACROSS_CAP) : rows;
  const also = await alsoInFor(kept);
  return { staff: kept.map((row) => toStaff(row, also.get(row.id) ?? [])), truncated };
}

/// The records not placed in a branch yet (task 0101 D3). A superadmin's view: the route checks who asks; no branch authority exists over these.
export async function listUnplaced(opts: { status?: "live" | "archived" | "all"; q?: string } = {}) {
  const rows = await prisma.staffRecord.findMany({
    where: { branchId: null, ...listFilter(opts) },
    include: INCLUDE,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 500,
  });
  return rows.map((row) => toStaff(row));
}

/// The unplaced records an export writes (task 0126): the ids named on the screen ("shown"), or every live one (the archived too when asked), at most `take`, as the import template's columns.
export async function unplacedStaffForExport(opts: { ids: string[] | null; includeArchived: boolean }, take: number) {
  return prisma.staffRecord.findMany({
    where: { branchId: null, ...(opts.ids ? { id: { in: opts.ids } } : opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take,
    select: {
      category: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      title: true,
      gender: true,
      designation: true,
      qualification: true,
      corpsMember: true,
    },
  });
}

/// Is this record not placed in a branch? `null` for no such record.
export async function isUnplaced(id: string): Promise<boolean | null> {
  const row = await prisma.staffRecord.findUnique({ where: { id }, select: { branchId: true } });
  return row ? row.branchId === null : null;
}

export const unplacedInput = staffInput.omit({ branchId: true });

/// A record with no branch (task 0101 D3): the same details as any record, no branch to belong to yet. Creating one never creates a sign-in account.
export async function createUnplacedStaff(actorUserId: string, input: z.infer<typeof unplacedInput>) {
  return createStaff(actorUserId, { ...input, branchId: null });
}

/// Places an unplaced record in a branch (task 0101 D3): from then on that branch's administrators manage it. A live record of that branch with the same e-mail address is a 409; a
/// record that is already placed is a 409 (a placed record moves between branches through Transfer). Audited `STAFF_PLACED`. `null` for no such record or branch.
export async function placeStaff(actorUserId: string, id: string, branchId: string) {
  const before = await find(id);
  if (!before) return null;
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
  if (!branch) return null;
  if (before.branchId !== null) throw new ConflictError("This record is already in a branch. Use Transfer to move it.");
  try {
    const done = await prisma.staffRecord.updateMany({ where: { id, branchId: null }, data: { branchId } });
    if (done.count !== 1) throw new ConflictError("This record is already in a branch. Use Transfer to move it.");
  } catch (error) {
    return duplicate(error, "A live record in that branch already uses this person's email.");
  }
  await audit(actorUserId, "STAFF_PLACED", "StaffRecord", id, { branchId }, { branchId: null });
  return viewOf(await mustFind(id));
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
  return { staff: await viewOf(row), assignments: assignments.map(toAssignment) };
}

export async function createStaff(actorUserId: string, input: Omit<z.infer<typeof staffInput>, "branchId"> & { branchId: string | null }) {
  try {
    const row = await prisma.staffRecord.create({
      data: {
        branchId: input.branchId,
        category: input.category,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        title: detailOrNull(input.title),
        gender: input.gender ?? null,
        designation: detailOrNull(input.designation),
        qualification: detailOrNull(input.qualification),
        corpsMember: input.corpsMember ?? false,
        role: detailOrNull(input.role),
        isDraft: input.isDraft ?? false,
      },
      include: INCLUDE,
    });
    await audit(actorUserId, "STAFF_CREATED", "StaffRecord", row.id, {
      category: row.category,
      branchId: row.branchId,
      ...(row.isDraft ? { isDraft: true } : {}),
    });
    return toStaff(row);
  } catch (error) {
    return duplicate(error, input.branchId === null ? UNPLACED_EMAIL_TAKEN : EMAIL_TAKEN);
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
    title: patch.title === undefined ? before.title : detailOrNull(patch.title),
    gender: patch.gender === undefined ? before.gender : patch.gender,
    designation: patch.designation === undefined ? before.designation : detailOrNull(patch.designation),
    qualification: patch.qualification === undefined ? before.qualification : detailOrNull(patch.qualification),
    corpsMember: patch.corpsMember ?? before.corpsMember,
    role: patch.role === undefined ? before.role : detailOrNull(patch.role),
    isDraft: patch.isDraft ?? before.isDraft,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) return toStaff(before);
  // A draft holds nothing (task 0101 D1): no sign-in, no subjects, no class-teacher role, no attendance grants. A record that has any of those is finished work, not a draft.
  if (changed.includes("isDraft")) {
    const grants = await prisma.attendanceGrant.count({ where: { staffRecordId: id } });
    if (before.userId || before.invitations.length > 0 || before._count.assignments > 0 || before.teacherOfArms.length > 0 || grants > 0)
      throw new ConflictError(
        "This person has a sign-in (or an invitation waiting), subjects, a class or attendance access. Remove those first; a draft is a record that is not in use yet.",
      );
  }
  // A record with an account keeps its category: the account's role was matched to it, and the Users page is where roles change.
  if (changed.includes("category") && before.userId)
    throw new ConflictError("This person has a sign-in account; change their role on the Users page first.");
  try {
    const row = await prisma.staffRecord.update({ where: { id }, data: next, include: INCLUDE });
    await audit(actorUserId, "STAFF_UPDATED", "StaffRecord", id, { changed });
    if (changed.includes("isDraft")) await audit(actorUserId, "STAFF_DRAFT_SET", "StaffRecord", id, { isDraft: true }, { isDraft: false });
    return toStaff(row);
  } catch (error) {
    return duplicate(error, before.branchId === null ? UNPLACED_EMAIL_TAKEN : EMAIL_TAKEN);
  }
}

/// Completes a draft (task 0101 D1): clears the flag when the record has everything `staffMissing` asks for, else says what is missing and changes nothing. A record that is not a draft
/// is returned as it is (so a second click is safe). `null` for an unknown record.
export async function completeStaff(
  actorUserId: string,
  id: string,
): Promise<{ ok: true; staff: StaffView } | { ok: false; missing: string[] } | null> {
  const before = await find(id);
  if (!before) return null;
  if (before.archivedAt) throw new ConflictError("Restore this record before completing it.");
  if (!before.isDraft) return { ok: true, staff: await viewOf(before) };
  const missing = staffMissing(before);
  if (missing.length > 0) return { ok: false, missing };
  // Conditional on still being a draft, so two administrators completing at once write one audit entry.
  const done = await prisma.staffRecord.updateMany({ where: { id, isDraft: true }, data: { isDraft: false } });
  if (done.count === 1) await audit(actorUserId, "STAFF_COMPLETED", "StaffRecord", id, { isDraft: false }, { isDraft: true });
  return { ok: true, staff: await viewOf(await mustFind(id)) };
}

/// Archives (or restores) a record. Archiving is refused while subjects are still assigned to them: remove the assignments first.
export async function setStaffArchived(actorUserId: string, id: string, archived: boolean) {
  const before = await find(id);
  if (!before) return null;
  if (archived === (before.archivedAt !== null)) return toStaff(before);
  // A terminated record is archived by the termination; it comes back by reinstating, which records why (task 0045), not by a plain restore.
  if (!archived && before.standing === "TERMINATED")
    throw new ConflictError("This person was terminated. Reinstate them instead: that records why and gives their access back.");
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
  // A draft is not offered an account: it is finished first (task 0101 D1); a record not placed in a branch has no branch whose members could be linked (task 0101 D3).
  if (record.isDraft || record.branchId === null) return [];
  const members = await prisma.membership.findMany({
    // The kind's own role, or an administrator (task 0112: an administrator who also teaches is on the staff list too).
    where: {
      branchId: record.branchId,
      deactivatedAt: null,
      role: { in: [roleForCategory(record.category), Role.ADMIN] },
      staffRecords: { none: {} },
    },
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
  if (record.isDraft) throw new ConflictError("Complete this draft before linking a sign-in account.");
  if (record.branchId === null) throw new ConflictError(PLACE_FIRST);
  if (record.userId) throw new ConflictError("This record already has a sign-in account.");
  const member = await prisma.membership.findUnique({
    where: { userId_branchId: { userId: input.userId, branchId: record.branchId } },
    select: { role: true, deactivatedAt: true },
  });
  if (!member || member.deactivatedAt || !accountFitsRecord(member.role, record.category))
    throw new ConflictError("That person is not an active member of this branch with the matching role.");
  try {
    // Conditional on userId IS NULL, so two administrators linking at once make one link.
    const done = await prisma.staffRecord.updateMany({ where: { id, userId: null, archivedAt: null }, data: { userId: input.userId } });
    if (done.count !== 1) throw new ConflictError("This record already has a sign-in account.");
  } catch (error) {
    return duplicate(error, "That person is already linked to another staff record.");
  }
  await audit(actorUserId, "STAFF_ACCOUNT_LINKED", "StaffRecord", id, { userId: input.userId });
  return viewOf(await mustFind(id));
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
  return viewOf(await mustFind(id));
}

// ---- assignments ----
/// A subject may be assigned to an arm only when the arm's class studies it (`SubjectOffering`), and everything must be live and in the record's branch.
export async function addAssignment(actorUserId: string, staffId: string, input: z.infer<typeof assignmentInput>) {
  const record = await prisma.staffRecord.findUnique({ where: { id: staffId } });
  if (!record) return null;
  if (record.archivedAt) throw new ConflictError("Restore this record before assigning subjects.");
  if (record.isDraft) throw new ConflictError("Complete this draft before assigning subjects.");
  if (record.branchId === null) throw new ConflictError(PLACE_FIRST);
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
