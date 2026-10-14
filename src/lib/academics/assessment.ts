import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, ConflictError } from "@/lib/academics/structure";
import { DomainError } from "@/lib/academics/sessions";
import { checkBands, checkScheme, snapshotScheme, type SchemeProblem, type ScaleProblem } from "@/lib/academics/scoring";

// Assessment schemes and grade scales of ONE branch (Slice P1b). The caller's authority was checked by `withBranch` in the route; this module only enforces the
// rules of the data. Both are VERSIONED: edited in place only while unlocked (the first result that references one locks it - Slice P2 - and the database
// then refuses any change to it or its children); a later change is a NEW VERSION that supersedes it. Nothing is deleted.

const SCHEME_MESSAGES: Record<SchemeProblem, string> = {
  PRECISION: "Scores can have at most two decimal places.",
  TOTAL_NOT_POSITIVE: "The total must be more than zero.",
  EXAM_NEGATIVE: "The exam mark cannot be negative.",
  NO_COMPONENTS: "Add at least one continuous-assessment component.",
  TOO_MANY_COMPONENTS: "Use at most 10 components.",
  COMPONENT_NAME_INVALID: "Each component needs a name of 1 to 40 characters.",
  COMPONENT_NAME_DUPLICATE: "Two components have the same name.",
  COMPONENT_MAX_NOT_POSITIVE: "Each component must be worth more than zero.",
  SUM_MISMATCH: "The components and the exam must add up to the total exactly.",
};
const SCALE_MESSAGES: Record<ScaleProblem, string> = {
  PRECISION: "Scores can have at most two decimal places.",
  NO_BANDS: "Add at least one grade band.",
  TOO_MANY_BANDS: "Use at most 12 bands.",
  OUT_OF_RANGE: "Bands must stay between 0 and 100.",
  NOT_ASCENDING: "Each band's lower score must be below its upper score.",
  GAP: "There is a gap between two bands.",
  OVERLAP: "Two bands overlap.",
  STARTS_ABOVE_ZERO: "The lowest band must start at 0.",
  ENDS_BELOW_HUNDRED: "The highest band must end at 100.",
  LETTER_INVALID: "Each grade needs a letter of 1 to 4 characters.",
  LETTER_DUPLICATE: "Two bands use the same letter.",
  REMARK_INVALID: "Each band needs a remark of 1 to 40 characters.",
};

const name = z.string().trim().min(1, "Give a name.").max(60, "Use at most 60 characters.");
const score = z.number({ error: "Give a number." });
const component = z.strictObject({ name: z.string(), maxScore: score });
export const schemeInput = z.strictObject({
  branchId: z.string().min(1),
  classGroupId: z.string().min(1).nullable().optional(),
  name,
  totalMax: score.optional(),
  examMax: score,
  components: z.array(component).min(1, "Add at least one component.").max(10),
});
export const schemePatch = z
  .strictObject({
    name: name.optional(),
    totalMax: score.optional(),
    examMax: score.optional(),
    components: z.array(component).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");
const band = z.strictObject({ min: score, max: score, letter: z.string(), remark: z.string() });
export const scaleInput = z.strictObject({ branchId: z.string().min(1), name, bands: z.array(band).min(1).max(12) });
export const scalePatch = z
  .strictObject({ name: name.optional(), bands: z.array(band).max(12).optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

export const schemeBranchId = async (id: string) =>
  (await prisma.assessmentScheme.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;
export const scaleBranchId = async (id: string) =>
  (await prisma.gradeScale.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

const num = (v: { toString(): string }) => Number(v.toString());
const SCHEME_INCLUDE = {
  classGroup: { select: { name: true } },
  components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
} satisfies Prisma.AssessmentSchemeInclude;
type SchemeRow = Prisma.AssessmentSchemeGetPayload<{ include: typeof SCHEME_INCLUDE }>;
export type SchemeView = ReturnType<typeof toScheme>;
const toScheme = (r: SchemeRow) => ({
  id: r.id,
  branchId: r.branchId,
  classGroupId: r.classGroupId,
  classGroupName: r.classGroup?.name ?? null,
  name: r.name,
  totalMax: num(r.totalMax),
  examMax: num(r.examMax),
  version: r.version,
  locked: r.lockedAt !== null,
  supersedesId: r.supersedesId,
  archived: r.archivedAt !== null,
  components: r.components.map((c) => ({ id: c.id, name: c.name, maxScore: num(c.maxScore), sortOrder: c.sortOrder })),
});
const SCALE_INCLUDE = { bands: { orderBy: [{ minScore: "asc" }, { id: "asc" }] } } satisfies Prisma.GradeScaleInclude;
type ScaleRow = Prisma.GradeScaleGetPayload<{ include: typeof SCALE_INCLUDE }>;
export type ScaleView = ReturnType<typeof toScale>;
const toScale = (r: ScaleRow) => ({
  id: r.id,
  branchId: r.branchId,
  name: r.name,
  isDefault: r.isDefault,
  version: r.version,
  locked: r.lockedAt !== null,
  supersedesId: r.supersedesId,
  archived: r.archivedAt !== null,
  bands: r.bands.map((b) => ({
    id: b.id,
    min: num(b.minScore),
    max: num(b.maxScore),
    letter: b.letter,
    remark: b.remark,
    sortOrder: b.sortOrder,
  })),
});

const lockKey = (tx: Prisma.TransactionClient, kind: string, branchId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${branchId}`}::text))`;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function parseScheme(i: { totalMax: number; examMax: number; components: readonly { name: string; maxScore: number }[] }) {
  const components = i.components.map((c, sortOrder) => ({ name: clean(c.name), maxScore: c.maxScore, sortOrder }));
  const bad = checkScheme({ totalMax: i.totalMax, examMax: i.examMax, components });
  if (bad) throw new DomainError(SCHEME_MESSAGES[bad.problem]);
  return { components, totalMax: i.totalMax, examMax: i.examMax };
}
function parseBands(input: readonly { min: number; max: number; letter: string; remark: string }[]) {
  const cleaned = input.map((b) => ({ min: b.min, max: b.max, letter: b.letter.trim(), remark: clean(b.remark) }));
  const bad = checkBands(cleaned);
  if (bad) throw new DomainError(SCALE_MESSAGES[bad.problem]);
  return [...cleaned].sort((x, y) => x.min - y.min).map((b, sortOrder) => ({ ...b, sortOrder }));
}
const rec = (v: { name: string; totalMax: number; examMax: number; components: { name: string; maxScore: number }[] }) => ({
  name: v.name,
  totalMax: v.totalMax,
  examMax: v.examMax,
  components: v.components.map((c) => ({ name: c.name, maxScore: c.maxScore })),
});
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---- schemes ----
export async function listSchemes(branchId: string, includeArchived = false) {
  const rows = await prisma.assessmentScheme.findMany({
    where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: SCHEME_INCLUDE,
    orderBy: [{ name: "asc" }, { version: "desc" }],
  });
  return rows.map(toScheme);
}
export async function getScheme(id: string) {
  const row = await prisma.assessmentScheme.findUnique({ where: { id }, include: SCHEME_INCLUDE });
  return row ? { scheme: toScheme(row), snapshot: snapshotScheme(toScheme(row)) } : null;
}

export async function createScheme(actorUserId: string, input: z.infer<typeof schemeInput>) {
  const parsed = parseScheme({ totalMax: input.totalMax ?? 100, examMax: input.examMax, components: input.components });
  const schemeName = clean(input.name);
  const classGroupId = input.classGroupId ?? null;
  const { branchId } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      if (
        classGroupId &&
        !(await tx.classGroup.findFirst({ where: { id: classGroupId, branchId, archivedAt: null }, select: { id: true } }))
      )
        throw new ConflictError("That class does not exist in this branch (or is archived).");
      await lockKey(tx, "assessment-scheme", branchId);
      if (await tx.assessmentScheme.findFirst({ where: { branchId, classGroupId, archivedAt: null }, select: { id: true } }))
        throw new ConflictError(classGroupId ? "That class already has a scheme." : "This branch already has a default scheme.");
      const created = await tx.assessmentScheme.create({
        data: { branchId, classGroupId, name: schemeName, totalMax: parsed.totalMax, examMax: parsed.examMax },
      });
      await tx.assessmentComponent.createMany({ data: parsed.components.map((c) => ({ branchId, schemeId: created.id, ...c })) });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_CREATED",
          targetType: "AssessmentScheme",
          targetId: created.id,
          afterValue: { branchId, classGroupId, ...rec({ name: schemeName, ...parsed }) },
        },
      });
      return toScheme(await tx.assessmentScheme.findUniqueOrThrow({ where: { id: created.id }, include: SCHEME_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a scheme with that name.");
    throw error;
  }
}

/// In place - only while unlocked and live. Anything not given stays as it was; the whole result is re-validated.
export async function updateScheme(actorUserId: string, id: string, patch: z.infer<typeof schemePatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.assessmentScheme.findUnique({ where: { id }, include: SCHEME_INCLUDE });
      if (!current) return null;
      if (current.archivedAt) throw new ConflictError("That scheme is archived.");
      if (current.lockedAt) throw new ConflictError("Results already use this scheme, so it can't be edited. Make a new version instead.");
      const before = toScheme(current);
      const schemeName = patch.name === undefined ? current.name : clean(patch.name);
      const parsed = parseScheme({
        totalMax: patch.totalMax ?? before.totalMax,
        examMax: patch.examMax ?? before.examMax,
        components: patch.components ?? before.components,
      });
      const after = rec({ name: schemeName, ...parsed });
      if (JSON.stringify(rec(before)) === JSON.stringify(after)) return { scheme: before, changed: false };
      await lockKey(tx, "assessment-scheme", current.branchId);
      await tx.assessmentScheme.update({ where: { id }, data: { name: schemeName, totalMax: parsed.totalMax, examMax: parsed.examMax } });
      await tx.assessmentComponent.deleteMany({ where: { schemeId: id } });
      await tx.assessmentComponent.createMany({ data: parsed.components.map((c) => ({ branchId: current.branchId, schemeId: id, ...c })) });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_UPDATED",
          targetType: "AssessmentScheme",
          targetId: id,
          beforeValue: rec(before),
          afterValue: after,
        },
      });
      return { scheme: toScheme(await tx.assessmentScheme.findUniqueOrThrow({ where: { id }, include: SCHEME_INCLUDE })), changed: true };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a scheme with that name.");
    throw error;
  }
}

/// A change to a LOCKED scheme: version + 1 with the given changes; the predecessor is archived and linked. One transaction.
export async function newSchemeVersion(actorUserId: string, id: string, patch: z.infer<typeof schemePatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const old = await tx.assessmentScheme.findUnique({ where: { id }, include: SCHEME_INCLUDE });
      if (!old) return null;
      if (old.archivedAt) throw new ConflictError("That scheme is archived.");
      if (!old.lockedAt) throw new ConflictError("This scheme isn't used by any result yet - edit it in place instead.");
      const before = toScheme(old);
      const schemeName = patch.name === undefined ? old.name : clean(patch.name);
      const parsed = parseScheme({
        totalMax: patch.totalMax ?? before.totalMax,
        examMax: patch.examMax ?? before.examMax,
        components: patch.components ?? before.components,
      });
      await lockKey(tx, "assessment-scheme", old.branchId);
      // the predecessor leaves the "live" set FIRST so the one-live-per-scope index admits its successor
      const archived = await tx.assessmentScheme.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
      if (archived.count !== 1) throw new ConflictError("That scheme just changed. Reload and try again.");
      const created = await tx.assessmentScheme.create({
        data: {
          branchId: old.branchId,
          classGroupId: old.classGroupId,
          name: schemeName,
          totalMax: parsed.totalMax,
          examMax: parsed.examMax,
          version: old.version + 1,
          supersedesId: id,
        },
      });
      await tx.assessmentComponent.createMany({
        data: parsed.components.map((c) => ({ branchId: old.branchId, schemeId: created.id, ...c })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_NEW_VERSION",
          targetType: "AssessmentScheme",
          targetId: created.id,
          beforeValue: { supersedes: id, version: old.version, ...rec(before) },
          afterValue: { version: old.version + 1, ...rec({ name: schemeName, ...parsed }) },
        },
      });
      return toScheme(await tx.assessmentScheme.findUniqueOrThrow({ where: { id: created.id }, include: SCHEME_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a scheme with that name.");
    throw error;
  }
}

export async function archiveScheme(actorUserId: string, id: string) {
  const current = await prisma.assessmentScheme.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!current) return null;
  if (!current.archivedAt) {
    await prisma.assessmentScheme.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(actorUserId, "ASSESSMENT_SCHEME_ARCHIVED", "AssessmentScheme", id, { archived: true }, { archived: false });
  }
  return toScheme(await prisma.assessmentScheme.findUniqueOrThrow({ where: { id }, include: SCHEME_INCLUDE }));
}

/// Called (inside the caller's transaction) the first time a result references a scheme (Slice P2). Idempotent; true when THIS call locked it.
export async function lockScheme(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return (await tx.assessmentScheme.updateMany({ where: { id, lockedAt: null }, data: { lockedAt: new Date() } })).count === 1;
}

// ---- grade scales ----
export async function listScales(branchId: string, includeArchived = false) {
  const rows = await prisma.gradeScale.findMany({
    where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: SCALE_INCLUDE,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }, { version: "desc" }],
  });
  return rows.map(toScale);
}

export async function createScale(actorUserId: string, input: z.infer<typeof scaleInput>) {
  const bands = parseBands(input.bands);
  const scaleName = clean(input.name);
  const { branchId } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, "grade-scale", branchId);
      const hasDefault = Boolean(
        await tx.gradeScale.findFirst({ where: { branchId, isDefault: true, archivedAt: null }, select: { id: true } }),
      );
      const created = await tx.gradeScale.create({ data: { branchId, name: scaleName, isDefault: !hasDefault } });
      await tx.gradeBand.createMany({
        data: bands.map((b) => ({
          branchId,
          scaleId: created.id,
          minScore: b.min,
          maxScore: b.max,
          letter: b.letter,
          remark: b.remark,
          sortOrder: b.sortOrder,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "GRADE_SCALE_CREATED",
          targetType: "GradeScale",
          targetId: created.id,
          afterValue: {
            branchId,
            name: scaleName,
            isDefault: !hasDefault,
            bands: bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark })),
          },
        },
      });
      return toScale(await tx.gradeScale.findUniqueOrThrow({ where: { id: created.id }, include: SCALE_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a grade scale with that name.");
    throw error;
  }
}

export async function updateScale(actorUserId: string, id: string, patch: z.infer<typeof scalePatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.gradeScale.findUnique({ where: { id }, include: SCALE_INCLUDE });
      if (!current) return null;
      if (current.archivedAt) throw new ConflictError("That grade scale is archived.");
      if (current.lockedAt)
        throw new ConflictError("Results already use this grade scale, so it can't be edited. Make a new version instead.");
      const before = toScale(current);
      const scaleName = patch.name === undefined ? current.name : clean(patch.name);
      const bands = parseBands(patch.bands ?? before.bands);
      const after = { name: scaleName, bands: bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark })) };
      const beforeRec = { name: before.name, bands: before.bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark })) };
      if (JSON.stringify(beforeRec) === JSON.stringify(after)) return { scale: before, changed: false };
      await lockKey(tx, "grade-scale", current.branchId);
      await tx.gradeScale.update({ where: { id }, data: { name: scaleName } });
      await tx.gradeBand.deleteMany({ where: { scaleId: id } });
      await tx.gradeBand.createMany({
        data: bands.map((b) => ({
          branchId: current.branchId,
          scaleId: id,
          minScore: b.min,
          maxScore: b.max,
          letter: b.letter,
          remark: b.remark,
          sortOrder: b.sortOrder,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "GRADE_SCALE_UPDATED",
          targetType: "GradeScale",
          targetId: id,
          beforeValue: beforeRec,
          afterValue: after,
        },
      });
      return { scale: toScale(await tx.gradeScale.findUniqueOrThrow({ where: { id }, include: SCALE_INCLUDE })), changed: true };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a grade scale with that name.");
    throw error;
  }
}

export async function newScaleVersion(actorUserId: string, id: string, patch: z.infer<typeof scalePatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const old = await tx.gradeScale.findUnique({ where: { id }, include: SCALE_INCLUDE });
      if (!old) return null;
      if (old.archivedAt) throw new ConflictError("That grade scale is archived.");
      if (!old.lockedAt) throw new ConflictError("This grade scale isn't used by any result yet - edit it in place instead.");
      const before = toScale(old);
      const scaleName = patch.name === undefined ? old.name : clean(patch.name);
      const bands = parseBands(patch.bands ?? before.bands);
      await lockKey(tx, "grade-scale", old.branchId);
      const archived = await tx.gradeScale.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt: new Date(), isDefault: false },
      });
      if (archived.count !== 1) throw new ConflictError("That grade scale just changed. Reload and try again.");
      const created = await tx.gradeScale.create({
        data: { branchId: old.branchId, name: scaleName, isDefault: old.isDefault, version: old.version + 1, supersedesId: id },
      });
      await tx.gradeBand.createMany({
        data: bands.map((b) => ({
          branchId: old.branchId,
          scaleId: created.id,
          minScore: b.min,
          maxScore: b.max,
          letter: b.letter,
          remark: b.remark,
          sortOrder: b.sortOrder,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "GRADE_SCALE_NEW_VERSION",
          targetType: "GradeScale",
          targetId: created.id,
          beforeValue: { supersedes: id, version: old.version, name: before.name },
          afterValue: {
            version: old.version + 1,
            isDefault: old.isDefault,
            name: scaleName,
            bands: bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark })),
          },
        },
      });
      return toScale(await tx.gradeScale.findUniqueOrThrow({ where: { id: created.id }, include: SCALE_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a grade scale with that name.");
    throw error;
  }
}

export async function makeDefaultScale(actorUserId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.gradeScale.findUnique({ where: { id }, include: SCALE_INCLUDE });
    if (!current) return null;
    if (current.archivedAt) throw new ConflictError("That grade scale is archived.");
    if (current.isDefault) return { scale: toScale(current), changed: false };
    await lockKey(tx, "grade-scale", current.branchId);
    const previous = await tx.gradeScale.findFirst({
      where: { branchId: current.branchId, isDefault: true, archivedAt: null },
      select: { id: true },
    });
    await tx.gradeScale.updateMany({ where: { branchId: current.branchId, isDefault: true }, data: { isDefault: false } });
    await tx.gradeScale.update({ where: { id }, data: { isDefault: true } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "GRADE_SCALE_DEFAULT_CHANGED",
        targetType: "GradeScale",
        targetId: id,
        beforeValue: { defaultId: previous?.id ?? null },
        afterValue: { defaultId: id },
      },
    });
    return { scale: toScale(await tx.gradeScale.findUniqueOrThrow({ where: { id }, include: SCALE_INCLUDE })), changed: true };
  });
}

export async function archiveScale(actorUserId: string, id: string) {
  const current = await prisma.gradeScale.findUnique({ where: { id }, select: { id: true, archivedAt: true, isDefault: true } });
  if (!current) return null;
  if (current.archivedAt) return toScale(await prisma.gradeScale.findUniqueOrThrow({ where: { id }, include: SCALE_INCLUDE }));
  if (current.isDefault) throw new ConflictError("This is the branch's default grade scale. Make another one the default first.");
  await prisma.gradeScale.update({ where: { id }, data: { archivedAt: new Date() } });
  await audit(actorUserId, "GRADE_SCALE_ARCHIVED", "GradeScale", id, { archived: true }, { archived: false });
  return toScale(await prisma.gradeScale.findUniqueOrThrow({ where: { id }, include: SCALE_INCLUDE }));
}

export async function lockScale(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return (await tx.gradeScale.updateMany({ where: { id, lockedAt: null }, data: { lockedAt: new Date() } })).count === 1;
}

/// The legacy WAEC-style scale (A1 ... F9) offered as a template the administrator applies - never inserted silently.
export const WAEC_TEMPLATE = [
  { min: 0, max: 40, letter: "F9", remark: "Fail" },
  { min: 40, max: 45, letter: "E8", remark: "Pass" },
  { min: 45, max: 50, letter: "D7", remark: "Pass" },
  { min: 50, max: 55, letter: "C6", remark: "Credit" },
  { min: 55, max: 60, letter: "C5", remark: "Credit" },
  { min: 60, max: 65, letter: "C4", remark: "Credit" },
  { min: 65, max: 70, letter: "B3", remark: "Good" },
  { min: 70, max: 75, letter: "B2", remark: "Very good" },
  { min: 75, max: 100, letter: "A1", remark: "Excellent" },
] as const;
