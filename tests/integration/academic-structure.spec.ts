import { test, expect } from "@playwright/test";
import { db, resetDatabase, seedInstance } from "../support/db";

// Academic structure, Slice P1a: the database itself keeps a child in its parent's branch and keeps live names unique. (The test of the migration's backfill of
// className / arm strings was removed with the migration history, task 0051.)

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
