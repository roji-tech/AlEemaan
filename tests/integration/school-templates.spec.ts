import { test, expect } from "@playwright/test";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { lockScale, lockScheme } from "@/lib/academics/assessment";
import { ConflictError } from "@/lib/academics/structure";
import { DomainError } from "@/lib/academics/sessions";
import { ensureReportTemplates } from "@/lib/results/seed-branch";
import { SCHOOL_SEEDS } from "@/lib/results/school-seeds";
import type { Definition } from "@/lib/results/school-templates-rules";
import {
  addSchoolTemplateToBranches,
  createSchoolTemplate,
  detachTemplate,
  listSchoolTemplates,
  patchSchoolTemplate,
  syncSchoolTemplate,
} from "@/lib/results/school-templates";
import { updateTemplate } from "@/lib/results/templates";

// School-wide result templates (task 0120), the service called in-process against the test database: seeding from the masters, "Update branches", the Customised-here rule, versioning once a
// scheme or scale is locked, traits archived and never deleted, "Add to branches", detach and the rules for what a master may hold. The routes' permissions are in tests/api/school-templates.spec.ts.

const JUNIOR = SCHOOL_SEEDS.find((s) => s.key === "junior")!;
const BASIC = SCHOOL_SEEDS.find((s) => s.key === "basic")!;
let actor: string;
let branches: { id: string; name: string }[];

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  actor = (await createUser({ name: "School Boss", superAdmin: true })).id;
  branches = await db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
});

const rowOf = (branchId: string, masterId: string) =>
  db.resultTemplate.findFirstOrThrow({ where: { branchId, schoolTemplateId: masterId, archivedAt: null } });
const seededJunior = async (branchId: string) => {
  await ensureReportTemplates(branchId);
  return rowOf(branchId, JUNIOR.id);
};
const withScale = (def: Definition, bands: NonNullable<Definition["scale"]>["bands"]): Definition => ({
  ...def,
  scale: { ...def.scale!, bands },
});
const BANDS_V2 = [
  { min: 0, max: 45, letter: "E", remark: "Fair" },
  { min: 45, max: 60, letter: "C", remark: "Average" },
  { min: 60, max: 75, letter: "B", remark: "Good" },
  { min: 75, max: 100, letter: "A", remark: "Excellent" },
];

const custom = (name: string): Parameters<typeof createSchoolTemplate>[1] => ({
  name,
  description: "A card of our own",
  layoutCode: "BASIC",
  definition: {
    scheme: { name: `${name} marks`, totalMax: 100, examMax: 70, components: [{ name: "Test", maxScore: 30 }] },
    scale: {
      name: `${name} scale`,
      unconfirmed: false,
      bands: [
        { min: 0, max: 50, letter: "F", remark: "Fail" },
        { min: 50, max: 100, letter: "P", remark: "Pass" },
      ],
    },
    groups: [{ key: "conduct", title: "Conduct", showSign: false, traits: [{ key: "manners", name: "Manners" }] }],
  },
});

test.describe("seeding a branch from the masters", () => {
  test("a new branch gets the four cards as rows that follow their masters, with keys, scheme and scale", async () => {
    await ensureReportTemplates(branches[0].id);
    const rows = await db.resultTemplate.findMany({ where: { branchId: branches[0].id, isDefault: false } });
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.schoolTemplateId).toBeTruthy();
      expect(row.schoolTemplateVersion).toBe(1);
      expect(row.localEditedAt).toBeNull();
      expect(row.schemeId).toBeTruthy();
      expect(row.gradeScaleId).toBeTruthy();
    }
    const traits = await db.resultTemplateTrait.findMany({ where: { branchId: branches[0].id } });
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every((t) => t.schoolKey !== null)).toBe(true);
    const junior = await db.gradeScale.findUniqueOrThrow({ where: { id: (await rowOf(branches[0].id, JUNIOR.id)).gradeScaleId! } });
    expect(junior.unconfirmed).toBe(true); // the master's flag
    // Seeding again changes nothing.
    await ensureReportTemplates(branches[0].id);
    expect(await db.resultTemplate.count({ where: { branchId: branches[0].id, isDefault: false } })).toBe(4);
  });

  test("a branch made after a master was edited starts on the edited card", async () => {
    const master = await db.schoolResultTemplate.findUniqueOrThrow({ where: { id: JUNIOR.id } }).catch(() => null);
    expect(master).toBeNull(); // an empty database has no masters until a branch is seeded
    await ensureReportTemplates(branches[0].id); // makes the four masters
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: withScale(JUNIOR.definition, BANDS_V2) });
    await ensureReportTemplates(branches[1].id);
    const scale = await db.gradeScale.findUniqueOrThrow({
      where: { id: (await rowOf(branches[1].id, JUNIOR.id)).gradeScaleId! },
      include: { bands: { orderBy: { minScore: "asc" } } },
    });
    expect(scale.bands.map((b) => Number(b.maxScore))).toEqual([45, 60, 75, 100]);
    expect((await rowOf(branches[1].id, JUNIOR.id)).schoolTemplateVersion).toBe(2);
  });
});

test.describe("Update branches", () => {
  test("applies a new version to every branch that follows it: look, trait, bands; class assignments are untouched", async () => {
    const [b1, b2] = branches;
    const row1 = await seededJunior(b1.id);
    await seededJunior(b2.id);
    const group = await db.classGroup.create({ data: { branchId: b1.id, name: "JSS 1", sortOrder: 1 } });
    await db.resultTemplateClass.create({ data: { branchId: b1.id, templateId: row1.id, classGroupId: group.id } });

    const def = withScale(JUNIOR.definition, BANDS_V2);
    def.groups[0].traits.push({ key: "tidiness", name: "Tidiness" });
    const patched = await patchSchoolTemplate(actor, JUNIOR.id, { definition: def, description: "Junior card, 2027" });
    expect(patched).toMatchObject({ changed: true, version: 2 });

    const outcomes = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id, b2.id] }))!;
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "ok"]);
    const after = await rowOf(b1.id, JUNIOR.id);
    expect(after.schoolTemplateVersion).toBe(2);
    expect(after.description).toBe("Junior card, 2027");
    const scale = await db.gradeScale.findUniqueOrThrow({
      where: { id: after.gradeScaleId! },
      include: { bands: { orderBy: { minScore: "asc" } } },
    });
    expect(scale.bands.map((b) => Number(b.maxScore))).toEqual([45, 60, 75, 100]);
    expect(await db.resultTemplateTrait.count({ where: { templateId: after.id, name: "Tidiness", archivedAt: null } })).toBe(1);
    // The class is still where it was.
    expect(await db.resultTemplateClass.count({ where: { templateId: after.id, classGroupId: group.id } })).toBe(1);
    // Audited, once per branch.
    expect(await db.auditLog.count({ where: { action: "SCHOOL_TEMPLATE_SYNCED", targetId: after.id } })).toBe(1);
    // A second update with nothing new is "up-to-date".
    const again = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] }))!;
    expect(again[0].status).toBe("up-to-date");
  });

  test("a row customised in the branch is skipped unless its branch is chosen for replacement", async () => {
    const [b1, b2] = branches;
    const row1 = await seededJunior(b1.id);
    await seededJunior(b2.id);
    await updateTemplate(actor, row1.id, { description: "Our own words" }); // a branch administrator's edit
    expect((await rowOf(b1.id, JUNIOR.id)).localEditedAt).not.toBeNull();
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: withScale(JUNIOR.definition, BANDS_V2) });

    const first = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id, b2.id] }))!;
    expect(first.map((o) => [o.branchId, o.status])).toEqual([
      [b1.id, "skipped-customised"],
      [b2.id, "ok"],
    ]);
    expect((await rowOf(b1.id, JUNIOR.id)).description).toBe("Our own words");
    const replaced = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id], replaceLocal: [b1.id] }))!;
    expect(replaced[0].status).toBe("ok");
    const row = await rowOf(b1.id, JUNIOR.id);
    expect(row.description).toBe(JUNIOR.description);
    expect(row.localEditedAt).toBeNull();
    expect(row.schoolTemplateVersion).toBe(2);
  });

  test("once a result locks a scheme, a sync makes a NEW VERSION: the predecessor is archived and keeps its marks", async () => {
    const [b1] = branches;
    const { id } = await createSchoolTemplate(actor, custom("Locked card"));
    await addSchoolTemplateToBranches(actor, id, [b1.id]);
    const row = await rowOf(b1.id, id);
    const oldSchemeId = row.schemeId!;
    await db.$transaction((tx) => lockScheme(tx, oldSchemeId));
    const def: Definition = JSON.parse(JSON.stringify(custom("Locked card").definition));
    def.scheme = { ...def.scheme!, examMax: 60, components: [{ name: "Test", maxScore: 40 }] };
    await patchSchoolTemplate(actor, id, { definition: def });
    const [outcome] = (await syncSchoolTemplate(actor, id, { branchIds: [b1.id] }))!;
    expect(outcome.status === "ok" && outcome.summary.scheme).toBe("new-version");
    const after = await rowOf(b1.id, id);
    expect(after.schemeId).not.toBe(oldSchemeId);
    const old = await db.assessmentScheme.findUniqueOrThrow({ where: { id: oldSchemeId }, include: { components: true } });
    expect(old.archivedAt).not.toBeNull();
    expect(Number(old.examMax)).toBe(70); // what the old results were entered under
    expect(old.components.map((c) => Number(c.maxScore))).toEqual([30]);
    expect(await db.assessmentScheme.findUniqueOrThrow({ where: { id: after.schemeId! } })).toMatchObject({
      version: old.version + 1,
      supersedesId: oldSchemeId,
      hosted: true,
    });
  });

  test("a changed grade scale on a locked scale: new version, old one archived and unchanged, the row points at the new one", async () => {
    const [b1] = branches;
    const row = await seededJunior(b1.id);
    const oldScaleId = row.gradeScaleId!;
    await db.$transaction((tx) => lockScale(tx, oldScaleId));
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: withScale(JUNIOR.definition, BANDS_V2) });
    const [outcome] = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] }))!;
    expect(outcome.status).toBe("ok");
    const after = await rowOf(b1.id, JUNIOR.id);
    expect(after.gradeScaleId).not.toBe(oldScaleId);
    const old = await db.gradeScale.findUniqueOrThrow({ where: { id: oldScaleId }, include: { bands: { orderBy: { minScore: "asc" } } } });
    expect(old.archivedAt).not.toBeNull();
    expect(old.bands.map((b) => Number(b.maxScore))).toEqual([50, 60, 70, 100]); // what the old results were graded on
    const next = await db.gradeScale.findUniqueOrThrow({ where: { id: after.gradeScaleId! } });
    expect(next).toMatchObject({ version: old.version + 1, supersedesId: oldScaleId, isDefault: false });
  });

  test("a trait the master dropped is archived, not deleted; the same key coming back is un-archived", async () => {
    const [b1] = branches;
    const row = await seededJunior(b1.id);
    const def: Definition = JSON.parse(JSON.stringify(JUNIOR.definition));
    const dropped = def.groups[0].traits.pop()!;
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: def });
    await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] });
    const trait = await db.resultTemplateTrait.findFirstOrThrow({ where: { templateId: row.id, name: dropped.name } });
    expect(trait.archivedAt).not.toBeNull();
    def.groups[0].traits.push(dropped);
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: def });
    await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] });
    expect((await db.resultTemplateTrait.findUniqueOrThrow({ where: { id: trait.id } })).archivedAt).toBeNull();
  });

  test("a renamed trait keeps its row (and so its ratings): matched on the key", async () => {
    const [b1] = branches;
    const row = await seededJunior(b1.id);
    const def: Definition = JSON.parse(JSON.stringify(JUNIOR.definition));
    const first = def.groups[0].traits[0];
    const before = await db.resultTemplateTrait.findFirstOrThrow({ where: { templateId: row.id, schoolKey: first.key } });
    first.name = "Attentiveness in lessons";
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: def });
    await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] });
    const after = await db.resultTemplateTrait.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.name).toBe("Attentiveness in lessons");
    expect(after.archivedAt).toBeNull();
  });

  test("a branch that does not follow the master, one that is gone, and an archived master are reported or refused", async () => {
    const [b1, b2] = branches;
    await seededJunior(b1.id);
    const outcomes = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id, b2.id, "no-such-branch"] }))!;
    expect(outcomes.map((o) => o.status)).toEqual(["up-to-date", "not-following", "gone"]);
    await patchSchoolTemplate(actor, JUNIOR.id, { archived: true });
    await expect(syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] })).rejects.toBeInstanceOf(ConflictError);
    expect(await syncSchoolTemplate(actor, "no-such-master", { branchIds: [b1.id] })).toBeNull();
  });

  test("a scale name the branch's own DEFAULT scale holds is refused for that branch only, and that branch is not half-changed", async () => {
    const [b1, b2] = branches;
    await seededJunior(b1.id);
    await seededJunior(b2.id);
    await db.gradeScale.create({ data: { branchId: b2.id, name: "Renamed junior scale", isDefault: true } });
    const def = withScale(JUNIOR.definition, BANDS_V2);
    def.scale = { ...def.scale!, name: "Renamed junior scale" };
    await patchSchoolTemplate(actor, JUNIOR.id, { definition: def });
    const outcomes = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id, b2.id] }))!;
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "failed"]);
    const failed = outcomes[1];
    expect(failed.status === "failed" && failed.reason).toMatch(/default grade scale/);
    expect((await rowOf(b2.id, JUNIOR.id)).schoolTemplateVersion).toBe(1);
  });
});

test.describe("Add to branches, detach, and what a master may hold", () => {
  test("adds a master to branches: added, already, clash with a branch's own name, gone", async () => {
    const [b1, b2, b3] = branches;
    const { id } = await createSchoolTemplate(actor, custom("Evening class card"));
    await db.resultTemplate.create({ data: { branchId: b2.id, name: "evening class card" } }); // the branch's own, same name ignoring case
    const first = (await addSchoolTemplateToBranches(actor, id, [b1.id, b2.id, "no-such-branch"]))!;
    expect(first.map((o) => o.status)).toEqual(["added", "clash", "gone"]);
    const row = await rowOf(b1.id, id);
    expect(row).toMatchObject({ name: "Evening class card", layoutCode: "BASIC", schoolTemplateVersion: 1 });
    expect(await db.resultTemplateTrait.count({ where: { templateId: row.id, schoolKey: "manners" } })).toBe(1);
    expect((await addSchoolTemplateToBranches(actor, id, [b1.id, b3.id]))!.map((o) => o.status)).toEqual(["already", "added"]);
  });

  test("detach: the row becomes the branch's own and a later sync does not reach it", async () => {
    const [b1] = branches;
    const row = await seededJunior(b1.id);
    expect(await detachTemplate(actor, row.id)).toEqual({ id: row.id });
    const after = await db.resultTemplate.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ schoolTemplateId: null, schoolTemplateVersion: null, localEditedAt: null });
    expect(await db.auditLog.count({ where: { action: "TEMPLATE_DETACHED", targetId: row.id } })).toBe(1);
    await expect(detachTemplate(actor, row.id)).rejects.toBeInstanceOf(ConflictError); // follows nothing now
    expect(await detachTemplate(actor, "no-such-template")).toBeNull();
    const [outcome] = (await syncSchoolTemplate(actor, JUNIOR.id, { branchIds: [b1.id] }))!;
    expect(outcome.status).toBe("not-following");
  });

  test("a master must be valid: bands, marks, duplicate keys; a name is unique; a scheme or scale NAME stands for one structure", async () => {
    await ensureReportTemplates(branches[0].id); // the four masters
    const bad = custom("Bad bands");
    bad.definition.scale!.bands = [{ min: 0, max: 40, letter: "F", remark: "Fail" }]; // does not reach 100
    await expect(createSchoolTemplate(actor, bad)).rejects.toBeInstanceOf(DomainError);
    const marks = custom("Bad marks");
    marks.definition.scheme!.components = [{ name: "Test", maxScore: 10 }]; // 10 + 70 is not 100
    await expect(createSchoolTemplate(actor, marks)).rejects.toBeInstanceOf(DomainError);
    const keys = custom("Dup keys");
    keys.definition.groups[0].traits.push({ key: "manners", name: "Politeness" });
    await expect(createSchoolTemplate(actor, keys)).rejects.toBeInstanceOf(DomainError);
    await createSchoolTemplate(actor, custom("Unique card"));
    await expect(createSchoolTemplate(actor, custom("UNIQUE CARD"))).rejects.toBeInstanceOf(ConflictError);
    // Editing the shared marks scheme of ONE of the four seeded cards (the others keep the old marks under the same name) is refused with a way out.
    const def: Definition = JSON.parse(JSON.stringify(BASIC.definition));
    def.scheme!.examMax = 70;
    def.scheme!.components = [{ name: "Continuous assessment", maxScore: 30 }];
    await expect(patchSchoolTemplate(actor, BASIC.id, { definition: def })).rejects.toThrow(/Give this one another name/);
    def.scheme!.name = "Report card marks (CA 30 + exam 70)";
    await expect(patchSchoolTemplate(actor, BASIC.id, { definition: def })).resolves.toMatchObject({ changed: true, version: 2 });
  });

  test("listing: each master with its branches and their state; branches without it", async () => {
    const [b1, b2] = branches;
    const row = await seededJunior(b1.id);
    await updateTemplate(actor, row.id, { description: "Local words" });
    await patchSchoolTemplate(actor, JUNIOR.id, { description: "School words" });
    const all = await listSchoolTemplates();
    const junior = all.templates.find((t) => t.id === JUNIOR.id)!;
    expect(junior.version).toBe(2);
    expect(junior.branches).toHaveLength(1);
    expect(junior.branches[0]).toMatchObject({ branchId: b1.id, state: "customised-behind", classCount: 0 });
    expect(junior.missingBranches.map((b) => b.id)).toContain(b2.id);
  });
});
