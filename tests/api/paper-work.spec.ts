import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const PUPIL_1_DOB = "2013-05-10";
const PUPIL_2_DOB = "2014-06-15";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let otherBranch: { id: string };
let teacher1: TestUser;
let teacher1Cookie: string;
let otherTeacher: TestUser;
let otherTeacherCookie: string;
let student1: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };
let group1: { id: string };
let group2: { id: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  otherBranch = await db.branch.findFirstOrThrow({
    where: { id: { not: home.id } },
    orderBy: { name: "asc" },
  });

  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });

  group1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group1.id, name: "Gold" } });

  group2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2" } });
  const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group2.id, name: "Silver" } });

  // Student 1 in JSS 1 (Gold)
  const s1 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Hafsat",
      lastName: "Aliyu",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student1 = { id: s1.id, admissionNo: s1.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s1.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm1.id,
      status: "ACTIVE",
    },
  });

  // Student 2 in JSS 2 (Silver)
  const s2 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ibrahim",
      lastName: "Sanusi",
      gender: Gender.MALE,
      dateOfBirth: new Date("2014-06-15"),
      admissionNo: "2026/0002",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student2 = { id: s2.id, admissionNo: s2.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s2.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 2",
      arm: "Silver",
      classArmId: arm2.id,
      status: "ACTIVE",
    },
  });

  // Staff users
  teacher1 = await createUser({
    name: "Aisha Staff",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const t1Login = await loginAs(teacher1);
  expect(t1Login.status).toBe(200);
  teacher1Cookie = cookieHeader(t1Login.token!);

  otherTeacher = await createUser({
    name: "Usman Other",
    superAdmin: false,
  });
  await db.membership.create({
    data: { userId: otherTeacher.id, branchId: otherBranch.id, role: Role.TEACHING_STAFF },
  });
  const otLogin = await loginAs(otherTeacher);
  expect(otLogin.status).toBe(200);
  otherTeacherCookie = cookieHeader(otLogin.token!);
});

test("teacher creates paper work and system auto-provisions roll call for enrolled pupils", async () => {
  // 1. Create paper work targeting JSS 1
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "PAPER_WORK",
      branchId: home.id,
      title: "Week 4 Physics Lab Practical Sheet",
      instructions: "Print and fill handwritten measurements, hand in by Friday.",
      classGroupIds: [group1.id],
      opensAt: "2026-11-01T08:00:00Z",
      closesAt: "2026-11-07T16:00:00Z",
      maxDurationMinutes: 120,
    },
  });

  expect(createRes.status).toBe(201);
  expect(createRes.json.data.kind).toBe("PAPER_WORK");
  expect(createRes.json.data.rosterCount).toBe(1); // Only Student 1 is in JSS 1
  const formId = createRes.json.data.id;

  // 2. Teacher lists paper work in branch
  const listRes = await api(`/api/v1/forms?branchId=${home.id}&kind=PAPER_WORK`, {
    cookie: teacher1Cookie,
  });
  expect(listRes.status).toBe(200);
  expect(listRes.json.data.forms.length).toBe(1);
  const found = listRes.json.data.forms[0];
  expect(found.title).toBe("Week 4 Physics Lab Practical Sheet");
  expect(found.summary.totalStudents).toBe(1);
  expect(found.summary.pendingCount).toBe(1);
  expect(found.summary.handedInCount).toBe(0);
  expect(found.summary.completionRate).toBe(0);

  // 3. Teacher inspects roll call turn-ins
  const rollCallRes = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(rollCallRes.status).toBe(200);
  expect(rollCallRes.json.data.turnIns.length).toBe(1);
  const turnIn = rollCallRes.json.data.turnIns[0];
  expect(turnIn.studentId).toBe(student1.id);
  expect(turnIn.status).toBe("PENDING");
  expect(turnIn.student.firstName).toBe("Hafsat");
});

test("teacher marks single and batch roll call turn-ins with deadline tracking and audits", async () => {
  // Create past-deadline paper work to verify automatic LATE status
  const pastDeadline = new Date(Date.now() - 3600000).toISOString();
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "PAPER_WORK",
      branchId: home.id,
      title: "Overdue Chemistry Worksheet",
      classGroupIds: [group1.id],
      closesAt: pastDeadline,
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.id;

  // Single update: Teacher records submission as HANDED_IN
  // Because deadline is past, determineTurnInStatus turns it into LATE
  const updateRes = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    method: "PATCH",
    cookie: teacher1Cookie,
    body: {
      studentId: student1.id,
      status: "HANDED_IN",
      note: "Handed in physically to teacher desk",
    },
  });
  expect(updateRes.status).toBe(200);
  expect(updateRes.json.data.status).toBe("LATE");
  expect(updateRes.json.data.note).toBe("Handed in physically to teacher desk");
  expect(updateRes.json.data.markedById).toBe(teacher1.id);

  // Verify append-only audit was created in database
  const audit = await db.formTurnInAudit.findFirst({
    where: {
      branchId: home.id,
      formId,
      studentId: student1.id,
      action: "STATUS_UPDATED",
    },
    orderBy: { createdAt: "desc" },
  });
  expect(audit).not.toBeNull();
  expect(audit?.status).toBe("LATE");
  expect(audit?.action).toBe("STATUS_UPDATED");

  // Batch update: Reset back to PENDING
  const batchRes = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    method: "PATCH",
    cookie: teacher1Cookie,
    body: {
      updates: [
        {
          studentId: student1.id,
          status: "PENDING",
          note: "Reset for re-submission",
        },
      ],
    },
  });
  expect(batchRes.status).toBe(200);
  expect(batchRes.json.data.updatedCount).toBe(1);

  // Check roll call after batch reset
  const rollCallRes = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(rollCallRes.json.data.turnIns[0].status).toBe("PENDING");
  expect(rollCallRes.json.data.summary.pendingCount).toBe(1);
});

test("pupil discovers assigned paper work in portal and submits marking request", async () => {
  // Create open paper work for JSS 1
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "PAPER_WORK",
      branchId: home.id,
      title: "Mathematics Geometry Constructions",
      classGroupIds: [group1.id],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.id;

  // 1. Pupil 1 (JSS 1) logs in to portal and lists paper work
  const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
  const p1ListRes = await api(`/api/v1/portal/students/${student1.id}/forms/paper-work`, {
    headers: { cookie: p1Cookie },
  });
  expect(p1ListRes.status).toBe(200);
  expect(p1ListRes.json.data.forms.length).toBe(1);
  expect(p1ListRes.json.data.forms[0].id).toBe(formId);
  expect(p1ListRes.json.data.forms[0].myTurnIn.status).toBe("PENDING");
  expect(p1ListRes.json.data.forms[0].myTurnIn.requestedAt).toBeNull();

  // 2. Pupil 2 (JSS 2) logs in and sees nothing (class group scoping)
  const p2Cookie = await portalCookie(student2.admissionNo, PUPIL_2_DOB);
  const p2ListRes = await api(`/api/v1/portal/students/${student2.id}/forms/paper-work`, {
    headers: { cookie: p2Cookie },
  });
  expect(p2ListRes.status).toBe(200);
  expect(p2ListRes.json.data.forms.length).toBe(0);

  // 3. Pupil 1 gets details of single paper work
  const p1GetRes = await api(`/api/v1/portal/students/${student1.id}/forms/paper-work/${formId}`, {
    headers: { cookie: p1Cookie },
  });
  expect(p1GetRes.status).toBe(200);
  expect(p1GetRes.json.data.title).toBe("Mathematics Geometry Constructions");

  // 4. Pupil 1 taps "Request marking"
  const reqMarkingRes = await api(
    `/api/v1/portal/students/${student1.id}/forms/paper-work/${formId}/request-marking`,
    {
      method: "POST",
      headers: { cookie: p1Cookie },
    }
  );
  expect(reqMarkingRes.status).toBe(200);
  expect(reqMarkingRes.json.data.requestedAt).not.toBeNull();

  // 5. Teacher checks roll call and sees requested marking counter
  const rollCallRes = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(rollCallRes.json.data.summary.requestedMarkingCount).toBe(1);
  expect(rollCallRes.json.data.turnIns[0].requestedAt).not.toBeNull();
});

test("teacher closes paper work and cross-branch isolation refuses unauthorized access", async () => {
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "PAPER_WORK",
      branchId: home.id,
      title: "History Project Essay",
      classGroupIds: [group1.id],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.id;

  // Cross-branch check: Teacher of other branch cannot view or modify roll call
  const crossGet = await api(`/api/v1/forms/${formId}/turn-ins?branchId=${home.id}`, {
    cookie: otherTeacherCookie,
  });
  expect(crossGet.status).toBe(404); // ADR 0014: query branch returns 404

  const crossPatch = await api(`/api/v1/forms/${formId}/turn-ins`, {
    method: "PATCH",
    cookie: otherTeacherCookie,
    body: {
      branchId: home.id,
      studentId: student1.id,
      status: "HANDED_IN",
    },
  });
  expect(crossPatch.status).toBe(403); // ADR 0014: body branch returns 403

  // Close form
  const closeRes = await api(`/api/v1/forms/${formId}/close?branchId=${home.id}`, {
    method: "POST",
    cookie: teacher1Cookie,
  });
  expect(closeRes.status).toBe(200);

  // Pupil cannot request marking on a closed form
  const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
  const failRequest = await api(
    `/api/v1/portal/students/${student1.id}/forms/paper-work/${formId}/request-marking`,
    {
      method: "POST",
      headers: { cookie: p1Cookie },
    }
  );
  expect(failRequest.status).toBe(400);
  expect(failRequest.json.error.message).toContain("closed by the teacher");
});
