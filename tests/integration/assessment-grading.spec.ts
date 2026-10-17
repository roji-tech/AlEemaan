import { test, expect } from "@playwright/test";
import { db, resetDatabase, seedInstance } from "../support/db";

// Assessment schemes and grade scales, Slice P1b (migration 20261014100000): the database keeps a child in its parent's branch, keeps ONE live default per
// branch, refuses impossible numbers - and once a scheme or scale is LOCKED (a result uses it, Slice P2) refuses every change to it and its children, whichever
// code writes, so history cannot be rewritten even by a service with a bug.

let home: { id: string };
let other: { id: string };
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const rejects = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};
const scheme = (branchId: string, over: Record<string, unknown> = {}) =>
  db.assessmentScheme.create({ data: { branchId, name: `Scheme ${Math.random()}`, totalMax: 100, examMax: 60, ...over } });
const scale = (branchId: string, over: Record<string, unknown> = {}) =>
  db.gradeScale.create({ data: { branchId, name: `Scale ${Math.random()}`, ...over } });

test.describe("keys and numbers", () => {
  test("a component, a band and a scheme's class cannot point at another branch's parent", async () => {
    const theirs = await scheme(other.id);
    await rejects(
      db.assessmentComponent.create({ data: { branchId: home.id, schemeId: theirs.id, name: "Test 1", maxScore: 10, sortOrder: 0 } }),
    );
    const theirScale = await scale(other.id);
    await rejects(
      db.gradeBand.create({
        data: { branchId: home.id, scaleId: theirScale.id, minScore: 0, maxScore: 100, letter: "A", remark: "Top", sortOrder: 0 },
      }),
    );
    const theirClass = await db.classGroup.create({ data: { branchId: other.id, name: "JSS 1" } });
    await rejects(scheme(home.id, { classGroupId: theirClass.id }));
  });

  test("impossible numbers and blank names are refused", async () => {
    await rejects(scheme(home.id, { examMax: 120 })); // the exam cannot be worth more than the total
    await rejects(scheme(home.id, { totalMax: 0, examMax: 0 }));
    await rejects(scheme(home.id, { name: "   " }));
    const s = await scheme(home.id);
    await rejects(db.assessmentComponent.create({ data: { branchId: home.id, schemeId: s.id, name: "X", maxScore: 0, sortOrder: 0 } }));
    const sc = await scale(home.id);
    await rejects(
      db.gradeBand.create({
        data: { branchId: home.id, scaleId: sc.id, minScore: 50, maxScore: 50, letter: "A", remark: "x", sortOrder: 0 },
      }),
    );
    await rejects(
      db.gradeBand.create({
        data: { branchId: home.id, scaleId: sc.id, minScore: 0, maxScore: 101, letter: "A", remark: "x", sortOrder: 0 },
      }),
    );
  });
});

test.describe("one live default", () => {
  test("one live scheme per scope (the branch default, or one class), unique live names; archiving frees both; other branches are independent", async () => {
    const first = await scheme(home.id, { name: "Default" });
    await rejects(scheme(home.id, { name: "Another default" })); // second live default scope
    await scheme(other.id, { name: "Default" }); // another branch is its own world
    const cls = await db.classGroup.create({ data: { branchId: home.id, name: "SS 1" } });
    await scheme(home.id, { name: "SS 1 scheme", classGroupId: cls.id });
    await rejects(
      scheme(home.id, { name: "Default", classGroupId: (await db.classGroup.create({ data: { branchId: home.id, name: "SS 2" } })).id }),
    ); // live name taken
    await db.assessmentScheme.update({ where: { id: first.id }, data: { archivedAt: new Date() } });
    await scheme(home.id, { name: "Default" });
  });

  test("exactly one live default grade scale per branch; a unique live name; archiving frees them", async () => {
    const a = await scale(home.id, { name: "WAEC", isDefault: true });
    await rejects(scale(home.id, { name: "Other", isDefault: true }));
    await scale(home.id, { name: "Other" }); // not default: fine
    await rejects(scale(home.id, { name: "waec" }).then(() => scale(home.id, { name: "WAEC" }))); // a live name is unique
    await scale(other.id, { name: "WAEC", isDefault: true });
    await db.gradeScale.update({ where: { id: a.id }, data: { archivedAt: new Date(), isDefault: false } });
    await scale(home.id, { name: "New default", isDefault: true });
  });
});

test.describe("locked means locked", () => {
  test("a locked scheme keeps its name, totals and components; only archiving may change; an unlocked one is free to edit", async () => {
    const s = await scheme(home.id, { name: "Primary", examMax: 60 });
    const c = await db.assessmentComponent.create({
      data: { branchId: home.id, schemeId: s.id, name: "Test 1", maxScore: 40, sortOrder: 0 },
    });
    await db.assessmentScheme.update({ where: { id: s.id }, data: { name: "Primary v1" } }); // unlocked: fine
    await db.assessmentScheme.update({ where: { id: s.id }, data: { lockedAt: new Date() } });
    await rejects(db.assessmentScheme.update({ where: { id: s.id }, data: { name: "Changed" } }));
    await rejects(db.assessmentScheme.update({ where: { id: s.id }, data: { examMax: 50 } }));
    await rejects(db.assessmentScheme.update({ where: { id: s.id }, data: { lockedAt: null } })); // a lock is never cleared
    await rejects(db.assessmentComponent.update({ where: { id: c.id }, data: { maxScore: 30 } }));
    await rejects(db.assessmentComponent.delete({ where: { id: c.id } }));
    await rejects(
      db.assessmentComponent.create({ data: { branchId: home.id, schemeId: s.id, name: "Test 2", maxScore: 10, sortOrder: 1 } }),
    );
    await db.assessmentScheme.update({ where: { id: s.id }, data: { archivedAt: new Date() } }); // archiving a locked scheme is allowed
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: s.id } })).name).toBe("Primary v1");
  });

  test("a locked grade scale keeps its name and bands; only archiving / un-defaulting may change", async () => {
    const sc = await scale(home.id, { name: "WAEC", isDefault: true });
    const b = await db.gradeBand.create({
      data: { branchId: home.id, scaleId: sc.id, minScore: 0, maxScore: 100, letter: "A", remark: "Top", sortOrder: 0 },
    });
    await db.gradeScale.update({ where: { id: sc.id }, data: { lockedAt: new Date() } });
    await rejects(db.gradeScale.update({ where: { id: sc.id }, data: { name: "Changed" } }));
    await rejects(db.gradeBand.update({ where: { id: b.id }, data: { letter: "B" } }));
    await rejects(db.gradeBand.delete({ where: { id: b.id } }));
    await rejects(
      db.gradeBand.create({
        data: { branchId: home.id, scaleId: sc.id, minScore: 0, maxScore: 50, letter: "C", remark: "x", sortOrder: 1 },
      }),
    );
    await db.gradeScale.update({ where: { id: sc.id }, data: { isDefault: false } }); // the default flag is not history
  });
});
