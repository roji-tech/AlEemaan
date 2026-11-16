import { expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "./db";
import { api, cookieHeader, loginAs } from "./http";
import { resultsWorld } from "./results-world";

// A branch with ONE published Mathematics result for one pupil (task 0072: the portal's report card), the school profile filled in, the pupil's guardian phone set and, optionally, the two
// remarks written. The pupil signs in to the portal with `ADMISSION_NO` and `PUPIL_SECRET` (the date of birth); the guardian with the same number and `GUARDIAN_PHONE`.

const SHEETS = "/api/v1/academics/result-sheets";
const TRANSITION = "/api/v1/academics/results/transition";
export const GUARDIAN_PHONE = "+2348011110042";
export const PUPIL_SECRET = "2012-05-01";
export const SCHOOL = {
  name: "Test Demonstration School",
  principal: "Mrs Principal",
  motto: "Faith and knowledge",
  address: "12 Example Road",
  phone: "0803 000 0001",
};
export const REMARKS = { teacher: "Works hard.", principal: "Keep it up." };

export const asRole = async (role: Role, branchId: string): Promise<{ cookie: string }> => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { cookie: cookieHeader((await loginAs(user)).token!) };
};

export async function publishedWorld(options: { remarks?: boolean } = {}) {
  await resetDatabase();
  const home = await seedInstance();
  await db.schoolSettings.upsert({ where: { id: "global" }, update: SCHOOL, create: { id: "global", ...SCHOOL } });
  const w = await resultsWorld(home.id);
  await db.studentRecord.update({ where: { id: w.student.id }, data: { guardianPhone: GUARDIAN_PHONE, guardianName: "A Guardian" } });
  const a = await asRole(Role.ADMIN, home.id);
  const b = await asRole(Role.ADMIN, home.id);
  const entries = [{ studentId: w.student.id, parts: { "Test 1": 15, "Test 2": 10 }, exam: 40 }];
  const put = await api(SHEETS, {
    method: "PUT",
    cookie: a.cookie,
    body: { periodId: w.period.id, classArmId: w.arm.id, subjectId: w.subject.id, entries },
  });
  expect(put.status).toBe(200);
  const ids = (await db.result.findMany({ where: { subjectId: w.subject.id, periodId: w.period.id } })).map((r) => r.id);
  for (const [who, action] of [
    [a, "submit"],
    [b, "approve"],
    [b, "publish"],
  ] as const)
    expect((await api(TRANSITION, { method: "POST", cookie: who.cookie, body: { action, resultIds: ids } })).status).toBe(200);
  if (options.remarks !== false) {
    const author = await createUser();
    await db.reportRemark.create({
      data: {
        branchId: home.id,
        studentId: w.student.id,
        periodId: w.period.id,
        teacherRemark: REMARKS.teacher,
        principalRemark: REMARKS.principal,
        updatedByUserId: author.id,
      },
    });
  }
  return { home, w };
}
