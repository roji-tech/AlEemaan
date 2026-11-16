import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Coursework states (task 0066): a study material has a type and a draft state, an assignment can be closed, and the people who may read each state are fixed by the
// server: a draft material, a draft or archived assignment never reach a pupil or a guardian; a closed assignment does, and refuses a hand-in.

let home: { id: string };
let ids: { subject: string; pupil: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: "+2348011110001",
    },
  });
  await db.studentEnrollment.create({
    data: {
      studentId: pupil.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  ids = { subject: subject.id, pupil: pupil.id };
});

const signedIn = async (role: Role) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role } });
  return cookieHeader((await loginAs(user)).token!);
};

const portalCookie = async () => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo: "2026/0001", secret: "2013-05-10" } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

const material = (title: string, extra: Record<string, unknown> = {}) =>
  db.learningMaterial.create({ data: { branchId: home.id, subjectId: ids.subject, title, ...extra } });
const assignment = (title: string, status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED") =>
  db.assignment.create({ data: { branchId: home.id, subjectId: ids.subject, title, status } });

test.describe("study materials", () => {
  test("a new material is a published document unless the request says otherwise; a draft with a type is stored as sent", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const plain = await api("/api/v1/lms/materials", {
      method: "POST",
      cookie: teacher,
      body: { branchId: home.id, subjectId: ids.subject, title: "Plain" },
    });
    expect(plain.status).toBe(201);
    expect(plain.json.data.status).toBe("PUBLISHED");
    expect(plain.json.data.materialType).toBe("DOCUMENT");

    const draft = await api("/api/v1/lms/materials", {
      method: "POST",
      cookie: teacher,
      body: { branchId: home.id, subjectId: ids.subject, title: "Recording", materialType: "VIDEO_LINK", status: "DRAFT" },
    });
    expect(draft.status).toBe(201);
    const row = await db.learningMaterial.findFirstOrThrow({ where: { title: "Recording" } });
    expect(row.status).toBe("DRAFT");
    expect(row.materialType).toBe("VIDEO_LINK");

    const bad = await api("/api/v1/lms/materials", {
      method: "POST",
      cookie: teacher,
      body: { branchId: home.id, subjectId: ids.subject, title: "Bad", materialType: "SPREADSHEET" },
    });
    expect(bad.status).toBe(400);
  });

  test("staff see drafts; a pupil's or guardian's membership does not (list and single read); publishing makes it visible", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const pupil = await signedIn(Role.STUDENT);
    const guardian = await signedIn(Role.PARENT);
    await material("Out", { status: "PUBLISHED" });
    const draft = await material("Not yet", { status: "DRAFT" });

    const titles = async (cookie: string) =>
      ((await api(`/api/v1/lms/materials?branchId=${home.id}`, { cookie })).json.data as { title: string }[]).map((m) => m.title).sort();
    expect(await titles(teacher)).toEqual(["Not yet", "Out"]);
    expect(await titles(pupil)).toEqual(["Out"]);
    expect(await titles(guardian)).toEqual(["Out"]);

    expect((await api(`/api/v1/lms/materials/${draft.id}?branchId=${home.id}`, { cookie: teacher })).status).toBe(200);
    expect((await api(`/api/v1/lms/materials/${draft.id}?branchId=${home.id}`, { cookie: pupil })).status).toBe(404);
    expect((await api(`/api/v1/lms/materials/${draft.id}?branchId=${home.id}`, { cookie: guardian })).status).toBe(404);

    const publish = await api(`/api/v1/lms/materials/${draft.id}`, {
      method: "PATCH",
      cookie: teacher,
      body: { branchId: home.id, status: "PUBLISHED" },
    });
    expect(publish.status).toBe(200);
    expect(await titles(pupil)).toEqual(["Not yet", "Out"]);
  });

  test("the portal lists a published material to the pupil and never a draft", async () => {
    await material("Out", { status: "PUBLISHED" });
    await material("Not yet", { status: "DRAFT" });
    const cookie = await portalCookie();
    const lms = await api(`/api/v1/portal/students/${ids.pupil}/lms`, { cookie });
    expect(lms.status).toBe(200);
    expect(lms.json.data.materials.map((m: { title: string }) => m.title)).toEqual(["Out"]);
  });

  test("an edit changes the fields it sends: type, title and the link are replaced, the status stays", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const row = await material("Notes", {
      status: "DRAFT",
      materialType: "NOTES",
      attachments: [{ title: "Notes", url: "https://school.example/a.pdf" }],
    });
    const res = await api(`/api/v1/lms/materials/${row.id}`, {
      method: "PATCH",
      cookie: teacher,
      body: {
        branchId: home.id,
        title: "Notes, week 2",
        materialType: "PRESENTATION",
        attachments: [{ title: "Notes, week 2", url: "https://school.example/b.pdf" }],
      },
    });
    expect(res.status).toBe(200);
    const after = await db.learningMaterial.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.title).toBe("Notes, week 2");
    expect(after.materialType).toBe("PRESENTATION");
    expect(after.status).toBe("DRAFT");
    expect(after.attachments).toEqual([{ title: "Notes, week 2", url: "https://school.example/b.pdf" }]);
  });
});

test.describe("assignments", () => {
  test("a pupil's or guardian's membership lists published and closed assignments, never a draft or an archived one; staff list all (and filter by status)", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const pupil = await signedIn(Role.STUDENT);
    const guardian = await signedIn(Role.PARENT);
    await assignment("Open", "PUBLISHED");
    await assignment("Shut", "CLOSED");
    await assignment("Draft", "DRAFT");
    await assignment("Old", "ARCHIVED");

    const titles = async (cookie: string, query = "") =>
      ((await api(`/api/v1/lms/assignments?branchId=${home.id}${query}`, { cookie })).json.data as { title: string }[])
        .map((a) => a.title)
        .sort();
    expect(await titles(teacher)).toEqual(["Draft", "Old", "Open", "Shut"]);
    expect(await titles(teacher, "&status=CLOSED")).toEqual(["Shut"]);
    expect(await titles(pupil)).toEqual(["Open", "Shut"]);
    expect(await titles(guardian)).toEqual(["Open", "Shut"]);
    // asking for drafts does not widen what a pupil gets
    expect(await titles(pupil, "&status=DRAFT")).toEqual(["Open", "Shut"]);
  });

  test("single read: a closed assignment is readable by a pupil, a draft and an archived one are not", async () => {
    const pupil = await signedIn(Role.STUDENT);
    const shut = await assignment("Shut", "CLOSED");
    const draft = await assignment("Draft", "DRAFT");
    const old = await assignment("Old", "ARCHIVED");
    const read = (id: string) => api(`/api/v1/lms/assignments/${id}?branchId=${home.id}`, { cookie: pupil });
    expect((await read(shut.id)).status).toBe(200);
    expect((await read(draft.id)).status).toBe(404);
    expect((await read(old.id)).status).toBe(404);
  });

  test("a teacher moves an assignment through the states: publish, close, reopen, archive, restore", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const row = await assignment("Essay", "DRAFT");
    for (const status of ["PUBLISHED", "CLOSED", "PUBLISHED", "ARCHIVED", "DRAFT"] as const) {
      const res = await api(`/api/v1/lms/assignments/${row.id}`, { method: "PATCH", cookie: teacher, body: { branchId: home.id, status } });
      expect(res.status, status).toBe(200);
      expect((await db.assignment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
    }
    const bad = await api(`/api/v1/lms/assignments/${row.id}`, {
      method: "PATCH",
      cookie: teacher,
      body: { branchId: home.id, status: "FINISHED" },
    });
    expect(bad.status).toBe(400);
  });

  test("a hand-in to a closed or a draft assignment is refused (the staff route and the portal), a published one is taken", async () => {
    const teacher = await signedIn(Role.TEACHING_STAFF);
    const shut = await assignment("Shut", "CLOSED");
    const draft = await assignment("Draft", "DRAFT");
    const open = await assignment("Open", "PUBLISHED");
    const handIn = (id: string) =>
      api(`/api/v1/lms/assignments/${id}/submissions`, {
        method: "POST",
        cookie: teacher,
        body: { branchId: home.id, studentId: ids.pupil, content: "My work" },
      });

    const closed = await handIn(shut.id);
    expect(closed.status).toBe(400);
    expect(closed.json.error.message).toContain("closed");
    expect((await handIn(draft.id)).status).toBe(400);
    expect(await db.assignmentSubmission.count()).toBe(0);
    expect((await handIn(open.id)).status).toBe(201);

    // through the portal: the closed one is listed (closed by the teacher) and refuses the hand-in
    const cookie = await portalCookie();
    const lms = await api(`/api/v1/portal/students/${ids.pupil}/lms`, { cookie });
    const listed = lms.json.data.assignments as { title: string; closed: boolean; closedBy: string | null }[];
    expect(listed.map((a) => a.title).sort()).toEqual(["Open", "Shut"]);
    expect(listed.find((a) => a.title === "Shut")).toMatchObject({ closed: true, closedBy: "TEACHER" });
    expect(listed.find((a) => a.title === "Open")).toMatchObject({ closed: false, closedBy: null });
    const refused = await api(`/api/v1/portal/students/${ids.pupil}/assignments/${shut.id}/submission`, {
      method: "POST",
      cookie,
      body: { content: "late", attachments: [] },
    });
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toContain("closed");
    expect(await db.assignmentSubmission.count({ where: { assignmentId: shut.id } })).toBe(0);
  });
});
