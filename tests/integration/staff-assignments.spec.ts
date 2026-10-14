import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";

// Staff records and teaching assignments, Slice P1c (migration 20261014110000): the database keeps a record's account link inside the record's branch, links one
// account to one record, keeps live emails unique per branch, refuses malformed values - and an assignment's staff, subject and arm to one branch.

let home: { id: string };
let other: { id: string };
// These specs leave classes, subjects and staff behind; a later spec (the Academics screen) expects an empty branch, so leave the database as found.
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const rejects = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};
const staff = (branchId: string, over: Record<string, unknown> = {}) =>
  db.staffRecord.create({ data: { branchId, category: "TEACHING", firstName: "Amina", lastName: "Yusuf", ...over } });

test.describe("the record", () => {
  test("an account can be linked only if the person is a member of THE SAME branch, and only once", async () => {
    const user = await createUser();
    await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.TEACHING_STAFF } });
    await rejects(staff(other.id, { userId: user.id })); // member of home, not of other
    const mine = await staff(home.id, { userId: user.id });
    expect(mine.userId).toBe(user.id);
    await rejects(staff(home.id, { userId: user.id, firstName: "Second" })); // one account, one record
    const free = await staff(home.id, { firstName: "Guard", category: "NON_TEACHING" }); // no account at all is fine
    expect(free.userId).toBeNull();
  });

  test("live emails are unique per branch, ignoring case; an archived record frees its address; another branch may reuse it", async () => {
    const first = await staff(home.id, { email: "amina@example.com" });
    await rejects(staff(home.id, { email: "amina@example.com", firstName: "Dup" }));
    await staff(other.id, { email: "amina@example.com" });
    await db.staffRecord.update({ where: { id: first.id }, data: { archivedAt: new Date() } });
    await staff(home.id, { email: "amina@example.com", firstName: "Again" });
  });

  test("blank names, a shouting or malformed email and a junk phone are refused", async () => {
    await rejects(staff(home.id, { firstName: "   " }));
    await rejects(staff(home.id, { lastName: "x".repeat(81) }));
    await rejects(staff(home.id, { email: "Upper@Example.com" })); // stored lower-cased; the service lower-cases first
    await rejects(staff(home.id, { email: "no-at-sign" }));
    await rejects(staff(home.id, { phone: "call me" }));
    await staff(home.id, { phone: "+234 801 234 5678", email: "ok@example.com" });
  });
});

test.describe("assignments", () => {
  const world = async (branchId: string) => {
    const group = await db.classGroup.create({ data: { branchId, name: `JSS ${Math.random()}` } });
    const arm = await db.classArm.create({ data: { branchId, classGroupId: group.id, name: "A" } });
    const subject = await db.subject.create({ data: { branchId, name: `Maths ${Math.random()}` } });
    return { arm, subject };
  };

  test("staff, subject and arm must all be of the assignment's branch; the same triple twice is refused", async () => {
    const here = await world(home.id);
    const there = await world(other.id);
    const person = await staff(home.id);
    const data = { branchId: home.id, staffRecordId: person.id, subjectId: here.subject.id, classArmId: here.arm.id };
    await db.staffSubjectAssignment.create({ data });
    await rejects(db.staffSubjectAssignment.create({ data })); // duplicate triple
    await rejects(db.staffSubjectAssignment.create({ data: { ...data, subjectId: there.subject.id } }));
    await rejects(db.staffSubjectAssignment.create({ data: { ...data, classArmId: there.arm.id } }));
    const stranger = await staff(other.id);
    await rejects(db.staffSubjectAssignment.create({ data: { ...data, staffRecordId: stranger.id } }));
  });

  test("a record that has assignments cannot be deleted out from under them", async () => {
    const here = await world(home.id);
    const person = await staff(home.id);
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: person.id, subjectId: here.subject.id, classArmId: here.arm.id },
    });
    await rejects(db.staffRecord.delete({ where: { id: person.id } }));
  });
});
