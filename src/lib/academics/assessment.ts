import { staysUnconfirmed } from "@/lib/results/scale-confirmation";
import { markCustomised } from "@/lib/results/school-template-marks";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, ConflictError } from "@/lib/academics/structure";
import { DomainError } from "@/lib/academics/sessions";
import { checkBands, checkScheme, type SchemeProblem, type ScaleProblem } from "@/lib/academics/scoring";
import { snapshotScheme } from "@/lib/academics/scoring-snapshot";

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
  /// Made for a result template or the school-wide scheme, not a branch or class scheme (task 0128).
  hosted: r.hosted,
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
  unconfirmed: r.unconfirmed,
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

/// `opts.hosted` (task 0116): a scheme that belongs to a result template, not to a class or the branch default. It has no class, so the one-live-scheme-per-class rule does not apply to it
/// (the database index ignores hosted schemes); its name is still unique among the branch's live schemes.
export async function createScheme(actorUserId: string, input: z.infer<typeof schemeInput>, opts: { hosted?: boolean } = {}) {
  const parsed = parseScheme({ totalMax: input.totalMax ?? 100, examMax: input.examMax, components: input.components });
  const schemeName = clean(input.name);
  const hosted = opts.hosted === true;
  const classGroupId = hosted ? null : (input.classGroupId ?? null);
  const { branchId } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      if (
        classGroupId &&
        !(await tx.classGroup.findFirst({ where: { id: classGroupId, branchId, archivedAt: null }, select: { id: true } }))
      )
        throw new ConflictError("That class does not exist in this branch (or is archived).");
      await lockKey(tx, "assessment-scheme", branchId);
      if (
        !hosted &&
        (await tx.assessmentScheme.findFirst({ where: { branchId, classGroupId, archivedAt: null, hosted: false }, select: { id: true } }))
      )
        throw new ConflictError(classGroupId ? "That class already has a scheme." : "This branch already has a default scheme.");
      const created = await tx.assessmentScheme.create({
        data: { branchId, classGroupId, name: schemeName, totalMax: parsed.totalMax, examMax: parsed.examMax, hosted },
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
      await markCustomised(tx, { branchId: current.branchId, schemeId: id }); // templates that follow a school template and use this scheme (task 0120)
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
          // A scheme that belongs to a result template stays hosted (task 0116): as a plain default it would collide with the branch's own default scheme.
          hosted: old.hosted,
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
      await markCustomised(tx, { branchId: old.branchId, schemeId: id }); // rows still pointing at the predecessor (task 0120)
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

/// Brings an archived scheme back (task 0128). Safe to repeat. Refused, in words, when it cannot be live again: a newer version replaced it (the newer one is the live one), another live scheme
/// has its name, another live scheme already holds its place (the branch default, or that class's scheme), or its class is archived. Checked under the same lock as every scheme write.
export async function restoreScheme(actorUserId: string, id: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.assessmentScheme.findUnique({ where: { id }, include: SCHEME_INCLUDE });
      if (!current) return null;
      if (!current.archivedAt) return toScheme(current);
      await lockKey(tx, "assessment-scheme", current.branchId);
      const replacedBy = await tx.assessmentScheme.findFirst({ where: { supersedesId: id }, select: { version: true } });
      if (replacedBy)
        throw new ConflictError(
          `A newer version (version ${replacedBy.version}) replaced this scheme, so it cannot come back. Use the newer one.`,
        );
      if (
        current.classGroupId &&
        !(await tx.classGroup.findFirst({ where: { id: current.classGroupId, archivedAt: null }, select: { id: true } }))
      )
        throw new ConflictError("That scheme belongs to a class that is archived. Restore the class first.");
      if (
        await tx.assessmentScheme.findFirst({
          where: { branchId: current.branchId, name: current.name, archivedAt: null },
          select: { id: true },
        })
      )
        throw new ConflictError(`Another live scheme is already called "${current.name}". Archive or rename it first.`);
      if (
        !current.hosted &&
        (await tx.assessmentScheme.findFirst({
          where: { branchId: current.branchId, classGroupId: current.classGroupId, archivedAt: null, hosted: false },
          select: { id: true },
        }))
      )
        throw new ConflictError(
          current.classGroupId
            ? "That class already has a live scheme. Archive it first to bring this one back."
            : "This branch already has a default scheme. Archive it first to bring this one back.",
        );
      await tx.assessmentScheme.update({ where: { id }, data: { archivedAt: null } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_RESTORED",
          targetType: "AssessmentScheme",
          targetId: id,
          beforeValue: { archived: true },
          afterValue: { archived: false },
        },
      });
      return toScheme(await tx.assessmentScheme.findUniqueOrThrow({ where: { id }, include: SCHEME_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("Another live scheme already holds this name or place. Reload and try again.");
    throw error;
  }
}

/// Makes a live scheme the branch's default (task 0131): the one marks entry uses for a class that has no scheme of its own and whose result template names none. A branch has exactly one live
/// default (the database index holds it), so the choice is a swap under the scheme lock: the scheme that was the default stops being it (it becomes one that only a result template can name, which is
/// what `hosted` means) and this one becomes it, in one transaction. Nothing is deleted or archived and no result changes: results keep the scheme they were entered with. Refused (409, in words) for
/// an archived scheme, a scheme made for one class, a school-wide scheme (it is changed under Scheme levels and copied into a branch), and one that was replaced by a newer version. Safe to repeat.
export async function makeSchemeDefault(actorUserId: string, id: string) {
  const owner = await prisma.assessmentScheme.findUnique({ where: { id }, select: { branchId: true } });
  if (!owner) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, "assessment-scheme", owner.branchId);
      const target = await tx.assessmentScheme.findUnique({ where: { id }, include: SCHEME_INCLUDE });
      if (!target) return null;
      if (target.archivedAt) throw new ConflictError("That scheme is archived. Restore it first.");
      if (target.classGroupId) throw new ConflictError("That scheme was made for one class, so it cannot be the branch default.");
      if (await tx.assessmentSchemeScope.count({ where: { schemeId: id } }))
        throw new ConflictError(
          'That is a school-wide or a teacher\'s own scheme. To use the school-wide scheme in this branch, use "Use the school-wide scheme".',
        );
      if (await tx.assessmentScheme.count({ where: { supersedesId: id } }))
        throw new ConflictError("A newer version replaced that scheme. Use the newer one.");
      if (!target.hosted) return toScheme(target); // already the default: nothing to do
      const previous = await tx.assessmentScheme.findFirst({
        where: { branchId: owner.branchId, classGroupId: null, archivedAt: null, hosted: false },
        select: { id: true, name: true },
      });
      if (previous) await tx.assessmentScheme.update({ where: { id: previous.id }, data: { hosted: true } });
      await tx.assessmentScheme.update({ where: { id }, data: { hosted: false } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_MADE_DEFAULT",
          targetType: "AssessmentScheme",
          targetId: id,
          beforeValue: { defaultSchemeId: previous?.id ?? null, defaultSchemeName: previous?.name ?? null },
          afterValue: { defaultSchemeId: id, defaultSchemeName: target.name },
        },
      });
      return toScheme(await tx.assessmentScheme.findUniqueOrThrow({ where: { id }, include: SCHEME_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a default scheme. Reload and try again.");
    throw error;
  }
}

/// Deletes a scheme for good, but only one that is connected to nothing (task 0128): no mark was ever entered against it (it was never locked and no result names it), no report-card template uses
/// it, it is not a school-wide or a teacher's own scheme (those have a level row), no teacher draft was approved into it, and it is not part of a version history (an earlier or later version
/// exists). Anything else is archived, never deleted: a printed card must always be able to say which scheme made its marks. Its own parts go with it. Checked under the same lock as every scheme
/// write, and the database refuses the delete if a result slipped in meanwhile (the foreign key), so a used scheme can never be removed. Returns null for an unknown id.
export async function deleteScheme(actorUserId: string, id: string) {
  const owner = await prisma.assessmentScheme.findUnique({ where: { id }, select: { branchId: true } });
  if (!owner) return null;
  const refused = "Marks already use this scheme, so it cannot be deleted. Archive it instead.";
  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, "assessment-scheme", owner.branchId);
      const current = await tx.assessmentScheme.findUnique({
        where: { id },
        include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, classGroup: { select: { name: true } } },
      });
      if (!current) return null; // deleted by someone else a moment ago: the same answer as an unknown id
      if (current.lockedAt || (await tx.result.count({ where: { schemeId: id } })) > 0) throw new ConflictError(refused);
      if (await tx.resultTemplate.count({ where: { schemeId: id } }))
        throw new ConflictError("A report-card template uses this scheme, so it cannot be deleted. Archive it instead.");
      if (current.supersedesId || (await tx.assessmentScheme.count({ where: { supersedesId: id } })))
        throw new ConflictError("This scheme is part of a version history, so it cannot be deleted. Archive it instead.");
      if (
        (await tx.assessmentSchemeScope.count({ where: { schemeId: id } })) ||
        (await tx.assessmentSchemeDraft.count({ where: { approvedSchemeId: id } }))
      )
        throw new ConflictError(
          "This is a school-wide or a teacher's own scheme, so it cannot be deleted here. Archive it, or change it under Scheme levels.",
        );
      await tx.assessmentComponent.deleteMany({ where: { schemeId: id } });
      // `lockedAt: null` again in the delete itself: a result entered an instant ago locks the scheme first, and this then removes nothing.
      const removed = await tx.assessmentScheme.deleteMany({ where: { id, lockedAt: null } });
      if (removed.count !== 1) throw new ConflictError(refused);
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ASSESSMENT_SCHEME_DELETED",
          targetType: "AssessmentScheme",
          targetId: id,
          beforeValue: {
            branchId: current.branchId,
            name: current.name,
            version: current.version,
            classGroupId: current.classGroupId,
            archived: current.archivedAt !== null,
            examMax: Number(current.examMax),
            components: current.components.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
          },
          afterValue: { deleted: true },
        },
      });
      return { deleted: true as const, name: current.name, classGroupName: current.classGroup?.name ?? null };
    });
  } catch (error) {
    // P2003: a result (or anything else) references the scheme after all; the transaction rolled back, so nothing was removed.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ConflictError(refused);
    throw error;
  }
}

/// A branch's default scheme made from the school-wide default (task 0128). A scheme is owned by one branch (every result names its branch's scheme), so the school-wide scheme is never read by
/// marks entry directly: this COPIES it into the branch, where it is an ordinary default that can be edited or versioned like any other. Refused when the branch already has a default or the school has
/// no default scheme. The copy takes the school-wide scheme's name, or "<name> (branch default)" when a live scheme of the branch already has it (the school-wide scheme is hosted by one branch).
export async function copySchoolWideScheme(actorUserId: string, branchId: string) {
  const source = await prisma.assessmentSchemeScope.findFirst({
    where: { level: "GLOBAL", isDefault: true, scheme: { archivedAt: null } },
    include: { scheme: { include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
  });
  if (!source)
    throw new ConflictError(
      "There is no school-wide default scheme yet. A superadmin sets one in Academics, Assessment and grading, Scheme levels, or you can make this branch's own scheme.",
    );
  const taken = async (name: string) =>
    (await prisma.assessmentScheme.findFirst({ where: { branchId, name, archivedAt: null }, select: { id: true } })) !== null;
  const base = clean(source.scheme.name);
  const name = (await taken(base)) ? `${base} (branch default)`.slice(0, 60) : base;
  if (name !== base && (await taken(name))) throw new ConflictError(`This branch already has a scheme called "${name}". Rename it first.`);
  const created = await createScheme(actorUserId, {
    branchId,
    classGroupId: null,
    name,
    totalMax: num(source.scheme.totalMax),
    examMax: num(source.scheme.examMax),
    components: source.scheme.components.map((c) => ({ name: c.name, maxScore: num(c.maxScore) })),
  });
  await audit(actorUserId, "ASSESSMENT_SCHEME_COPIED_FROM_SCHOOL_WIDE", "AssessmentScheme", created.id, {
    branchId,
    from: source.scheme.id,
  });
  return created;
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
      // Saving changed bands on an unconfirmed scale confirms it (task 0116 D15); a rename alone does not.
      const bandsChanged = JSON.stringify(beforeRec.bands) !== JSON.stringify(after.bands);
      const confirmsNow = current.unconfirmed && !staysUnconfirmed(current.unconfirmed, bandsChanged);
      await tx.gradeScale.update({ where: { id }, data: { name: scaleName, ...(confirmsNow ? { unconfirmed: false } : {}) } });
      if (bandsChanged) await markCustomised(tx, { branchId: current.branchId, gradeScaleId: id }); // a rename or a confirmation alone is not a change of content (task 0120)
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
          afterValue: { ...after, ...(confirmsNow ? { confirmedByEdit: true } : {}) },
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
      // The new version is confirmed when its bands were edited (the administrator wrote them); a rename alone keeps an unconfirmed scale unconfirmed. The OLD version stays as it was: marks
      // graded on it keep its letters, and while it is unconfirmed they cannot be published (it can still be confirmed, see `confirmScale`).
      const bandsChanged =
        JSON.stringify(before.bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark }))) !==
        JSON.stringify(bands.map(({ min, max, letter, remark }) => ({ min, max, letter, remark })));
      const created = await tx.gradeScale.create({
        data: {
          branchId: old.branchId,
          name: scaleName,
          isDefault: old.isDefault,
          version: old.version + 1,
          supersedesId: id,
          unconfirmed: staysUnconfirmed(old.unconfirmed, bandsChanged),
        },
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
      if (bandsChanged) await markCustomised(tx, { branchId: old.branchId, gradeScaleId: id }); // rows still pointing at the predecessor (task 0120)
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

/// Brings an archived grade scale back (task 0128), never as the default (the branch keeps the one it has). Safe to repeat. Refused when a newer version replaced it, or another live scale has its name.
export async function restoreScale(actorUserId: string, id: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.gradeScale.findUnique({ where: { id }, include: SCALE_INCLUDE });
      if (!current) return null;
      if (!current.archivedAt) return toScale(current);
      await lockKey(tx, "grade-scale", current.branchId);
      const replacedBy = await tx.gradeScale.findFirst({ where: { supersedesId: id }, select: { version: true } });
      if (replacedBy)
        throw new ConflictError(
          `A newer version (version ${replacedBy.version}) replaced this grade scale, so it cannot come back. Use the newer one.`,
        );
      if (
        await tx.gradeScale.findFirst({ where: { branchId: current.branchId, name: current.name, archivedAt: null }, select: { id: true } })
      )
        throw new ConflictError(`Another live grade scale is already called "${current.name}". Archive or rename it first.`);
      await tx.gradeScale.update({ where: { id }, data: { archivedAt: null, isDefault: false } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "GRADE_SCALE_RESTORED",
          targetType: "GradeScale",
          targetId: id,
          beforeValue: { archived: true },
          afterValue: { archived: false },
        },
      });
      return toScale(await tx.gradeScale.findUniqueOrThrow({ where: { id }, include: SCALE_INCLUDE }));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("Another live grade scale already holds this name. Reload and try again.");
    throw error;
  }
}

export async function lockScale(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return (await tx.gradeScale.updateMany({ where: { id, lockedAt: null }, data: { lockedAt: new Date() } })).count === 1;
}

/// The legacy WAEC-style scale (A1 ... F9) offered as a template the administrator applies - never inserted silently.
/// "Confirm these bands" (task 0116 D15): an administrator of the scale's branch (or a superadmin) says the bands are right. Clears `unconfirmed`; works on any scale of the branch, an earlier
/// version included (marks graded on it keep its letters and can then be published). Idempotent; audited with who and when (the audit row's actor and time).
export async function confirmScale(actorUserId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.gradeScale.findUnique({
      where: { id },
      select: { id: true, branchId: true, name: true, version: true, unconfirmed: true },
    });
    if (!current) return null;
    if (!current.unconfirmed) return { id, changed: false };
    await lockKey(tx, "grade-scale", current.branchId);
    await tx.gradeScale.update({ where: { id }, data: { unconfirmed: false } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "GRADE_SCALE_CONFIRMED",
        targetType: "GradeScale",
        targetId: id,
        beforeValue: { unconfirmed: true },
        afterValue: { unconfirmed: false, name: current.name, version: current.version, branchId: current.branchId },
      },
    });
    return { id, changed: true };
  });
}

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
