import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

let home: { id: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.announcement.deleteMany();
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Announcements API", () => {
  test("creates, lists, guards school-wide broadcast, updates, and deletes", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const student = await asRole(Role.STUDENT);

    // 1. Unauthenticated is 401
    const unauth = await api("/api/v1/announcements");
    expect(unauth.status).toBe(401);

    // 2. Student cannot author announcements (403)
    const studentCreate = await api("/api/v1/announcements", {
      method: "POST",
      cookie: student.cookie,
      body: {
        branchId: home.id,
        title: "Student Post",
        body: "Hello",
      },
    });
    expect(studentCreate.status).toBe(403);

    // 3. Regular admin cannot publish school-wide (null branchId) -> 403
    const schoolWideFail = await api("/api/v1/announcements", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: null,
        title: "School Wide",
        body: "Alert",
      },
    });
    expect(schoolWideFail.status).toBe(403);

    // 4. Teacher creates branch announcement
    const teacherCreate = await api("/api/v1/announcements", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        title: "Science Fair Next Week",
        body: "Please submit all project proposals by Friday.",
        targetRoles: [Role.STUDENT, Role.TEACHING_STAFF],
        isPinned: true,
      },
    });
    expect(teacherCreate.status).toBe(201);
    const ann = teacherCreate.json.data;
    expect(ann.title).toBe("Science Fair Next Week");
    expect(ann.isPinned).toBe(true);

    // 5. Student lists announcements and sees it
    const studentList = await api(`/api/v1/announcements?branchId=${home.id}`, {
      cookie: student.cookie,
    });
    expect(studentList.status).toBe(200);
    expect(studentList.json.data).toHaveLength(1);
    expect(studentList.json.data[0].id).toBe(ann.id);

    // 6. Teacher creates a DRAFT announcement
    const draftCreate = await api("/api/v1/announcements", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        title: "Exam Schedule Draft",
        body: "Tentative timetable.",
        status: "DRAFT",
      },
    });
    expect(draftCreate.status).toBe(201);

    // 7. Student does NOT see the DRAFT
    const studentListAfterDraft = await api(`/api/v1/announcements?branchId=${home.id}`, {
      cookie: student.cookie,
    });
    expect(studentListAfterDraft.json.data).toHaveLength(1);

    // 8. Teacher (author) CAN see the DRAFT
    const teacherList = await api(`/api/v1/announcements?branchId=${home.id}`, {
      cookie: teacher.cookie,
    });
    expect(teacherList.json.data).toHaveLength(2);

    // 9. Teacher updates the announcement
    const updateRes = await api(`/api/v1/announcements/${ann.id}`, {
      method: "PATCH",
      cookie: teacher.cookie,
      body: {
        title: "Science Fair Next Week - Updated",
      },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.json.data.title).toBe("Science Fair Next Week - Updated");

    // 10. Teacher deletes the announcement
    const deleteRes = await api(`/api/v1/announcements/${ann.id}`, {
      method: "DELETE",
      cookie: teacher.cookie,
    });
    expect(deleteRes.status).toBe(200);
  });
});
