import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// How many pupils have handed an assignment in is the teacher's to see (task 0069). The list route sent `_count.submissions` to everyone, so a pupil's or a guardian's session
// learned how many classmates had handed in.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});

const signedIn = async (role: Role) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role } });
  return cookieHeader((await loginAs(user)).token!);
};

test("a teacher's list carries the number of hand-ins; a pupil's and a guardian's list does not", async () => {
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const essay = await db.assignment.create({ data: { branchId: home.id, subjectId: subject.id, title: "Essay", status: "PUBLISHED" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
    },
  });
  await db.assignmentSubmission.create({
    data: { branchId: home.id, assignmentId: essay.id, studentId: pupil.id, content: "done", status: "SUBMITTED" },
  });

  const list = async (cookie: string) =>
    (await api(`/api/v1/lms/assignments?branchId=${home.id}`, { cookie })).json.data as Record<string, unknown>[];

  const asTeacher = await list(await signedIn(Role.TEACHING_STAFF));
  expect(asTeacher).toHaveLength(1);
  expect(asTeacher[0]!._count).toEqual({ submissions: 1 });

  for (const role of [Role.STUDENT, Role.PARENT]) {
    const seen = await list(await signedIn(role));
    expect(seen, String(role)).toHaveLength(1);
    expect(Object.keys(seen[0]!), String(role)).not.toContain("_count");
  }
});
