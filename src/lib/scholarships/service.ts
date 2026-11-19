import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { schoolDay } from "@/lib/students/list-filters";
import { resolveSchoolTimeZone } from "@/lib/question-bank/school-day";
import { isPercent, liveOn, MAX_PERCENT, peakPercent } from "./rules";

// Scholarships (task 0113 S1): the types a branch gives, and the scholarships its pupils hold. Every write is audited (ids, shares and days; never the note's words). The caller has checked the
// authority (routes: withAuth ADMIN and withBranch "administer" on the pupil's or the type's branch). Money is the finance service's: granting never touches an invoice by itself.

type Db = Prisma.TransactionClient | typeof prisma;

export class ScholarshipError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
  ) {
    super(message);
  }
}

/// The school's day today (YYYY-MM-DD) in the school's time zone.
export const today = (now: Date = new Date()): string => schoolDay(now, resolveSchoolTimeZone());
const dayDate = (day: string | null | undefined): Date | null => (day ? new Date(`${day}T00:00:00Z`) : null);
const dayText = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

const audit = (
  tx: Db,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  afterValue: Prisma.InputJsonValue,
  beforeValue?: Prisma.InputJsonValue,
) =>
  tx.auditLog.create({
    data: { actorUserId, action, targetType, targetId, afterValue, ...(beforeValue !== undefined ? { beforeValue } : {}) },
  });

// --- Types ---

export type TypeRow = { id: string; name: string; percent: number; description: string | null; archived: boolean; holders: number };

/// A branch's scholarship types, live first then archived, each with how many pupils hold it now.
export async function listTypes(branchId: string, includeArchived = true): Promise<TypeRow[]> {
  const day = dayDate(today())!;
  const rows = await prisma.scholarshipType.findMany({
    where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      percent: true,
      description: true,
      archivedAt: true,
      grants: {
        where: {
          endedAt: null,
          OR: [{ startsOn: null }, { startsOn: { lte: day } }],
          AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: day } }] }],
        },
        select: { id: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    percent: r.percent,
    description: r.description,
    archived: r.archivedAt !== null,
    holders: r.grants.length,
  }));
}

async function nameTaken(tx: Db, branchId: string, name: string, exceptId?: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ScholarshipType" WHERE "branchId" = ${branchId} AND "archivedAt" IS NULL AND lower("name") = lower(${name}) ${exceptId ? Prisma.sql`AND "id" <> ${exceptId}` : Prisma.empty} LIMIT 1`;
  return rows.length > 0;
}
const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
const TAKEN = "A scholarship type with this name already exists in this branch.";
const uniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createType(
  actorUserId: string,
  input: { branchId: string; name: string; percent: number; description?: string | null },
): Promise<TypeRow> {
  const name = cleanName(input.name);
  if (!isPercent(input.percent)) throw new ScholarshipError("The share must be a whole number from 1 to 100.", 400, "VALIDATION");
  try {
    return await prisma.$transaction(async (tx) => {
      if (await nameTaken(tx, input.branchId, name)) throw new ScholarshipError(TAKEN, 409, "NAME_TAKEN");
      const made = await tx.scholarshipType.create({
        data: { branchId: input.branchId, name, percent: input.percent, description: input.description?.trim() || null },
      });
      await audit(tx, actorUserId, "SCHOLARSHIP_TYPE_CREATED", "ScholarshipType", made.id, {
        branchId: input.branchId,
        percent: made.percent,
      });
      return { id: made.id, name: made.name, percent: made.percent, description: made.description, archived: false, holders: 0 };
    });
  } catch (error) {
    if (uniqueClash(error)) throw new ScholarshipError(TAKEN, 409, "NAME_TAKEN");
    throw error;
  }
}

/// Changes a type, or archives or restores it. A type's share is the DEFAULT for new scholarships: those already granted keep theirs.
export async function updateType(
  actorUserId: string,
  id: string,
  patch: { name?: string; percent?: number; description?: string | null; archived?: boolean },
): Promise<TypeRow | null> {
  if (patch.percent !== undefined && !isPercent(patch.percent))
    throw new ScholarshipError("The share must be a whole number from 1 to 100.", 400, "VALIDATION");
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.scholarshipType.findUnique({ where: { id } });
      if (!before) return null;
      const name = patch.name !== undefined ? cleanName(patch.name) : before.name;
      const restoring = patch.archived === false && before.archivedAt !== null;
      if ((name !== before.name || restoring) && (await nameTaken(tx, before.branchId, name, id)))
        throw new ScholarshipError(TAKEN, 409, "NAME_TAKEN");
      const after = await tx.scholarshipType.update({
        where: { id },
        data: {
          name,
          ...(patch.percent !== undefined ? { percent: patch.percent } : {}),
          ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
          ...(patch.archived !== undefined ? { archivedAt: patch.archived ? (before.archivedAt ?? new Date()) : null } : {}),
        },
      });
      const action =
        patch.archived === true && !before.archivedAt
          ? "SCHOLARSHIP_TYPE_ARCHIVED"
          : restoring
            ? "SCHOLARSHIP_TYPE_RESTORED"
            : "SCHOLARSHIP_TYPE_UPDATED";
      await audit(
        tx,
        actorUserId,
        action,
        "ScholarshipType",
        id,
        { percent: after.percent },
        { percent: before.percent, renamed: name !== before.name },
      );
      return {
        id,
        name: after.name,
        percent: after.percent,
        description: after.description,
        archived: after.archivedAt !== null,
        holders: 0,
      };
    });
  } catch (error) {
    if (uniqueClash(error)) throw new ScholarshipError(TAKEN, 409, "NAME_TAKEN");
    throw error;
  }
}

/// The branch a type belongs to (what `withBranch({ of })` looks up), or null for an unknown id.
export async function typeBranchId(id: string): Promise<string | null> {
  return (await prisma.scholarshipType.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;
}

// --- A pupil's scholarships ---

const grantSelect = {
  id: true,
  typeId: true,
  percent: true,
  startsOn: true,
  endsOn: true,
  note: true,
  endedAt: true,
  createdAt: true,
  type: { select: { name: true, archivedAt: true } },
} satisfies Prisma.StudentScholarshipSelect;
type GrantRow = Prisma.StudentScholarshipGetPayload<{ select: typeof grantSelect }>;

export type GrantView = {
  id: string;
  typeId: string;
  typeName: string;
  percent: number;
  startsOn: string | null;
  endsOn: string | null;
  note: string | null;
  endedAt: string | null;
  /// Live today (not ended, within its days).
  live: boolean;
};
const viewOf = (r: GrantRow, day: string): GrantView => {
  const startsOn = dayText(r.startsOn);
  const endsOn = dayText(r.endsOn);
  return {
    id: r.id,
    typeId: r.typeId,
    typeName: r.type.name,
    percent: r.percent,
    startsOn,
    endsOn,
    note: r.note,
    endedAt: r.endedAt?.toISOString() ?? null,
    live: liveOn({ startsOn, endsOn, endedAt: r.endedAt }, day),
  };
};

/// A pupil's scholarships, live first, then ended and past ones, newest first.
export async function listForStudent(studentId: string): Promise<GrantView[]> {
  const day = today();
  const rows = await prisma.studentScholarship.findMany({ where: { studentId }, orderBy: [{ createdAt: "desc" }], select: grantSelect });
  const views = rows.map((r) => viewOf(r, day));
  return [...views.filter((v) => v.live), ...views.filter((v) => !v.live)];
}

/// Who holds a live scholarship today, for these pupils: `{ studentId -> [{ typeName, percent }] }`. For the pupil list, administrators only (the route decides who asks).
export async function liveSummaries(studentIds: readonly string[]): Promise<Map<string, { typeName: string; percent: number }[]>> {
  const out = new Map<string, { typeName: string; percent: number }[]>();
  if (studentIds.length === 0) return out;
  const day = dayDate(today())!;
  const rows = await prisma.studentScholarship.findMany({
    where: {
      studentId: { in: [...studentIds] },
      endedAt: null,
      OR: [{ startsOn: null }, { startsOn: { lte: day } }],
      AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: day } }] }],
    },
    orderBy: [{ createdAt: "asc" }],
    select: { studentId: true, percent: true, type: { select: { name: true } } },
  });
  for (const r of rows) out.set(r.studentId, [...(out.get(r.studentId) ?? []), { typeName: r.type.name, percent: r.percent }]);
  return out;
}

/// The live scholarships of these pupils on `day` with what the finance side needs to turn them into discounts.
export async function liveForInvoices(db: Db, studentIds: readonly string[], day: string) {
  const when = dayDate(day)!;
  const rows = await db.studentScholarship.findMany({
    where: {
      studentId: { in: [...studentIds] },
      endedAt: null,
      OR: [{ startsOn: null }, { startsOn: { lte: when } }],
      AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: when } }] }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, studentId: true, percent: true, type: { select: { name: true } } },
  });
  const by = new Map<string, { id: string; percent: number; typeName: string }[]>();
  for (const r of rows) by.set(r.studentId, [...(by.get(r.studentId) ?? []), { id: r.id, percent: r.percent, typeName: r.type.name }]);
  return by;
}

export type GrantInput = {
  branchId: string;
  studentId: string;
  typeId: string;
  percent?: number;
  startsOn?: string | null;
  endsOn?: string | null;
  note?: string | null;
};

/// The days run forwards and the share fits (a pupil's shares together never pass 100 on any day), checked under a lock on the pupil's row so two administrators cannot both slip under.
async function checkFits(
  tx: Prisma.TransactionClient,
  studentId: string,
  candidate: { percent: number; startsOn: string | null; endsOn: string | null },
  exceptId?: string,
) {
  if (candidate.startsOn && candidate.endsOn && candidate.startsOn > candidate.endsOn)
    throw new ScholarshipError("The last day must not be before the first day.", 400, "VALIDATION");
  const others = await tx.studentScholarship.findMany({
    where: { studentId, endedAt: null },
    select: { id: true, percent: true, startsOn: true, endsOn: true, endedAt: true },
  });
  const peak = peakPercent(
    others.map((o) => ({ id: o.id, percent: o.percent, startsOn: dayText(o.startsOn), endsOn: dayText(o.endsOn), endedAt: o.endedAt })),
    candidate,
    exceptId,
  );
  if (peak > MAX_PERCENT)
    throw new ScholarshipError(
      `This pupil's scholarships would add up to ${peak}% at once. Together they may not pass ${MAX_PERCENT}%: lower this one, end another, or change the days.`,
      409,
      "OVER_100",
    );
}

const lockStudent = (tx: Prisma.TransactionClient, studentId: string) =>
  tx.$queryRaw`SELECT "id" FROM "StudentRecord" WHERE "id" = ${studentId} FOR UPDATE`;

/// Grants a scholarship of a live type of the pupil's branch (the share defaults to the type's and may be set for this pupil), in the caller's transaction (the bulk import's too).
export async function grantTx(tx: Prisma.TransactionClient, actorUserId: string, input: GrantInput): Promise<GrantView> {
  await lockStudent(tx, input.studentId);
  const type = await tx.scholarshipType.findFirst({ where: { id: input.typeId, branchId: input.branchId, archivedAt: null } });
  if (!type) throw new ScholarshipError("Choose one of this branch's current scholarship types.", 404, "NOT_FOUND");
  const percent = input.percent ?? type.percent;
  if (!isPercent(percent)) throw new ScholarshipError("The share must be a whole number from 1 to 100.", 400, "VALIDATION");
  const startsOn = input.startsOn || null;
  const endsOn = input.endsOn || null;
  await checkFits(tx, input.studentId, { percent, startsOn, endsOn });
  const made = await tx.studentScholarship.create({
    data: {
      branchId: input.branchId,
      studentId: input.studentId,
      typeId: type.id,
      percent,
      startsOn: dayDate(startsOn),
      endsOn: dayDate(endsOn),
      note: input.note?.trim() || null,
      createdById: actorUserId,
    },
    select: grantSelect,
  });
  await audit(tx, actorUserId, "STUDENT_SCHOLARSHIP_GRANTED", "StudentRecord", input.studentId, {
    scholarshipId: made.id,
    typeId: type.id,
    percent,
    startsOn,
    endsOn,
  });
  return viewOf(made, today());
}

export const grant = (actorUserId: string, input: GrantInput): Promise<GrantView> =>
  prisma.$transaction((tx) => grantTx(tx, actorUserId, input));

export type ChangeInput = { percent?: number; startsOn?: string | null; endsOn?: string | null; note?: string | null };

/// Changes a scholarship that has not ended: its share, its days, its note. Null on an unknown one. Invoices already issued are not touched.
export async function change(actorUserId: string, studentId: string, id: string, patch: ChangeInput): Promise<GrantView | null> {
  return prisma.$transaction(async (tx) => {
    await lockStudent(tx, studentId);
    const before = await tx.studentScholarship.findFirst({ where: { id, studentId } });
    if (!before) return null;
    if (before.endedAt) throw new ScholarshipError("This scholarship has ended. Grant a new one instead.", 409, "ENDED");
    const percent = patch.percent ?? before.percent;
    if (!isPercent(percent)) throw new ScholarshipError("The share must be a whole number from 1 to 100.", 400, "VALIDATION");
    const startsOn = patch.startsOn !== undefined ? patch.startsOn || null : dayText(before.startsOn);
    const endsOn = patch.endsOn !== undefined ? patch.endsOn || null : dayText(before.endsOn);
    await checkFits(tx, studentId, { percent, startsOn, endsOn }, id);
    const after = await tx.studentScholarship.update({
      where: { id },
      data: {
        percent,
        startsOn: dayDate(startsOn),
        endsOn: dayDate(endsOn),
        ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      },
      select: grantSelect,
    });
    await audit(
      tx,
      actorUserId,
      "STUDENT_SCHOLARSHIP_CHANGED",
      "StudentRecord",
      studentId,
      { scholarshipId: id, percent, startsOn, endsOn },
      { percent: before.percent, startsOn: dayText(before.startsOn), endsOn: dayText(before.endsOn) },
    );
    return viewOf(after, today());
  });
}

/// Ends a scholarship now. It stays on record; invoices already issued keep what it took off.
export async function end(actorUserId: string, studentId: string, id: string): Promise<GrantView | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.studentScholarship.findFirst({ where: { id, studentId } });
    if (!before) return null;
    if (before.endedAt) return viewOf(await tx.studentScholarship.findUniqueOrThrow({ where: { id }, select: grantSelect }), today());
    const after = await tx.studentScholarship.update({
      where: { id },
      data: { endedAt: new Date(), endedById: actorUserId },
      select: grantSelect,
    });
    await audit(
      tx,
      actorUserId,
      "STUDENT_SCHOLARSHIP_ENDED",
      "StudentRecord",
      studentId,
      { scholarshipId: id },
      { percent: before.percent },
    );
    return viewOf(after, today());
  });
}

/// The pupil a scholarship belongs to, when the path's pupil is it (the 404 otherwise).
export async function belongsTo(studentId: string, id: string): Promise<boolean> {
  return (await prisma.studentScholarship.count({ where: { id, studentId } })) > 0;
}
