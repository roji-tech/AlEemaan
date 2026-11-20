import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/academics/structure";
import { ensureDefaultReportCardLayouts, getBranchReportCardLayout } from "@/lib/settings/approvals";
import { createScheme, schemeInput } from "@/lib/academics/assessment";
import { ensureReportTemplates } from "@/lib/results/seed-branch";
import {
  LAYOUT_CODES,
  TEMPLATE_DESCRIPTION_MAX,
  buildCoverage,
  cleanTemplateName,
  diffClasses,
  mergeLayoutOptions,
  movePreview,
  type LayoutOptions,
  type Move,
} from "@/lib/results/templates-rules";

// Result templates (task 0116): a named bundle of a look, a marks structure and a grade scale, assigned class by class, per branch. The caller's authority was checked by `withBranch`
// in the route; this module enforces the rules of the data and is the ONE place that answers "what does this class use" (see docs/tasks/0116 D7 for the precedence).
//
//   look       the class's template's layout, else the branch's standard layout (Approvals > Report cards), else the built-in default
//   scheme     the class's OWN scheme (unchanged), else the template's scheme, else the branch's default scheme
//   grade scale  the template's scale, else the branch's default scale
//
// A result keeps the scheme and scale it was entered under: nothing here rewrites a result.

/// Asking to place classes that are in other templates, without having confirmed the move. Carries what would leave where, so the screen can show it.
export class NeedsConfirmation extends ConflictError {
  constructor(
    message: string,
    readonly moves: Move[],
  ) {
    super(message);
  }
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const lock = (tx: Prisma.TransactionClient, branchId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result-template:${branchId}`}::text))`;
type Tx = Prisma.TransactionClient;

// ---- the default template ----

/// The branch's live default template, made on first use (a branch created after the migration has none yet). Idempotent: two callers at once make one (the database allows one live
/// default). Called inside a transaction it relies on the branch's lock for that, because a failed statement would end the transaction.
export async function ensureDefaultTemplate(branchId: string, db: Tx = prisma) {
  const found = await db.resultTemplate.findFirst({ where: { branchId, isDefault: true, archivedAt: null } });
  if (found) return found;
  // A live template of the same name would refuse "Default": take a free name instead of failing.
  let name = "Default";
  for (const candidate of ["Default", "Default template", "Standard"]) {
    if (
      !(await db.resultTemplate.findFirst({
        where: { branchId, archivedAt: null, name: { equals: candidate, mode: "insensitive" } },
        select: { id: true },
      }))
    ) {
      name = candidate;
      break;
    }
    name = `${candidate} ${Date.now().toString(36)}`;
  }
  try {
    return await db.resultTemplate.create({ data: { branchId, name, isDefault: true } });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const again = await db.resultTemplate.findFirst({ where: { branchId, isDefault: true, archivedAt: null } });
    if (again) return again;
    throw error;
  }
}

// ---- resolving what a class uses ----

/// The template a class uses: the one it is placed in, else the branch's default.
export async function templateForClass(branchId: string, classGroupId: string | null) {
  if (classGroupId) {
    const placed = await prisma.resultTemplate.findFirst({
      where: { branchId, archivedAt: null, classes: { some: { classGroupId } } },
    });
    if (placed) return placed;
  }
  return ensureDefaultTemplate(branchId);
}

const SCHEME_FULL = { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } satisfies Prisma.AssessmentSchemeInclude;
const SCALE_FULL = { bands: { orderBy: { minScore: "asc" } } } satisfies Prisma.GradeScaleInclude;

/// A scheme a template named, or the live version that replaced it (a locked scheme is changed by a new version that supersedes it). Null when it was archived with nothing replacing it.
async function liveScheme(branchId: string, id: string) {
  let at = id;
  for (let hops = 0; hops < 12; hops++) {
    const row = await prisma.assessmentScheme.findFirst({ where: { id: at, branchId }, include: SCHEME_FULL });
    if (!row) return null;
    if (!row.archivedAt) return row;
    const next = await prisma.assessmentScheme.findFirst({ where: { branchId, supersedesId: at }, select: { id: true } });
    if (!next) return null;
    at = next.id;
  }
  return null;
}
async function liveScale(branchId: string, id: string) {
  let at = id;
  for (let hops = 0; hops < 12; hops++) {
    const row = await prisma.gradeScale.findFirst({ where: { id: at, branchId }, include: SCALE_FULL });
    if (!row) return null;
    if (!row.archivedAt) return row;
    const next = await prisma.gradeScale.findFirst({ where: { branchId, supersedesId: at }, select: { id: true } });
    if (!next) return null;
    at = next.id;
  }
  return null;
}

/// What the class's template contributes to a sheet: its scheme and its scale, each the live one. Null for "not set, use the branch's". A scheme or scale the template names that is
/// no longer live and has no live successor is a 409 naming the template: a different grade scale must never be applied silently.
export async function templateMarks(branchId: string, classGroupId: string, needsScheme = true) {
  const template = await templateForClass(branchId, classGroupId);
  let scheme = null;
  let scale = null;
  // A class with a scheme of its own never uses the template's, so an archived template scheme must not stop it.
  if (template.schemeId && needsScheme) {
    scheme = await liveScheme(branchId, template.schemeId);
    if (!scheme)
      throw new ConflictError(
        `The result template "${template.name}" uses an assessment scheme that is archived. Choose another in Results > Templates.`,
      );
  }
  if (template.gradeScaleId) {
    scale = await liveScale(branchId, template.gradeScaleId);
    if (!scale)
      throw new ConflictError(
        `The result template "${template.name}" uses a grade scale that is archived. Choose another in Results > Templates.`,
      );
  }
  return { template, scheme, scale };
}

/// The report card's look for a class: its template's layout, else the branch's standard layout. Same shape as `getBranchReportCardLayout`.
export async function layoutForClass(branchId: string, classGroupId: string | null) {
  const template = await templateForClass(branchId, classGroupId);
  if (!template.layoutCode) return getBranchReportCardLayout(branchId);
  await ensureDefaultReportCardLayouts();
  const layout = await prisma.reportCardLayout.findUnique({ where: { code: template.layoutCode } });
  if (!layout) return getBranchReportCardLayout(branchId);
  const base = typeof layout.options === "object" && layout.options !== null ? (layout.options as LayoutOptions) : {};
  return {
    code: layout.code,
    name: layout.name,
    isLegacy: layout.isLegacy,
    options: mergeLayoutOptions(base, template.layoutOptions) as Record<string, boolean>,
  };
}

// ---- reading ----

const SCHEME_NAME = { select: { id: true, name: true, archivedAt: true } } as const;

/// The branch's templates, the classes each holds, the coverage of every class, and the choices a template can name.
export async function listTemplates(branchId: string, includeArchived = false) {
  await ensureDefaultTemplate(branchId);
  // A branch made before the report-card sets existed was seeded by the migration; one made some other way is seeded here, once.
  await ensureReportTemplates(branchId);
  const [templates, classes, assignments, ownRows, schemes, scales] = await Promise.all([
    prisma.resultTemplate.findMany({
      where: { branchId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { scheme: SCHEME_NAME, gradeScale: SCHEME_NAME },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.classGroup.findMany({
      where: { branchId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true, sectionId: true, section: { select: { name: true } } },
    }),
    prisma.resultTemplateClass.findMany({ where: { branchId }, select: { classGroupId: true, templateId: true } }),
    prisma.assessmentScheme.findMany({
      where: { branchId, archivedAt: null, hosted: false, classGroupId: { not: null } },
      select: { id: true, name: true, classGroupId: true },
    }),
    usableSchemes(branchId),
    prisma.gradeScale.findMany({
      where: { branchId, archivedAt: null },
      select: { id: true, name: true, isDefault: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const own: Record<string, { id: string; name: string }> = {};
  for (const r of ownRows) if (r.classGroupId) own[r.classGroupId] = { id: r.id, name: r.name };
  const classRefs = classes.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    sectionId: c.sectionId,
    sectionName: c.section?.name ?? null,
  }));
  const live = templates.filter((t) => !t.archivedAt);
  const coverage = buildCoverage(classRefs, assignments, live, own);
  const layouts = await prisma.reportCardLayout.findMany({
    orderBy: [{ isLegacy: "asc" }, { code: "asc" }],
    select: { code: true, name: true },
  });
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      archived: t.archivedAt !== null,
      layoutCode: t.layoutCode,
      layoutOptions: (t.layoutOptions as LayoutOptions | null) ?? null,
      scheme: t.scheme ? { id: t.scheme.id, name: t.scheme.name, archived: t.scheme.archivedAt !== null } : null,
      gradeScale: t.gradeScale ? { id: t.gradeScale.id, name: t.gradeScale.name, archived: t.gradeScale.archivedAt !== null } : null,
      classGroupIds: assignments.filter((a) => a.templateId === t.id).map((a) => a.classGroupId),
    })),
    classes: classRefs,
    coverage: coverage.rows,
    unplaced: coverage.unplaced,
    choices: {
      layouts:
        layouts.length > 0
          ? layouts
          : LAYOUT_CODES.map((code) => ({ code, name: code === "DEFAULT" ? "Standard Layout" : "Legacy Layout" })),
      schemes,
      scales,
    },
  };
}

/// The live schemes a template may name: the branch's own (default or a class's) and the ones made for templates; not a school-wide or a teacher's scheme (those have a scope).
async function usableSchemes(branchId: string) {
  const rows = await prisma.assessmentScheme.findMany({
    where: { branchId, archivedAt: null, OR: [{ hosted: false }, { scopes: { none: {} } }] },
    select: { id: true, name: true, classGroupId: true, hosted: true, classGroup: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.hosted
      ? "made for a template"
      : r.classGroupId
        ? `the scheme of ${r.classGroup?.name ?? "a class"}`
        : "the branch's default scheme",
  }));
}

export const templateBranchId = async (id: string) =>
  (await prisma.resultTemplate.findUnique({ where: { id }, select: { branchId: true } }))?.branchId ?? null;

// ---- writing ----

const optionsSchema = z.strictObject({
  logo: z.boolean().optional(),
  signatureLine: z.boolean().optional(),
  nextTermDate: z.boolean().optional(),
});
const layoutCodeSchema = z.enum(LAYOUT_CODES).nullable();
const idSchema = z.string().trim().min(1).max(64);
const nameSchema = z.string().max(200);
const descriptionSchema = z.string().trim().max(TEMPLATE_DESCRIPTION_MAX).nullable();

export const templateCreateInput = z.strictObject({
  branchId: idSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  layoutCode: layoutCodeSchema.optional(),
  layoutOptions: optionsSchema.nullable().optional(),
  schemeId: idSchema.nullable().optional(),
  gradeScaleId: idSchema.nullable().optional(),
  /// Duplicate: start from this template's look, scheme and scale (never its classes).
  copyFrom: idSchema.optional(),
  classGroupIds: z.array(idSchema).max(200).optional(),
  confirmMoves: z.boolean().optional(),
});
export const templatePatchInput = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    layoutCode: layoutCodeSchema.optional(),
    layoutOptions: optionsSchema.nullable().optional(),
    schemeId: idSchema.nullable().optional(),
    gradeScaleId: idSchema.nullable().optional(),
    /// Needed when marks are already entered for the template's classes in the open session: they keep the structure they were entered under, new sheets use the new one.
    acknowledge: z.boolean().optional(),
    /// Why, when a superadmin has put layout changes behind approval and an administrator changes the layout.
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== "acknowledge" && k !== "reason").length > 0, "Nothing to change.");
export const classesInput = z.strictObject({ classGroupIds: z.array(idSchema).max(200), confirmMoves: z.boolean().optional() });
/// A scheme made for templates: the same fields as any scheme (a total, an exam, the parts), for a branch, with no class.
export const templateSchemeInput = schemeInput.omit({ classGroupId: true });

async function checkSchemeChoice(tx: Tx, branchId: string, id: string) {
  const row = await tx.assessmentScheme.findFirst({
    where: { id, branchId, archivedAt: null, OR: [{ hosted: false }, { scopes: { none: {} } }] },
    select: { id: true },
  });
  if (!row) throw new ConflictError("That assessment scheme does not exist in this branch, is archived, or cannot be used by a template.");
}
async function checkScaleChoice(tx: Tx, branchId: string, id: string) {
  if (!(await tx.gradeScale.findFirst({ where: { id, branchId, archivedAt: null }, select: { id: true } })))
    throw new ConflictError("That grade scale does not exist in this branch or is archived.");
}
const nameOrThrow = (raw: string) => {
  const name = cleanTemplateName(raw);
  if (!name) throw new ConflictError("Give the template a name of 1 to 60 characters.");
  return name;
};
const json = (v: LayoutOptions | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v ? (v as Prisma.InputJsonValue) : Prisma.DbNull;
const audit = (
  tx: Tx,
  actorUserId: string,
  action: string,
  id: string,
  afterValue: Prisma.InputJsonValue,
  beforeValue?: Prisma.InputJsonValue,
) =>
  tx.auditLog.create({
    data: { actorUserId, action, targetType: "ResultTemplate", targetId: id, afterValue, ...(beforeValue ? { beforeValue } : {}) },
  });

/// Places `classGroupIds` in the template as its WHOLE set (classes it held that are not listed go back to "uses the default"). Classes that are in other templates move only with
/// `confirmMoves`. In the caller's transaction, under the branch's lock. Returns the move list and the counts.
async function setClasses(
  tx: Tx,
  actorUserId: string,
  template: { id: string; branchId: string; name: string },
  classGroupIds: readonly string[],
  confirmMoves: boolean,
) {
  const { branchId } = template;
  const wanted = [...new Set(classGroupIds)];
  const live = await tx.classGroup.findMany({ where: { branchId, archivedAt: null }, select: { id: true, name: true, sortOrder: true } });
  const liveIds = new Set(live.map((c) => c.id));
  if (wanted.some((id) => !liveIds.has(id)))
    throw new ConflictError("One of those classes does not exist in this branch (or is archived).");
  const [assignments, templates] = await Promise.all([
    tx.resultTemplateClass.findMany({ where: { branchId }, select: { classGroupId: true, templateId: true } }),
    tx.resultTemplate.findMany({ where: { branchId }, select: { id: true, name: true, isDefault: true } }),
  ]);
  const current = assignments.filter((a) => a.templateId === template.id).map((a) => a.classGroupId);
  const { add, drop } = diffClasses(current, wanted);
  const moves = movePreview(assignments, templates, live, template.id, add);
  if (moves.length > 0 && !confirmMoves)
    throw new NeedsConfirmation(
      `${moves.length === 1 ? "One class is" : `${moves.length} classes are`} in another template. Confirm the move to place ${moves.length === 1 ? "it" : "them"} in "${template.name}".`,
      moves,
    );
  if (moves.length > 0)
    await tx.resultTemplateClass.deleteMany({ where: { branchId, classGroupId: { in: moves.map((m) => m.classGroupId) } } });
  if (drop.length > 0)
    await tx.resultTemplateClass.deleteMany({ where: { branchId, templateId: template.id, classGroupId: { in: drop } } });
  if (add.length > 0)
    await tx.resultTemplateClass.createMany({ data: add.map((classGroupId) => ({ branchId, templateId: template.id, classGroupId })) });
  if (add.length > 0 || drop.length > 0)
    await audit(
      tx,
      actorUserId,
      "RESULT_TEMPLATE_CLASSES_ASSIGNED",
      template.id,
      {
        branchId,
        classGroupIds: wanted,
        added: add,
        dropped: drop,
        moved: moves.map((m) => ({ classGroupId: m.classGroupId, from: m.fromTemplateId })),
      },
      { classGroupIds: current },
    );
  return { moves, added: add.length, dropped: drop.length };
}

export async function createTemplate(actorUserId: string, input: z.infer<typeof templateCreateInput>) {
  const name = nameOrThrow(input.name);
  const { branchId } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      await lock(tx, branchId);
      await ensureDefaultTemplate(branchId, tx);
      const source = input.copyFrom ? await tx.resultTemplate.findFirst({ where: { id: input.copyFrom, branchId } }) : null;
      if (input.copyFrom && !source) throw new ConflictError("The template to copy does not exist in this branch.");
      const layoutCode = input.layoutCode !== undefined ? input.layoutCode : (source?.layoutCode ?? null);
      const layoutOptions =
        input.layoutOptions !== undefined ? input.layoutOptions : ((source?.layoutOptions as LayoutOptions | null) ?? null);
      const schemeId = input.schemeId !== undefined ? input.schemeId : (source?.schemeId ?? null);
      const gradeScaleId = input.gradeScaleId !== undefined ? input.gradeScaleId : (source?.gradeScaleId ?? null);
      if (schemeId) await checkSchemeChoice(tx, branchId, schemeId);
      if (gradeScaleId) await checkScaleChoice(tx, branchId, gradeScaleId);
      const created = await tx.resultTemplate.create({
        data: {
          branchId,
          name,
          description: input.description !== undefined ? input.description || null : (source?.description ?? null),
          layoutCode,
          layoutOptions: json(layoutCode ? layoutOptions : null),
          schemeId,
          gradeScaleId,
        },
      });
      await audit(tx, actorUserId, "RESULT_TEMPLATE_CREATED", created.id, {
        branchId,
        name,
        layoutCode,
        schemeId,
        gradeScaleId,
        copiedFrom: source?.id ?? null,
      });
      const placed = input.classGroupIds?.length
        ? await setClasses(tx, actorUserId, created, input.classGroupIds, input.confirmMoves === true)
        : { moves: [], added: 0, dropped: 0 };
      return { id: created.id, placed };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a template with that name.");
    throw error;
  }
}

/// How many results are already entered in the open session for the classes this template holds: what a change of scheme or scale would not reach.
export async function resultsUnderTemplate(branchId: string, templateId: string): Promise<number> {
  const classes = await prisma.resultTemplateClass.findMany({ where: { branchId, templateId }, select: { classGroupId: true } });
  if (classes.length === 0) return 0;
  return prisma.result.count({
    where: { branchId, classArm: { classGroupId: { in: classes.map((c) => c.classGroupId) } }, period: { session: { status: "ACTIVE" } } },
  });
}

export type LayoutChange = { layoutCode: (typeof LAYOUT_CODES)[number] | null; layoutOptions: LayoutOptions | null };

/// Applies a change of a template's look (also used when a superadmin approves a held change). In the caller's transaction.
export async function applyTemplateLayout(tx: Tx, actorUserId: string, templateId: string, branchId: string, change: LayoutChange) {
  const before = await tx.resultTemplate.findFirst({ where: { id: templateId, branchId } });
  if (!before) throw new ConflictError("That template no longer exists.");
  await tx.resultTemplate.update({
    where: { id: templateId },
    data: { layoutCode: change.layoutCode, layoutOptions: json(change.layoutCode ? change.layoutOptions : null) },
  });
  await audit(
    tx,
    actorUserId,
    "RESULT_TEMPLATE_UPDATED",
    templateId,
    { layoutCode: change.layoutCode, layoutOptions: change.layoutOptions },
    {
      layoutCode: before.layoutCode,
      layoutOptions: (before.layoutOptions as Prisma.InputJsonValue | null) ?? null,
    },
  );
}

/// Edits a template. The layout is NOT applied here: the route decides (it may be held for a superadmin) and calls `applyTemplateLayout`. `resultsAffected` is returned for the caller
/// to compare with `acknowledge` BEFORE anything is written; this function re-checks inside the transaction.
export async function updateTemplate(actorUserId: string, id: string, patch: z.infer<typeof templatePatchInput>) {
  const current = await prisma.resultTemplate.findUnique({ where: { id } });
  if (!current) return null;
  if (current.archivedAt) throw new ConflictError("That template is archived. Restore it to change it.");
  const marksChange =
    (patch.schemeId !== undefined && patch.schemeId !== current.schemeId) ||
    (patch.gradeScaleId !== undefined && patch.gradeScaleId !== current.gradeScaleId);
  if (marksChange && patch.acknowledge !== true) {
    const entered = await resultsUnderTemplate(current.branchId, id);
    if (entered > 0)
      throw new ConflictError(
        `Marks are already entered for ${entered} ${entered === 1 ? "result" : "results"} in this template's classes. They keep the structure they were entered under; new sheets would use the new one. Confirm to change it anyway.`,
      );
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await lock(tx, current.branchId);
      const fresh = await tx.resultTemplate.findUniqueOrThrow({ where: { id } });
      if (fresh.archivedAt) throw new ConflictError("That template is archived. Restore it to change it.");
      const data: Prisma.ResultTemplateUncheckedUpdateInput = {};
      const before: Record<string, Prisma.InputJsonValue | null> = {};
      const after: Record<string, Prisma.InputJsonValue | null> = {};
      if (patch.name !== undefined) {
        data.name = nameOrThrow(patch.name);
        before.name = fresh.name;
        after.name = data.name;
      }
      if (patch.description !== undefined) {
        data.description = patch.description || null;
        before.description = fresh.description;
        after.description = (data.description as string | null) ?? null;
      }
      if (patch.schemeId !== undefined) {
        if (patch.schemeId) await checkSchemeChoice(tx, fresh.branchId, patch.schemeId);
        data.schemeId = patch.schemeId;
        before.schemeId = fresh.schemeId;
        after.schemeId = patch.schemeId;
      }
      if (patch.gradeScaleId !== undefined) {
        if (patch.gradeScaleId) await checkScaleChoice(tx, fresh.branchId, patch.gradeScaleId);
        data.gradeScaleId = patch.gradeScaleId;
        before.gradeScaleId = fresh.gradeScaleId;
        after.gradeScaleId = patch.gradeScaleId;
      }
      if (Object.keys(data).length > 0) {
        await tx.resultTemplate.update({ where: { id }, data });
        await audit(tx, actorUserId, "RESULT_TEMPLATE_UPDATED", id, after as Prisma.InputJsonValue, before as Prisma.InputJsonValue);
      }
      return { id, changed: Object.keys(data).length > 0 };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("This branch already has a template with that name.");
    throw error;
  }
}

export async function assignClasses(actorUserId: string, id: string, input: z.infer<typeof classesInput>) {
  const current = await prisma.resultTemplate.findUnique({
    where: { id },
    select: { id: true, branchId: true, name: true, archivedAt: true },
  });
  if (!current) return null;
  if (current.archivedAt) throw new ConflictError("That template is archived. Restore it to give it classes.");
  return prisma.$transaction(async (tx) => {
    await lock(tx, current.branchId);
    return setClasses(tx, actorUserId, current, input.classGroupIds, input.confirmMoves === true);
  });
}

export async function archiveTemplate(actorUserId: string, id: string) {
  const current = await prisma.resultTemplate.findUnique({
    where: { id },
    include: { classes: { select: { classGroupId: true, classGroup: { select: { name: true } } } } },
  });
  if (!current) return null;
  if (current.archivedAt) return { id, changed: false };
  if (current.isDefault) throw new ConflictError("This is the branch's default template. Make another template the default first.");
  if (current.classes.length > 0)
    throw new ConflictError(
      `This template still holds ${current.classes.map((c) => c.classGroup.name).join(", ")}. Move those classes to another template first.`,
    );
  return prisma.$transaction(async (tx) => {
    await lock(tx, current.branchId);
    const done = await tx.resultTemplate.updateMany({
      where: { id, archivedAt: null, isDefault: false },
      data: { archivedAt: new Date() },
    });
    if (done.count === 1) await audit(tx, actorUserId, "RESULT_TEMPLATE_ARCHIVED", id, { archived: true }, { archived: false });
    return { id, changed: done.count === 1 };
  });
}

export async function restoreTemplate(actorUserId: string, id: string) {
  const current = await prisma.resultTemplate.findUnique({ where: { id } });
  if (!current) return null;
  if (!current.archivedAt) return { id, changed: false };
  try {
    return await prisma.$transaction(async (tx) => {
      await lock(tx, current.branchId);
      await tx.resultTemplate.update({ where: { id }, data: { archivedAt: null } });
      await audit(tx, actorUserId, "RESULT_TEMPLATE_RESTORED", id, { archived: false }, { archived: true });
      return { id, changed: true };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("A live template already has this name. Rename that one first.");
    throw error;
  }
}

/// Makes this template the branch's default (the one every unplaced class uses). The old default stays a normal template. One transaction: the old flag is cleared first so the
/// one-live-default index admits the new one.
export async function makeDefaultTemplate(actorUserId: string, id: string) {
  const current = await prisma.resultTemplate.findUnique({ where: { id } });
  if (!current) return null;
  if (current.archivedAt) throw new ConflictError("That template is archived. Restore it first.");
  if (current.isDefault) return { id, changed: false };
  return prisma.$transaction(async (tx) => {
    await lock(tx, current.branchId);
    const old = await tx.resultTemplate.findFirst({
      where: { branchId: current.branchId, isDefault: true, archivedAt: null },
      select: { id: true },
    });
    if (old) await tx.resultTemplate.update({ where: { id: old.id }, data: { isDefault: false } });
    await tx.resultTemplate.update({ where: { id }, data: { isDefault: true } });
    await audit(
      tx,
      actorUserId,
      "RESULT_TEMPLATE_DEFAULT_SET",
      id,
      { branchId: current.branchId, defaultTemplateId: id },
      { defaultTemplateId: old?.id ?? null },
    );
    return { id, changed: true };
  });
}

/// A marks structure made for templates (not for a class and not the branch default): the same rules as any scheme, stored hosted (see `createScheme`).
export async function createTemplateScheme(actorUserId: string, input: z.infer<typeof templateSchemeInput>) {
  return createScheme(actorUserId, input, { hosted: true });
}
