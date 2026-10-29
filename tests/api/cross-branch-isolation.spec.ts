import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A signed-in person must not read or change another branch's coursework, announcements, timetable, messages or promotion batches by changing the branchId
// (found by the browser security run, 2026-10-19: these routes only checked "a role in SOME branch"). Each route family is probed as a teacher or administrator of
// the HOME branch against a real record in ANOTHER branch, and against their own branch as the control.

let home: { id: string };
let other: { id: string };
let otherIds: { assignment: string; material: string; quiz: string; template: string; slot: string; announcement: string };

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
  const subject = await db.subject.create({ data: { branchId: other.id, name: "Maths" } });
  const group = await db.classGroup.create({ data: { branchId: other.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: other.id, classGroupId: group.id, name: "A" } });
  const staff = await db.staffRecord.create({ data: { branchId: other.id, firstName: "Ola", lastName: "Other", category: "TEACHING" } });
  const author = await createUser({ superAdmin: false });
  otherIds = {
    assignment: (await db.assignment.create({ data: { branchId: other.id, subjectId: subject.id, title: "Secret homework" } })).id,
    material: (await db.learningMaterial.create({ data: { branchId: other.id, subjectId: subject.id, title: "Secret notes" } })).id,
    quiz: (await db.quiz.create({ data: { branchId: other.id, subjectId: subject.id, title: "Secret quiz" } })).id,
    template: (
      await db.notificationTemplate.create({
        data: { branchId: other.id, code: "T1", name: "Secret template", channel: "SMS", bodyTemplate: "Hi" },
      })
    ).id,
    slot: (
      await db.timetableSlot.create({
        data: {
          branchId: other.id,
          classArmId: arm.id,
          subjectId: subject.id,
          staffRecordId: staff.id,
          dayOfWeek: 1,
          startTime: "08:00",
          endTime: "09:00",
        },
      })
    ).id,
    announcement: (
      await db.announcement.create({
        data: { branchId: other.id, title: "Secret news", body: "Only for the other branch", authorUserId: author.id },
      })
    ).id,
  };
});

const as = async (role: Role) => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test("a teacher of one branch gets nothing of another branch's coursework, announcements or timetable", async () => {
  const t = await as(Role.TEACHING_STAFF);
  const o = other.id;
  const reads = [
    `/api/v1/lms/assignments?branchId=${o}`,
    `/api/v1/lms/assignments/${otherIds.assignment}?branchId=${o}`,
    `/api/v1/lms/materials?branchId=${o}`,
    `/api/v1/lms/materials/${otherIds.material}?branchId=${o}`,
    `/api/v1/lms/quizzes?branchId=${o}`,
    `/api/v1/lms/quizzes/${otherIds.quiz}?branchId=${o}`,
    `/api/v1/announcements?branchId=${o}`,
    `/api/v1/timetable?branchId=${o}`,
    `/api/v1/timetable/${otherIds.slot}?branchId=${o}`,
    `/api/v1/communication/templates?branchId=${o}`,
    `/api/v1/communication/templates/${otherIds.template}?branchId=${o}`,
  ];
  for (const url of reads) {
    const res = await api(url, { cookie: t.cookie });
    expect(res.status, url).toBe(404);
    expect(JSON.stringify(res.json), url).not.toMatch(/Secret/);
  }
  // Changing or deleting another branch's records is refused too, and nothing changes.
  const patch = await api(`/api/v1/lms/assignments/${otherIds.assignment}`, {
    method: "PATCH",
    cookie: t.cookie,
    body: { branchId: o, title: "Hacked" },
  });
  expect([403, 404]).toContain(patch.status);
  const del = await api(`/api/v1/lms/materials/${otherIds.material}?branchId=${o}`, { method: "DELETE", cookie: t.cookie });
  expect([403, 404]).toContain(del.status);
  const make = await api("/api/v1/lms/assignments", {
    method: "POST",
    cookie: t.cookie,
    body: { branchId: o, subjectId: "x", title: "Planted" },
  });
  expect(make.status).toBe(403);
  expect((await db.assignment.findUniqueOrThrow({ where: { id: otherIds.assignment } })).title).toBe("Secret homework");
  expect(await db.learningMaterial.count({ where: { id: otherIds.material } })).toBe(1);
  expect(await db.assignment.count({ where: { title: "Planted" } })).toBe(0);
});

test("their own branch still works (the control)", async () => {
  const t = await as(Role.TEACHING_STAFF);
  for (const url of [
    `/api/v1/lms/assignments?branchId=${home.id}`,
    `/api/v1/lms/materials?branchId=${home.id}`,
    `/api/v1/lms/quizzes?branchId=${home.id}`,
    `/api/v1/timetable?branchId=${home.id}`,
    `/api/v1/announcements?branchId=${home.id}`,
  ]) {
    expect((await api(url, { cookie: t.cookie })).status, url).toBe(200);
  }
});

test("an administrator of one branch cannot message, template or promote in another branch", async () => {
  const a = await as(Role.ADMIN);
  const o = other.id;
  for (const url of [
    `/api/v1/communication/dispatches?branchId=${o}`,
    `/api/v1/communication/templates?branchId=${o}`,
    `/api/v1/academics/promotion/batches?branchId=${o}`,
    `/api/v1/academics/promotion/preview?branchId=${o}`,
  ]) {
    expect((await api(url, { cookie: a.cookie })).status, url).toBe(404);
  }
  const broadcast = await api("/api/v1/communication/broadcast", {
    method: "POST",
    cookie: a.cookie,
    body: { branchId: o, channel: "SMS", body: "Hello" },
  });
  expect(broadcast.status).toBe(403);
  const rename = await api(`/api/v1/communication/templates/${otherIds.template}`, {
    method: "PATCH",
    cookie: a.cookie,
    body: { branchId: o, name: "Hacked" },
  });
  expect([403, 404]).toContain(rename.status);
  expect((await db.notificationTemplate.findUniqueOrThrow({ where: { id: otherIds.template } })).name).toBe("Secret template");
  // Their own branch is fine.
  expect((await api(`/api/v1/communication/templates?branchId=${home.id}`, { cookie: a.cookie })).status).toBe(200);
  expect((await api(`/api/v1/academics/promotion/batches?branchId=${home.id}`, { cookie: a.cookie })).status).toBe(200);
});

test("the academic sessions list shows a teacher only their own branches", async () => {
  const mk = (branchId: string, name: string) =>
    db.academicSession.create({ data: { branchId, label: name, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01") } });
  await mk(home.id, "Home 2026");
  await mk(other.id, "Other 2026");
  const t = await as(Role.TEACHING_STAFF);

  const all = await api("/api/v1/academics/sessions", { cookie: t.cookie });
  expect(all.status).toBe(200);
  expect(all.json.data.sessions.map((s: { label: string }) => s.label)).toEqual(["Home 2026"]);
  expect((await api(`/api/v1/academics/sessions?branchId=${other.id}`, { cookie: t.cookie })).status).toBe(404);
});
