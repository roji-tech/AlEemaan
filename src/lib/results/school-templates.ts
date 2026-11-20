import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/academics/structure";
import { DomainError } from "@/lib/academics/sessions";
import { SCHOOL_SEEDS } from "@/lib/results/school-seeds";
import {
  checkDefinition,
  cleanName,
  definitionSchema,
  rowState,
  sharedNameClashes,
  type Definition,
  type RowState,
  type schoolTemplateInput,
  type schoolTemplatePatch,
} from "@/lib/results/school-templates-rules";

// School-wide result templates (task 0120). A MASTER (SchoolResultTemplate) holds a look and a definition; a branch's own ResultTemplate rows FOLLOW it (schoolTemplateId). Every branch-checked key,
// class assignment and result stays exactly as it was: a master only says what to copy into a row. Only a superadmin reaches the master-level functions (the routes are `superAdmin: true`);
// `detachRow` is for the row's branch administrator (the route is `withBranch ... administer`). The caller's authority is always checked by the route, never here.
//
// Applying a master to a row (a sync, "add to branches", seeding a new branch):
//   look        layout code and options, the description, and the name when no other live template of the branch has it
//   marks       the live scheme of the branch NAMED like the master's: made when absent, left alone when equal, changed in place while no result locked it, else a NEW VERSION (the predecessor is
//               archived and linked; results keep the scheme they were entered under). A scheme the branch owns (not made for templates) with that name is never touched.
//   grades      the same for the grade scale, and never for the branch's default scale; a changed scale takes the master's "unconfirmed" flag, an unchanged one keeps the branch's own confirmation
//   traits      groups and traits are matched on their stable keys (schoolKey); one the master dropped is ARCHIVED (ratings stay), never deleted; the branch's own groups and traits are untouched
// Class assignments are never touched.

type Tx = Prisma.TransactionClient;
const lockBranchTemplates = (tx: Tx, branchId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`result-template:${branchId}`}::text))`;
const lockKey = (tx: Tx, kind: string, branchId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${branchId}`}::text))`;
const lockSchool = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school-result-templates'))`;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const num = (v: { toString(): string }) => Number(v.toString());
const optionsJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => (v ? (v as Prisma.InputJsonValue) : Prisma.DbNull);

export type Master = {
  id: string;
  name: string;
  description: string | null;
  layoutCode: string | null;
  layoutOptions: unknown;
  definition: Definition;
  version: number;
  archivedAt: Date | null;
};
const toMaster = (r: {
  id: string;
  name: string;
  description: string | null;
  layoutCode: string | null;
  layoutOptions: Prisma.JsonValue;
  definition: Prisma.JsonValue;
  version: number;
  archivedAt: Date | null;
}): Master => ({ ...r, definition: definitionSchema.parse(r.definition) });

const auditSchool = (
  tx: Tx,
  actorUserId: string,
  action: string,
  id: string,
  afterValue: Prisma.InputJsonValue,
  beforeValue?: Prisma.InputJsonValue,
) =>
  tx.auditLog.create({
    data: { actorUserId, action, targetType: "SchoolResultTemplate", targetId: id, afterValue, ...(beforeValue ? { beforeValue } : {}) },
  });

// ---- applying a master to one branch's row ----

export type ApplySummary = {
  scheme: "none" | "same" | "created" | "updated" | "new-version" | "kept";
  scale: "none" | "same" | "created" | "updated" | "new-version" | "kept";
  bandsChanged: boolean;
  traitsAdded: number;
  traitsArchived: number;
  nameKept: boolean;
};
type Ctx = { branchId: string; rowId: string; master: Master; actorUserId: string | null; strict: boolean };

/// A refusal in a sync is the branch's own state in the way (a name held by something the branch owns): strict throws it with the reason, lenient (seeding a new branch) skips that part.
function blocked(c: Ctx, message: string): undefined {
  if (c.strict) throw new ConflictError(message);
  return undefined;
}

async function applyScheme(tx: Tx, c: Ctx, summary: ApplySummary): Promise<string | null | undefined> {
  const def = c.master.definition.scheme;
  if (!def) return null;
  const { branchId } = c;
  await lockKey(tx, "assessment-scheme", branchId);
  const live = await tx.assessmentScheme.findFirst({
    where: { branchId, name: def.name, archivedAt: null },
    include: { components: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, scopes: { select: { id: true }, take: 1 } },
  });
  if (live && (!live.hosted || live.scopes.length > 0))
    return blocked(
      c,
      `This branch has its own marks scheme called "${def.name}", which a school template cannot change. Rename it, then update this branch again.`,
    );
  const wanted = def.components.map((x, sortOrder) => ({ name: x.name, maxScore: x.maxScore, sortOrder }));
  const same =
    live !== null &&
    num(live.totalMax) === def.totalMax &&
    num(live.examMax) === def.examMax &&
    live.components.length === wanted.length &&
    live.components.every((x, i) => x.name === wanted[i].name && num(x.maxScore) === wanted[i].maxScore);
  if (live && same) {
    summary.scheme = "same";
    return live.id;
  }
  const write = (schemeId: string) =>
    tx.assessmentComponent.createMany({
      data: wanted.map((x) => ({ branchId, schemeId, name: x.name, maxScore: x.maxScore, sortOrder: x.sortOrder })),
    });
  if (!live) {
    const created = await tx.assessmentScheme.create({
      data: { branchId, name: def.name, totalMax: def.totalMax, examMax: def.examMax, hosted: true },
    });
    await write(created.id);
    summary.scheme = "created";
    return created.id;
  }
  if (!live.lockedAt) {
    await tx.assessmentScheme.update({ where: { id: live.id }, data: { totalMax: def.totalMax, examMax: def.examMax } });
    await tx.assessmentComponent.deleteMany({ where: { schemeId: live.id } });
    await write(live.id);
    summary.scheme = "updated";
    return live.id;
  }
  const archived = await tx.assessmentScheme.updateMany({ where: { id: live.id, archivedAt: null }, data: { archivedAt: new Date() } });
  if (archived.count !== 1) throw new ConflictError("That marks scheme just changed. Try again.");
  const next = await tx.assessmentScheme.create({
    data: {
      branchId,
      hosted: true,
      name: def.name,
      totalMax: def.totalMax,
      examMax: def.examMax,
      version: live.version + 1,
      supersedesId: live.id,
    },
  });
  await write(next.id);
  summary.scheme = "new-version";
  return next.id;
}

async function applyScale(tx: Tx, c: Ctx, summary: ApplySummary): Promise<string | null | undefined> {
  const def = c.master.definition.scale;
  if (!def) return null;
  const { branchId } = c;
  await lockKey(tx, "grade-scale", branchId);
  const live = await tx.gradeScale.findFirst({
    where: { branchId, name: def.name, archivedAt: null },
    include: { bands: { orderBy: [{ minScore: "asc" }, { id: "asc" }] } },
  });
  if (live?.isDefault)
    return blocked(
      c,
      `This branch's default grade scale is called "${def.name}", which a school template cannot change. Rename it, then update this branch again.`,
    );
  const wanted = [...def.bands].sort((a, b) => a.min - b.min).map((b, sortOrder) => ({ ...b, sortOrder }));
  const same =
    live !== null &&
    live.bands.length === wanted.length &&
    live.bands.every(
      (b, i) =>
        num(b.minScore) === wanted[i].min &&
        num(b.maxScore) === wanted[i].max &&
        b.letter === wanted[i].letter &&
        b.remark === wanted[i].remark,
    );
  const write = (scaleId: string) =>
    tx.gradeBand.createMany({
      data: wanted.map((b) => ({
        branchId,
        scaleId,
        minScore: b.min,
        maxScore: b.max,
        letter: b.letter,
        remark: b.remark,
        sortOrder: b.sortOrder,
      })),
    });
  if (live && same) {
    summary.scale = "same";
    // Bands the master has confirmed school-wide clear the branch's notice; a master that still calls them a guess never re-flags a scale the branch confirmed.
    if (live.unconfirmed && !def.unconfirmed) await tx.gradeScale.update({ where: { id: live.id }, data: { unconfirmed: false } });
    return live.id;
  }
  summary.bandsChanged = live !== null;
  if (!live) {
    const created = await tx.gradeScale.create({ data: { branchId, name: def.name, isDefault: false, unconfirmed: def.unconfirmed } });
    await write(created.id);
    summary.scale = "created";
    return created.id;
  }
  if (!live.lockedAt) {
    await tx.gradeScale.update({ where: { id: live.id }, data: { unconfirmed: def.unconfirmed } });
    await tx.gradeBand.deleteMany({ where: { scaleId: live.id } });
    await write(live.id);
    summary.scale = "updated";
    return live.id;
  }
  const archived = await tx.gradeScale.updateMany({
    where: { id: live.id, archivedAt: null },
    data: { archivedAt: new Date(), isDefault: false },
  });
  if (archived.count !== 1) throw new ConflictError("That grade scale just changed. Try again.");
  const next = await tx.gradeScale.create({
    data: { branchId, name: def.name, isDefault: false, version: live.version + 1, supersedesId: live.id, unconfirmed: def.unconfirmed },
  });
  await write(next.id);
  summary.scale = "new-version";
  return next.id;
}

/// Trait groups and traits of the row, matched on their stable keys. A group or trait the branch made itself (no key) is left alone, except that one with the same title (or name) as the master's is
/// adopted instead of duplicated. What the master dropped is archived.
async function applyTraits(tx: Tx, c: Ctx, summary: ApplySummary) {
  const { branchId, rowId, master } = c;
  const groups = await tx.resultTemplateTraitGroup.findMany({
    where: { branchId, templateId: rowId },
    include: { traits: true },
    orderBy: { createdAt: "asc" },
  });
  const wantedGroupKeys = new Set(master.definition.groups.map((g) => g.key));
  for (const [gi, g] of master.definition.groups.entries()) {
    let group =
      groups.find((x) => x.schoolKey === g.key) ??
      groups.find((x) => x.schoolKey === null && x.title.toLowerCase() === g.title.toLowerCase());
    if (!group) {
      const made = await tx.resultTemplateTraitGroup.create({
        data: { branchId, templateId: rowId, title: g.title, sortOrder: gi, showSign: g.showSign, schoolKey: g.key },
        include: { traits: true },
      });
      groups.push(made);
      group = made;
    } else {
      await tx.resultTemplateTraitGroup.update({
        where: { id: group.id },
        data: { title: g.title, sortOrder: gi, showSign: g.showSign, schoolKey: g.key },
      });
    }
    const wantedTraitKeys = new Set(g.traits.map((t) => t.key));
    for (const [ti, t] of g.traits.entries()) {
      const found =
        group.traits.find((x) => x.schoolKey === t.key) ??
        group.traits.find((x) => x.schoolKey === null && x.archivedAt === null && x.name.toLowerCase() === t.name.toLowerCase());
      if (!found) {
        await tx.resultTemplateTrait.create({
          data: { branchId, templateId: rowId, groupId: group.id, name: t.name, sortOrder: ti, schoolKey: t.key },
        });
        summary.traitsAdded += 1;
      } else {
        await tx.resultTemplateTrait.update({
          where: { id: found.id },
          data: { name: t.name, sortOrder: ti, schoolKey: t.key, archivedAt: null },
        });
      }
    }
    // A trait of this group the master used to carry and no longer does.
    const dropped = group.traits.filter((x) => x.schoolKey !== null && !wantedTraitKeys.has(x.schoolKey) && x.archivedAt === null);
    if (dropped.length > 0) {
      await tx.resultTemplateTrait.updateMany({ where: { id: { in: dropped.map((x) => x.id) } }, data: { archivedAt: new Date() } });
      summary.traitsArchived += dropped.length;
    }
  }
  // A whole group the master dropped: its traits are archived (a group with no live trait is not printed). The rows stay, so no rating is orphaned.
  for (const g of groups) {
    if (g.schoolKey === null || wantedGroupKeys.has(g.schoolKey)) continue;
    const live = g.traits.filter((x) => x.archivedAt === null);
    if (live.length > 0) {
      await tx.resultTemplateTrait.updateMany({ where: { id: { in: live.map((x) => x.id) } }, data: { archivedAt: new Date() } });
      summary.traitsArchived += live.length;
    }
  }
}

/// Brings one row up to its master's current definition, in the caller's transaction (the caller holds the branch lock). Sets the row's version and clears "Customised here".
async function applyMaster(tx: Tx, c: Ctx): Promise<ApplySummary> {
  const summary: ApplySummary = { scheme: "none", scale: "none", bandsChanged: false, traitsAdded: 0, traitsArchived: 0, nameKept: false };
  const { master, rowId, branchId } = c;
  const schemeId = await applyScheme(tx, c, summary);
  const gradeScaleId = await applyScale(tx, c, summary);
  await applyTraits(tx, c, summary);
  const data: Prisma.ResultTemplateUncheckedUpdateInput = {
    description: master.description,
    layoutCode: master.layoutCode,
    layoutOptions: optionsJson(master.layoutOptions),
    schoolTemplateVersion: master.version,
    localEditedAt: null,
  };
  if (schemeId !== undefined) data.schemeId = schemeId;
  else summary.scheme = "kept";
  if (gradeScaleId !== undefined) data.gradeScaleId = gradeScaleId;
  else summary.scale = "kept";
  const row = await tx.resultTemplate.findUniqueOrThrow({ where: { id: rowId }, select: { name: true } });
  if (row.name !== master.name) {
    const taken = await tx.resultTemplate.findFirst({
      where: { branchId, archivedAt: null, id: { not: rowId }, name: { equals: master.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) summary.nameKept = true;
    else data.name = master.name;
  }
  await tx.resultTemplate.update({ where: { id: rowId }, data });
  return summary;
}

// ---- a row made from a master ----

/// A new row of the branch that follows the master, filled from its definition. In the caller's transaction, under the branch's template lock. Returns the row's id and what was applied.
export async function createRowFromMaster(
  tx: Tx,
  input: { master: Master; branchId: string; rowId?: string; actorUserId: string | null; strict: boolean },
) {
  const { master, branchId } = input;
  const created = await tx.resultTemplate.create({
    data: {
      ...(input.rowId ? { id: input.rowId } : {}),
      branchId,
      name: master.name,
      description: master.description,
      layoutCode: master.layoutCode,
      layoutOptions: optionsJson(master.layoutOptions),
      isDefault: false,
      schoolTemplateId: master.id,
      schoolTemplateVersion: master.version,
    },
    select: { id: true },
  });
  const summary = await applyMaster(tx, { branchId, rowId: created.id, master, actorUserId: input.actorUserId, strict: input.strict });
  return { id: created.id, summary };
}

/// The four printed cards' masters, made when the table has none of them (a school whose migration found no seeded rows). Idempotent: an existing id is skipped.
export async function ensureSchoolMasters(tx: Tx) {
  await tx.schoolResultTemplate.createMany({
    data: SCHOOL_SEEDS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      layoutCode: s.layoutCode,
      definition: s.definition as unknown as Prisma.InputJsonValue,
      version: 1,
    })),
    skipDuplicates: true,
  });
}

export async function liveSeedMasters(tx: Tx): Promise<Map<string, Master>> {
  await ensureSchoolMasters(tx);
  const rows = await tx.schoolResultTemplate.findMany({ where: { id: { in: SCHOOL_SEEDS.map((s) => s.id) }, archivedAt: null } });
  return new Map(rows.map((r) => [r.id, toMaster(r)]));
}

// ---- reading ----

const stateOf = (row: { schoolTemplateVersion: number | null; localEditedAt: Date | null }, version: number): RowState =>
  rowState(row, version);

export async function listSchoolTemplates(opts: { archived?: boolean } = {}) {
  const [masters, branches] = await Promise.all([
    prisma.schoolResultTemplate.findMany({
      where: opts.archived ? { archivedAt: { not: null } } : { archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        rows: {
          where: { archivedAt: null },
          select: {
            id: true,
            branchId: true,
            schoolTemplateVersion: true,
            localEditedAt: true,
            branch: { select: { name: true } },
            _count: { select: { classes: true } },
          },
          orderBy: { branch: { name: "asc" } },
        },
      },
    }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    branches,
    templates: masters.map((m) => {
      const followed = new Set(m.rows.map((r) => r.branchId));
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        layoutCode: m.layoutCode,
        layoutOptions: m.layoutOptions,
        definition: definitionSchema.parse(m.definition),
        version: m.version,
        archived: m.archivedAt !== null,
        branches: m.rows.map((r) => ({
          branchId: r.branchId,
          branchName: r.branch.name,
          templateId: r.id,
          version: r.schoolTemplateVersion,
          state: stateOf(r, m.version),
          classCount: r._count.classes,
        })),
        missingBranches: branches.filter((b) => !followed.has(b.id)),
      };
    }),
  };
}

export async function getSchoolTemplate(id: string) {
  const all = await listSchoolTemplates();
  const live = all.templates.find((t) => t.id === id);
  if (live) return { branches: all.branches, template: live };
  const archived = (await listSchoolTemplates({ archived: true })).templates.find((t) => t.id === id);
  return archived ? { branches: all.branches, template: archived } : null;
}

// ---- writing masters (superadmin) ----

function problemsOrThrow(def: Definition, others: readonly { name: string; definition: Definition }[]) {
  const problems = checkDefinition(def);
  if (problems.length > 0) throw new DomainError(problems.map((p) => p.message).join(" "));
  const clashes = sharedNameClashes(def, others);
  if (clashes.length > 0) throw new ConflictError(clashes.join(" "));
}
async function otherLiveMasters(tx: Tx, exceptId?: string) {
  const rows = await tx.schoolResultTemplate.findMany({
    where: { archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true, definition: true },
  });
  return rows.map((r) => ({ name: r.name, definition: definitionSchema.parse(r.definition) }));
}

export async function createSchoolTemplate(actorUserId: string, input: z.infer<typeof schoolTemplateInput>) {
  const name = cleanName(input.name);
  if (!name) throw new DomainError("Give the template a name of 1 to 60 characters.");
  try {
    return await prisma.$transaction(async (tx) => {
      await lockSchool(tx);
      problemsOrThrow(input.definition, await otherLiveMasters(tx));
      const created = await tx.schoolResultTemplate.create({
        data: {
          name,
          description: input.description || null,
          layoutCode: input.layoutCode ?? null,
          layoutOptions: optionsJson(input.layoutCode ? input.layoutOptions : null),
          definition: input.definition as Prisma.InputJsonValue,
          version: 1,
        },
        select: { id: true },
      });
      await auditSchool(tx, actorUserId, "SCHOOL_TEMPLATE_CREATED", created.id, {
        name,
        layoutCode: input.layoutCode ?? null,
        groups: input.definition.groups.length,
      });
      return { id: created.id };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("The school already has a template with that name.");
    throw error;
  }
}

/// Changes a master. Any change to the name, description, look or definition makes it version + 1 (the branches show "Behind" until they are updated); archiving and restoring do not. Rows that
/// follow an archived master keep working. Returns null for an id that is not a master.
export async function patchSchoolTemplate(actorUserId: string, id: string, patch: z.infer<typeof schoolTemplatePatch>) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockSchool(tx);
      const row = await tx.schoolResultTemplate.findUnique({ where: { id } });
      if (!row) return null;
      const master = toMaster(row);
      const wantsArchive = patch.archived === true;
      const wantsRestore = patch.archived === false;
      const contentKeys = ["name", "description", "layoutCode", "layoutOptions", "definition"] as const;
      const touchesContent = contentKeys.some((k) => patch[k] !== undefined);
      if (master.archivedAt && touchesContent && !wantsRestore)
        throw new ConflictError("That school template is archived. Restore it to change it.");
      const data: Prisma.SchoolResultTemplateUpdateInput = {};
      const before: Record<string, Prisma.InputJsonValue | null> = {};
      const after: Record<string, Prisma.InputJsonValue | null> = {};
      if (patch.name !== undefined) {
        const name = cleanName(patch.name);
        if (!name) throw new DomainError("Give the template a name of 1 to 60 characters.");
        if (name !== master.name) {
          data.name = name;
          before.name = master.name;
          after.name = name;
        }
      }
      if (patch.description !== undefined && (patch.description || null) !== master.description) {
        data.description = patch.description || null;
        before.description = master.description;
        after.description = (patch.description || null) as string | null;
      }
      const layoutCode = patch.layoutCode !== undefined ? patch.layoutCode : master.layoutCode;
      if (patch.layoutCode !== undefined && layoutCode !== master.layoutCode) {
        data.layoutCode = layoutCode;
        before.layoutCode = master.layoutCode;
        after.layoutCode = layoutCode;
      }
      if (patch.layoutOptions !== undefined || (patch.layoutCode !== undefined && layoutCode === null)) {
        const next = layoutCode ? (patch.layoutOptions ?? null) : null;
        if (JSON.stringify(next) !== JSON.stringify(master.layoutOptions ?? null)) {
          data.layoutOptions = optionsJson(next);
          before.layoutOptions = (master.layoutOptions ?? null) as Prisma.InputJsonValue | null;
          after.layoutOptions = next as Prisma.InputJsonValue | null;
        }
      }
      if (patch.definition !== undefined) {
        problemsOrThrow(patch.definition, await otherLiveMasters(tx, id));
        if (JSON.stringify(patch.definition) !== JSON.stringify(master.definition)) {
          data.definition = patch.definition as Prisma.InputJsonValue;
          before.definition = master.definition as unknown as Prisma.InputJsonValue;
          after.definition = patch.definition as unknown as Prisma.InputJsonValue;
        }
      }
      const changedContent = Object.keys(data).length > 0;
      if (changedContent) data.version = master.version + 1;
      if (wantsArchive && !master.archivedAt) data.archivedAt = new Date();
      if (wantsRestore && master.archivedAt) data.archivedAt = null;
      if (Object.keys(data).length === 0) return { id, changed: false, version: master.version };
      await tx.schoolResultTemplate.update({ where: { id }, data });
      if (changedContent)
        await auditSchool(
          tx,
          actorUserId,
          "SCHOOL_TEMPLATE_UPDATED",
          id,
          { ...after, version: master.version + 1 },
          { ...before, version: master.version },
        );
      if (wantsArchive && !master.archivedAt) await auditSchool(tx, actorUserId, "SCHOOL_TEMPLATE_ARCHIVED", id, { name: master.name });
      if (wantsRestore && master.archivedAt) await auditSchool(tx, actorUserId, "SCHOOL_TEMPLATE_RESTORED", id, { name: master.name });
      return { id, changed: true, version: changedContent ? master.version + 1 : master.version };
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError("The school already has a template with that name.");
    throw error;
  }
}

// ---- bringing branches up to a master (superadmin) ----

export type BranchOutcome =
  | { branchId: string; status: "ok"; summary: ApplySummary }
  | { branchId: string; status: "up-to-date" }
  | { branchId: string; status: "skipped-customised" }
  | { branchId: string; status: "not-following" }
  | { branchId: string; status: "gone" }
  | { branchId: string; status: "failed"; reason: string };

const failure = (error: unknown): string =>
  error instanceof ConflictError || error instanceof DomainError ? error.message : "Something went wrong. This branch was not changed.";

/// "Update branches": applies the master's current definition to each chosen branch's live row that follows it. Each branch is its own transaction and is reported. A row marked Customised here is
/// skipped unless its branch is in `replaceLocal`; a row already at the master's version and not customised is "up-to-date". Null for an id that is not a master.
export async function syncSchoolTemplate(
  actorUserId: string,
  id: string,
  input: { branchIds: readonly string[]; replaceLocal?: readonly string[] },
) {
  const found = await prisma.schoolResultTemplate.findUnique({ where: { id } });
  if (!found) return null;
  if (found.archivedAt) throw new ConflictError("That school template is archived. Restore it before updating branches.");
  const replace = new Set(input.replaceLocal ?? []);
  const outcomes: BranchOutcome[] = [];
  for (const branchId of [...new Set(input.branchIds)]) {
    try {
      outcomes.push(
        await prisma.$transaction(async (tx): Promise<BranchOutcome> => {
          if (!(await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) return { branchId, status: "gone" };
          await lockBranchTemplates(tx, branchId);
          const master = toMaster(await tx.schoolResultTemplate.findUniqueOrThrow({ where: { id } }));
          if (master.archivedAt) throw new ConflictError("That school template is archived. Restore it before updating branches.");
          const row = await tx.resultTemplate.findFirst({
            where: { branchId, schoolTemplateId: id, archivedAt: null },
            select: { id: true, schoolTemplateVersion: true, localEditedAt: true },
          });
          if (!row) return { branchId, status: "not-following" };
          const customised = row.localEditedAt !== null;
          if (customised && !replace.has(branchId)) return { branchId, status: "skipped-customised" };
          if (!customised && (row.schoolTemplateVersion ?? 0) >= master.version) return { branchId, status: "up-to-date" };
          const summary = await applyMaster(tx, { branchId, rowId: row.id, master, actorUserId, strict: true });
          await tx.auditLog.create({
            data: {
              actorUserId,
              action: "SCHOOL_TEMPLATE_SYNCED",
              targetType: "ResultTemplate",
              targetId: row.id,
              beforeValue: { version: row.schoolTemplateVersion, customised },
              afterValue: { branchId, schoolTemplateId: id, version: master.version, replacedLocalChanges: customised, ...summary },
            },
          });
          return { branchId, status: "ok", summary };
        }),
      );
    } catch (error) {
      outcomes.push({ branchId, status: "failed", reason: failure(error) });
    }
  }
  return outcomes;
}

export type AddOutcome =
  | { branchId: string; status: "added"; templateId: string; summary: ApplySummary }
  | { branchId: string; status: "already" }
  | { branchId: string; status: "clash" }
  | { branchId: string; status: "gone" }
  | { branchId: string; status: "failed"; reason: string };

/// "Add to branches": gives each chosen branch its own row that follows the master. Skips a branch that already has one (`already`) or whose live template has the master's name and is the
/// branch's own (`clash`: rename or detach it first). Each branch is its own transaction and is reported. Null for an id that is not a master.
export async function addSchoolTemplateToBranches(actorUserId: string, id: string, branchIds: readonly string[]) {
  const found = await prisma.schoolResultTemplate.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!found) return null;
  if (found.archivedAt) throw new ConflictError("That school template is archived. Restore it before adding it to branches.");
  const outcomes: AddOutcome[] = [];
  for (const branchId of [...new Set(branchIds)]) {
    try {
      outcomes.push(
        await prisma.$transaction(async (tx): Promise<AddOutcome> => {
          if (!(await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) return { branchId, status: "gone" };
          await lockBranchTemplates(tx, branchId);
          const master = toMaster(await tx.schoolResultTemplate.findUniqueOrThrow({ where: { id } }));
          if (await tx.resultTemplate.findFirst({ where: { branchId, schoolTemplateId: id, archivedAt: null }, select: { id: true } }))
            return { branchId, status: "already" };
          if (
            await tx.resultTemplate.findFirst({
              where: { branchId, archivedAt: null, name: { equals: master.name, mode: "insensitive" } },
              select: { id: true },
            })
          )
            return { branchId, status: "clash" };
          const made = await createRowFromMaster(tx, { master, branchId, actorUserId, strict: true });
          await tx.auditLog.create({
            data: {
              actorUserId,
              action: "SCHOOL_TEMPLATE_ADDED",
              targetType: "ResultTemplate",
              targetId: made.id,
              afterValue: { branchId, schoolTemplateId: id, version: master.version, name: master.name },
            },
          });
          return { branchId, status: "added", templateId: made.id, summary: made.summary };
        }),
      );
    } catch (error) {
      outcomes.push({ branchId, status: "failed", reason: failure(error) });
    }
  }
  return outcomes;
}

// ---- a branch administrator ----

/// A branch administrator stops a template following its school template: it becomes an ordinary template of the branch (nothing is copied or removed; class assignments, scheme, scale and
/// traits stay as they are, and later updates of the master no longer reach it). The route has checked the caller administers the row's branch. Null for an id that is not a template.
export async function detachTemplate(actorUserId: string, templateId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.resultTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, branchId: true, schoolTemplateId: true, schoolTemplateVersion: true, schoolTemplate: { select: { name: true } } },
    });
    if (!row) return null;
    await lockBranchTemplates(tx, row.branchId);
    if (!row.schoolTemplateId) throw new ConflictError("This template does not follow a school template.");
    await tx.resultTemplate.update({
      where: { id: templateId },
      data: { schoolTemplateId: null, schoolTemplateVersion: null, localEditedAt: null },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "TEMPLATE_DETACHED",
        targetType: "ResultTemplate",
        targetId: templateId,
        beforeValue: { schoolTemplateId: row.schoolTemplateId, version: row.schoolTemplateVersion, name: row.schoolTemplate?.name ?? null },
        afterValue: { branchId: row.branchId },
      },
    });
    return { id: templateId };
  });
}
