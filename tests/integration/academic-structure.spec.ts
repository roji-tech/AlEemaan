import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { db, resetDatabase, seedInstance } from "../support/db";

// Academic structure, Slice P1a (migration 20261014090000): the database itself keeps a child in its parent's branch, keeps live names unique, and the
// backfill turns the className / arm strings of existing enrolments into real classes and arms - idempotently, on legacy-shaped rows.

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261014090000_academic_structure/migration.sql");
const backfill = () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const part = sql.slice(sql.indexOf("-- ===== Part 3"));
  return part
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
};

let home: { id: string };
let other: { id: string };
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const group = (branchId: string, name: string) => db.classGroup.create({ data: { branchId, name } });
const rejects = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};

test.describe("the keys", () => {
  test("an arm, a subject offering and an enrolment cannot point at another branch's parent", async () => {
    const mine = await group(home.id, "JSS 1");
    const theirs = await group(other.id, "JSS 1");
    await rejects(db.classArm.create({ data: { branchId: home.id, classGroupId: theirs.id, name: "A" } }));
    const subject = await db.subject.create({ data: { branchId: other.id, name: "Mathematics" } });
    await rejects(db.subjectOffering.create({ data: { branchId: home.id, classGroupId: mine.id, subjectId: subject.id } }));
    const arm = await db.classArm.create({ data: { branchId: other.id, classGroupId: theirs.id, name: "A" } });
    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "A",
        lastName: "B",
        gender: "MALE",
        dateOfBirth: new Date("2015-01-01"),
        admissionNo: "2026/K0001",
      },
    });
    const session = await db.academicSession.create({
      data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01") },
    });
    await rejects(
      db.studentEnrollment.create({
        data: { studentId: student.id, branchId: home.id, sessionId: session.id, className: "JSS 1", classArmId: arm.id },
      }),
    );
  });
});

test.describe("names and checks", () => {
  test("a live class / arm / subject name is unique ignoring case, an archived one frees it, and the same name in another branch is fine", async () => {
    const jss = await group(home.id, "JSS 1");
    await rejects(group(home.id, "jss 1"));
    await group(other.id, "JSS 1");
    await db.classGroup.update({ where: { id: jss.id }, data: { archivedAt: new Date() } });
    await group(home.id, "jss 1");

    const g = await group(home.id, "SS 1");
    const a = await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "A" } });
    await rejects(db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "a" } }));
    await db.classArm.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
    await db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "a" } });

    await db.subject.create({ data: { branchId: home.id, name: "Mathematics", code: "MTH" } });
    await rejects(db.subject.create({ data: { branchId: home.id, name: "Maths 2", code: "MTH" } }));
    await rejects(db.subject.create({ data: { branchId: home.id, name: "mathematics" } }));
    await db.subject.create({ data: { branchId: other.id, name: "Mathematics", code: "MTH" } });
  });

  test("blank names, a non-positive capacity and a lower-case code are refused", async () => {
    const g = await group(home.id, "JSS 2");
    await rejects(group(home.id, "   "));
    await rejects(db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: " " } }));
    await rejects(db.classArm.create({ data: { branchId: home.id, classGroupId: g.id, name: "B", capacity: 0 } }));
    await rejects(db.subject.create({ data: { branchId: home.id, name: "Art", code: "art" } }));
  });
});

test.describe("the backfill", () => {
  const legacy = async (branchId: string, sessionId: string, n: number, className: string, arm: string | null) => {
    const student = await db.studentRecord.create({
      data: {
        branchId,
        firstName: "S",
        lastName: `${n}`,
        gender: "FEMALE",
        dateOfBirth: new Date("2015-01-01"),
        admissionNo: `2026/L${n}${Math.random()}`,
      },
    });
    return db.studentEnrollment.create({ data: { studentId: student.id, branchId, sessionId, className, arm } });
  };
  const run = async () => {
    for (const statement of backfill()) await db.$executeRawUnsafe(statement);
  };

  test("one class per distinct (branch, name ignoring case), one arm per (class, arm) with 'Main' for none, every enrolment linked, a blank class ignored - and a second run changes nothing", async () => {
    const session = await db.academicSession.create({
      data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01") },
    });
    const otherSession = await db.academicSession.create({
      data: { branchId: other.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01") },
    });
    expect(backfill().length).toBeGreaterThanOrEqual(3); // the parser found the statements (one that finds none would pass vacuously)
    const e1 = await legacy(home.id, session.id, 1, "JSS 1", "A");
    const e2 = await legacy(home.id, session.id, 2, "jss 1 ", "a");
    const e3 = await legacy(home.id, session.id, 3, "JSS 1", "B");
    const e4 = await legacy(home.id, session.id, 4, "SS 2", null);
    const e5 = await legacy(other.id, otherSession.id, 5, "JSS 1", "A");
    const blank = await legacy(home.id, session.id, 6, "  ", null);

    await run();
    const groups = await db.classGroup.findMany({ orderBy: [{ branchId: "asc" }, { name: "asc" }] });
    expect(groups.map((g) => `${g.branchId === home.id ? "home" : "other"}:${g.name}`).sort()).toEqual([
      "home:JSS 1",
      "home:SS 2",
      "other:JSS 1",
    ]);
    const arms = await db.classArm.findMany({ include: { classGroup: true } });
    expect(arms.map((a) => `${a.classGroup.name}/${a.name.toUpperCase()}/${a.branchId === home.id ? "home" : "other"}`).sort()).toEqual([
      "JSS 1/A/home",
      "JSS 1/A/other",
      "JSS 1/B/home",
      "SS 2/MAIN/home",
    ]);
    const linked = async (id: string) =>
      (await db.studentEnrollment.findUniqueOrThrow({ where: { id }, include: { classArm: { include: { classGroup: true } } } })).classArm;
    expect([(await linked(e1.id))?.id, (await linked(e2.id))?.id]).toEqual([(await linked(e1.id))?.id, (await linked(e1.id))?.id]); // same arm
    expect((await linked(e3.id))?.name).toBe("B");
    expect((await linked(e1.id))?.classGroup.name).toBe("JSS 1"); // the most frequent spelling names the class (JSS 1 twice, "jss 1" once)
    expect((await linked(e4.id))?.name).toBe("Main");
    expect((await linked(e5.id))?.branchId).toBe(other.id); // linked within ITS branch
    expect(await linked(blank.id)).toBeNull();
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: e1.id } })).className).toBe("JSS 1"); // the strings are untouched

    const before = [await db.classGroup.count(), await db.classArm.count()];
    await run();
    expect([await db.classGroup.count(), await db.classArm.count()]).toEqual(before);
  });
});
