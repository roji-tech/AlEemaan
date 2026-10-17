import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, NotificationChannel } from "@prisma/client";
import { db, seedInstance } from "../support/db";
import { api } from "../support/http";
import crypto from "node:crypto";

let home: { id: string; name: string };

test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.guardianLinkToken.deleteMany();
  await db.attendanceRecord.deleteMany();
  await db.invoice.deleteMany();
  await db.assignment.deleteMany();
  await db.result.deleteMany();
  await db.studentEnrollment.deleteMany();
  await db.studentRecord.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.academicPeriod.deleteMany();
  await db.academicSession.deleteMany();
});

test.describe("Slice P8 — Parent & Student Portal API", () => {
  test("portal authentication, multi-child sibling resolution, strict data isolation, and module queries", async () => {
    // 1. Setup Academic Session, Class & Arms
    const session = await db.academicSession.create({
      data: {
        branchId: home.id,
        label: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-20"),
        status: "ACTIVE",
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2025-12-15"),
        isCurrent: true,
      },
    });

    const classGroup = await db.classGroup.create({
      data: {
        branchId: home.id,
        name: "JSS 1",
        sortOrder: 1,
      },
    });

    const classArm = await db.classArm.create({
      data: {
        branchId: home.id,
        classGroupId: classGroup.id,
        name: "Gold",
      },
    });

    // 2. Setup Students (Family 1: Fatima & Ibrahim Musa; Family 2: Zainab Bello)
    const guardianPhone = "+2348011112222";
    const guardianEmail = "musa.family@example.com";

    const student1 = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Fatima",
        lastName: "Musa",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-05-10T00:00:00Z"),
        admissionNo: "2025/0001",
        guardianName: "Alhaji Musa",
        guardianPhone,
        guardianEmail,
      },
    });

    const student2 = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Ibrahim",
        lastName: "Musa",
        gender: Gender.MALE,
        dateOfBirth: new Date("2015-08-22T00:00:00Z"),
        admissionNo: "2025/0002",
        guardianName: "Alhaji Musa",
        guardianPhone,
        guardianEmail,
      },
    });

    const student3 = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Zainab",
        lastName: "Bello",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2014-02-14T00:00:00Z"),
        admissionNo: "2025/0003",
        guardianName: "Mallam Bello",
        guardianPhone: "+2348099998888",
        guardianEmail: "bello@example.com",
      },
    });

    // Enrol students
    await db.studentEnrollment.createMany({
      data: [
        {
          studentId: student1.id,
          branchId: home.id,
          sessionId: session.id,
          className: "JSS 1",
          arm: "Gold",
          classArmId: classArm.id,
          status: "ACTIVE",
        },
        {
          studentId: student2.id,
          branchId: home.id,
          sessionId: session.id,
          className: "JSS 1",
          arm: "Gold",
          classArmId: classArm.id,
          status: "ACTIVE",
        },
        {
          studentId: student3.id,
          branchId: home.id,
          sessionId: session.id,
          className: "JSS 1",
          arm: "Gold",
          classArmId: classArm.id,
          status: "ACTIVE",
        },
      ],
    });

    // Add sample attendance for student 1
    await db.attendanceRecord.create({
      data: {
        branchId: home.id,
        studentId: student1.id,
        date: new Date("2025-09-15"),
        status: "PRESENT",
      },
    });

    // Add sample invoice for student 1
    await db.invoice.create({
      data: {
        branchId: home.id,
        studentId: student1.id,
        periodId: period.id,
        invoiceNo: "INV-2025-0001",
        totalAmount: 45000,
        amountPaid: 20000,
        status: "PARTIALLY_PAID",
      },
    });

    // --- 3. Authentication via Admission No & Secret ---
    // A) Wrong secret fails
    const failLogin = await api("/api/v1/portal/session", {
      body: {
        admissionNo: "2025/0001",
        secret: "wrong-secret",
      },
    });
    expect(failLogin.status).toBe(401);

    // B) Correct login with Nigerian guardian phone
    const loginRes = await api("/api/v1/portal/session", {
      body: {
        admissionNo: "2025/0001",
        secret: "08011112222",
      },
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.json.data.student.id).toBe(student1.id);
    expect(loginRes.json.data.siblingStudents).toHaveLength(2); // Fatima & Ibrahim

    // Extract session cookie
    const setCookieHeader = loginRes.setCookies[0];
    expect(setCookieHeader).toBeDefined();
    const sessionCookie = setCookieHeader.split(";")[0];

    // --- 4. Validate Active Session ---
    const sessionRes = await api("/api/v1/portal/session", {
      cookie: sessionCookie,
    });
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.json.data.session.primaryStudentId).toBe(student1.id);
    expect(sessionRes.json.data.students).toHaveLength(2);

    // --- 5. Data Isolation & Privacy ---
    // A) Can read own overview
    const s1Overview = await api(`/api/v1/portal/students/${student1.id}/overview`, {
      cookie: sessionCookie,
    });
    expect(s1Overview.status).toBe(200);
    expect(s1Overview.json.data.student.firstName).toBe("Fatima");
    expect(s1Overview.json.data.attendance.totalDays).toBe(1);
    expect(s1Overview.json.data.finance.outstandingBalance).toBe(25000);

    // B) Can read sibling's overview
    const s2Overview = await api(`/api/v1/portal/students/${student2.id}/overview`, {
      cookie: sessionCookie,
    });
    expect(s2Overview.status).toBe(200);
    expect(s2Overview.json.data.student.firstName).toBe("Ibrahim");

    // C) CANNOT read unrelated student (Zainab Bello) -> 403 Forbidden!
    const s3Forbidden = await api(`/api/v1/portal/students/${student3.id}/overview`, {
      cookie: sessionCookie,
    });
    expect(s3Forbidden.status).toBe(403);

    // --- 6. Results, Invoices, LMS ---
    const s1Results = await api(`/api/v1/portal/students/${student1.id}/results`, {
      cookie: sessionCookie,
    });
    expect(s1Results.status).toBe(200);
    expect(s1Results.json.data.reportCards).toBeDefined();

    const s1Invoices = await api(`/api/v1/portal/students/${student1.id}/invoices`, {
      cookie: sessionCookie,
    });
    expect(s1Invoices.status).toBe(200);
    expect(s1Invoices.json.data.invoices).toHaveLength(1);
    expect(s1Invoices.json.data.invoices[0].invoiceNo).toBe("INV-2025-0001");

    const s1Lms = await api(`/api/v1/portal/students/${student1.id}/lms`, {
      cookie: sessionCookie,
    });
    expect(s1Lms.status).toBe(200);
    expect(s1Lms.json.data.assignments).toBeDefined();

    // --- 7. Magic Link Token Authentication ---
    const rawToken = "magic-token-xyz-12345678901234567890";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await db.guardianLinkToken.create({
      data: {
        branchId: home.id,
        studentId: student3.id,
        tokenHash,
        channel: NotificationChannel.SMS,
        action: "portal_access",
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    const magicLogin = await api("/api/v1/portal/session", {
      body: { token: rawToken },
    });
    expect(magicLogin.status).toBe(200);
    expect(magicLogin.json.data.student.id).toBe(student3.id);

    const s3Cookie = magicLogin.setCookies[0].split(";")[0];
    const s3Access = await api(`/api/v1/portal/students/${student3.id}/overview`, {
      cookie: s3Cookie,
    });
    expect(s3Access.status).toBe(200);

    // S3 cannot access Student 1
    const s3AccessDenied = await api(`/api/v1/portal/students/${student1.id}/overview`, {
      cookie: s3Cookie,
    });
    expect(s3AccessDenied.status).toBe(403);

    // --- 8. Sign Out ---
    const logoutRes = await api("/api/v1/portal/session", {
      method: "DELETE",
      cookie: sessionCookie,
    });
    expect(logoutRes.status).toBe(200);
  });
});
