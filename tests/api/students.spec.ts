import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const STUDENTS_ROUTE = "/api/v1/students";

test.beforeAll(async () => {
  await seedInstance();
});

const asRole = async (role?: Role) => {
  const user = await createUser({ role });
  const { token } = await loginAs(user);
  return { user, cookie: cookieHeader(token!) };
};

test.describe("Students API & ADR-0011 Namesake Override", () => {
  test("GET /api/v1/students requires authentication", async () => {
    const res = await api(STUDENTS_ROUTE);
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/students requires ADMIN role", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });

    const res = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Zainab",
        lastName: "Aliyu",
        gender: "FEMALE",
        dateOfBirth: "2016-05-10",
      },
    });
    expect(res.status).toBe(403);
  });

  test("creates student and auto-generates sequential admission number", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });

    const res = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Fatima",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: "2017-08-14",
      },
    });

    expect(res.status).toBe(201);
    const student = res.json.data.student;
    expect(student.firstName).toBe("Fatima");
    expect(student.admissionNo).toMatch(/^\d{4}\/\d{4}$/);

    // Verify AuditLog exists and has zero PII
    const audit = await db.auditLog.findFirst({
      where: { actorUserId: user.id, targetId: student.id, action: "STUDENT_CREATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
    const after = audit!.afterValue as Record<string, unknown>;
    expect(after.admissionNo).toBe(student.admissionNo);
    expect(JSON.stringify(after)).not.toContain("Fatima");
    expect(JSON.stringify(after)).not.toContain("2017-08-14");
  });

  test("namesake duplicate refused by default (409 POSSIBLE_DUPLICATE)", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Secondary (English)" } });

    const payload = {
      branchId: branch.id,
      firstName: "Usman",
      lastName: "Danjuma",
      gender: "MALE",
      dateOfBirth: "2012-03-22",
    };

    // 1. Create original student
    const first = await api(STUDENTS_ROUTE, { method: "POST", cookie, body: payload });
    expect(first.status).toBe(201);
    const firstAdmNo = first.json.data.student.admissionNo;

    // 2. Attempt duplicate without allowDuplicate
    const dupRefused = await api(STUDENTS_ROUTE, { method: "POST", cookie, body: payload });
    expect(dupRefused.status).toBe(409);
    expect(dupRefused.json.error.code).toBe("POSSIBLE_DUPLICATE");
    expect(dupRefused.json.error.message).toContain(firstAdmNo);
  });

  test("namesake duplicate allowed with allowDuplicate: true (ADR-0011 override)", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Secondary (English)" } });

    const payload = {
      branchId: branch.id,
      firstName: "Amina",
      lastName: "Suleiman",
      gender: "FEMALE",
      dateOfBirth: "2013-11-05",
    };

    // 1. First student
    const first = await api(STUDENTS_ROUTE, { method: "POST", cookie, body: payload });
    expect(first.status).toBe(201);
    const firstAdmNo = first.json.data.student.admissionNo;

    // 2. Namesake student with allowDuplicate: true
    const second = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: { ...payload, allowDuplicate: true },
    });
    expect(second.status).toBe(201);
    const secondStudent = second.json.data.student;
    expect(secondStudent.admissionNo).not.toBe(firstAdmNo);

    // 3. Verify audit log captures override flag with zero PII
    const audit = await db.auditLog.findFirst({
      where: { actorUserId: user.id, targetId: secondStudent.id, action: "STUDENT_CREATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
    const after = audit!.afterValue as Record<string, unknown>;
    expect(after.duplicateOverridden).toBe(true);
    expect(after.existingAdmissionNo).toBe(firstAdmNo);
    expect(JSON.stringify(after)).not.toContain("Amina");
    expect(JSON.stringify(after)).not.toContain("2013-11-05");
  });

  test("update student enforces namesake check and override", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Primary (Arabic)" } });

    // Create student 1
    const s1 = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Bilal",
        lastName: "Tukur",
        gender: "MALE",
        dateOfBirth: "2015-09-19",
      },
    });
    expect(s1.status).toBe(201);

    // Create student 2 with distinct details
    const s2 = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Tariq",
        lastName: "Yahya",
        gender: "MALE",
        dateOfBirth: "2015-01-10",
      },
    });
    expect(s2.status).toBe(201);
    const s2Id = s2.json.data.student.id;

    // Update s2 to clash with s1 without override -> 409
    const clash = await api(`${STUDENTS_ROUTE}/${s2Id}`, {
      method: "PATCH",
      cookie,
      body: {
        firstName: "Bilal",
        lastName: "Tukur",
        dateOfBirth: "2015-09-19",
      },
    });
    expect(clash.status).toBe(409);
    expect(clash.json.error.code).toBe("POSSIBLE_DUPLICATE");

    // Update s2 with allowDuplicate: true -> 200 OK
    const allowed = await api(`${STUDENTS_ROUTE}/${s2Id}`, {
      method: "PATCH",
      cookie,
      body: {
        firstName: "Bilal",
        lastName: "Tukur",
        dateOfBirth: "2015-09-19",
        allowDuplicate: true,
      },
    });
    expect(allowed.status).toBe(200);

    // Verify audit
    const audit = await db.auditLog.findFirst({
      where: { actorUserId: user.id, targetId: s2Id, action: "STUDENT_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
    const after = audit!.afterValue as Record<string, unknown>;
    expect(after.duplicateOverridden).toBe(true);
  });

  test("archiving and restoring with namesake protection", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Primary (English)" } });

    // Create student A
    const resA = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Hauwa",
        lastName: "Mustapha",
        gender: "FEMALE",
        dateOfBirth: "2014-06-30",
      },
    });
    const studentAId = resA.json.data.student.id;

    // Archive student A
    const archiveRes = await api(`${STUDENTS_ROUTE}/${studentAId}`, {
      method: "DELETE",
      cookie,
    });
    expect(archiveRes.status).toBe(200);

    // Now create student B with same name and DOB (allowed because A is archived)
    const resB = await api(STUDENTS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        firstName: "Hauwa",
        lastName: "Mustapha",
        gender: "FEMALE",
        dateOfBirth: "2014-06-30",
      },
    });
    expect(resB.status).toBe(201);

    // Attempt to restore student A without allowDuplicate -> 409
    const restoreBlocked = await api(`${STUDENTS_ROUTE}/${studentAId}/restore`, {
      method: "POST",
      cookie,
      body: { allowDuplicate: false },
    });
    expect(restoreBlocked.status).toBe(409);
    expect(restoreBlocked.json.error.code).toBe("POSSIBLE_DUPLICATE");

    // Restore student A with allowDuplicate: true -> 200
    const restoreAllowed = await api(`${STUDENTS_ROUTE}/${studentAId}/restore`, {
      method: "POST",
      cookie,
      body: { allowDuplicate: true },
    });
    expect(restoreAllowed.status).toBe(200);
  });

  test("POST /api/v1/students/import handles batch duplicates and override", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({ where: { name: "Secondary (English)" } });

    const rows = [
      {
        firstName: "Salim",
        lastName: "Garba",
        gender: "MALE" as const,
        dateOfBirth: "2011-12-12",
        className: "JSS 1",
      },
      {
        firstName: "Khadija",
        lastName: "Umar",
        gender: "FEMALE" as const,
        dateOfBirth: "2012-04-04",
        className: "JSS 1",
      },
    ];

    // Initial import
    const imp1 = await api(`${STUDENTS_ROUTE}/import`, {
      method: "POST",
      cookie,
      body: { branchId: branch.id, rows, allowDuplicates: false },
    });
    expect(imp1.status).toBe(200);
    expect(imp1.json.data.summary.imported).toBe(2);

    // Re-importing identical rows without allowDuplicates -> 2 conflicts
    const impDup = await api(`${STUDENTS_ROUTE}/import`, {
      method: "POST",
      cookie,
      body: { branchId: branch.id, rows, allowDuplicates: false },
    });
    expect(impDup.status).toBe(200);
    expect(impDup.json.data.summary.imported).toBe(0);
    expect(impDup.json.data.summary.conflicts.length).toBe(2);

    // Re-importing with allowDuplicates: true -> imports with override
    const impOverride = await api(`${STUDENTS_ROUTE}/import`, {
      method: "POST",
      cookie,
      body: { branchId: branch.id, rows, allowDuplicates: true },
    });
    expect(impOverride.status).toBe(200);
    expect(impOverride.json.data.summary.imported).toBe(2);
    expect(impOverride.json.data.summary.overridden).toBe(2);
  });
});
