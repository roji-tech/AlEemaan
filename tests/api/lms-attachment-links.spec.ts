import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A link on a study material, an assignment or a hand-in is a web address: http or https (task 0065). The schema used z.string().url(), which also takes javascript:, data: and ftp:.

let home: { id: string; name: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.assignmentSubmission.deleteMany();
  await db.assignment.deleteMany();
  await db.learningMaterial.deleteMany();
  await db.subject.deleteMany();
  await db.studentRecord.deleteMany();
});

const asTeacher = async () => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.TEACHING_STAFF } });
  return cookieHeader((await loginAs(user)).token!);
};

const NOT_WEB = [
  "javascript:alert(document.cookie)",
  "data:text/html,<script>alert(1)</script>",
  "ftp://files.example.com/notes.pdf",
  "mailto:head@school.example",
];

test.describe("what a link may be", () => {
  test("a study material: a link that is not http or https is refused and nothing is stored", async () => {
    const cookie = await asTeacher();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
    for (const url of NOT_WEB) {
      const res = await api("/api/v1/lms/materials", {
        method: "POST",
        cookie,
        body: { branchId: home.id, subjectId: subject.id, title: "Reading notes", attachments: [{ title: "Notes", url }] },
      });
      expect(res.status, url).toBe(400);
      expect(res.json.error.message, url).toContain("http");
    }
    expect(await db.learningMaterial.count()).toBe(0);
  });

  test("a study material: an http and an https link are stored as the material's attachments", async () => {
    const cookie = await asTeacher();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
    const attachments = [
      { title: "Notes", url: "https://school.example/notes.pdf" },
      { title: "Old page", url: "http://school.example/old.html" },
    ];
    const res = await api("/api/v1/lms/materials", {
      method: "POST",
      cookie,
      body: { branchId: home.id, subjectId: subject.id, title: "Reading notes", attachments },
    });
    expect(res.status).toBe(201);
    const row = await db.learningMaterial.findFirstOrThrow({ where: { title: "Reading notes" } });
    expect(row.attachments).toEqual(attachments);
  });

  test("an assignment: a link that is not http or https is refused", async () => {
    const cookie = await asTeacher();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
    const res = await api("/api/v1/lms/assignments", {
      method: "POST",
      cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Essay",
        totalPoints: 20,
        status: "PUBLISHED",
        attachments: [{ title: "Sheet", url: "javascript:alert(1)" }],
      },
    });
    expect(res.status).toBe(400);
    expect(await db.assignment.count()).toBe(0);
  });

  test("a hand-in: a link that is not http or https is refused and no submission is stored", async () => {
    const cookie = await asTeacher();
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
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
    const made = await api("/api/v1/lms/assignments", {
      method: "POST",
      cookie,
      body: { branchId: home.id, subjectId: subject.id, title: "Essay", totalPoints: 20, status: "PUBLISHED" },
    });
    expect(made.status).toBe(201);
    const res = await api(`/api/v1/lms/assignments/${made.json.data.id}/submissions`, {
      method: "POST",
      cookie,
      body: { branchId: home.id, studentId: pupil.id, attachments: [{ title: "My work", url: "javascript:alert(1)" }] },
    });
    expect(res.status).toBe(400);
    expect(await db.assignmentSubmission.count()).toBe(0);
  });
});
