import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const SETTINGS_ROUTE = "/api/v1/settings/school";
const SESSIONS_ROUTE = "/api/v1/academics/sessions";

test.beforeAll(async () => {
  await seedInstance();
});

const asRole = async (role?: Role) => {
  const user = await createUser({ role });
  const { token } = await loginAs(user);
  return { user, cookie: cookieHeader(token!) };
};

test.describe("School Settings API (/api/v1/settings/school)", () => {
  test("GET /api/v1/settings/school requires authentication", async () => {
    const res = await api(SETTINGS_ROUTE);
    expect(res.status).toBe(401);
  });

  test("GET /api/v1/settings/school returns settings for signed-in user", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const res = await api(SETTINGS_ROUTE, { cookie });
    expect(res.status).toBe(200);
    expect(res.json.data.settings).toBeDefined();
    expect(res.json.data.settings.name).toBe("Al-Eemaan Schools");
  });

  test("PATCH /api/v1/settings/school is refused for non-admin (403)", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const res = await api(SETTINGS_ROUTE, {
      method: "PATCH",
      cookie,
      body: { name: "Hacked School" },
    });
    expect(res.status).toBe(403);
  });

  test("PATCH /api/v1/settings/school validates input", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const res = await api(SETTINGS_ROUTE, {
      method: "PATCH",
      cookie,
      body: { name: "A", email: "not-an-email" },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION");
  });

  test("PATCH /api/v1/settings/school updates info and writes AuditLog", async () => {
    const { user, cookie } = await asRole(Role.ADMIN);
    const updatePayload = {
      name: "Al-Eemaan International Academy",
      principal: "Dr. Ahmad Al-Mansoor",
      phone: "+2348012345678",
      motto: "Excellence in Faith and Knowledge",
      address: "14 Crescent Boulevard, Ilorin, Kwara State",
      email: "info@aleemaan.edu.ng",
      website: "https://aleemaan.edu.ng",
    };

    const res = await api(SETTINGS_ROUTE, {
      method: "PATCH",
      cookie,
      body: updatePayload,
    });

    expect(res.status).toBe(200);
    expect(res.json.data.settings.name).toBe(updatePayload.name);
    expect(res.json.data.settings.principal).toBe(updatePayload.principal);
    expect(res.json.data.settings.website).toBe(updatePayload.website);

    // Verify audit log
    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: user.id,
        action: "SCHOOL_SETTINGS_UPDATED",
        targetType: "SchoolSettings",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
  });
});

test.describe("Academic Sessions & Periods API (/api/v1/academics/sessions)", () => {
  test("GET /api/v1/academics/sessions requires authentication", async () => {
    const res = await api(SESSIONS_ROUTE);
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/academics/sessions requires ADMIN role", async () => {
    const { cookie } = await asRole(Role.TEACHING_STAFF);
    const res = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: "any",
        label: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-07-20",
      },
    });
    expect(res.status).toBe(403);
  });

  test("POST validates that endDate > startDate", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const englishBranch = await db.branch.findFirstOrThrow({
      where: { name: "Secondary (English)" },
    });

    const res = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: englishBranch.id,
        label: "2026/2027",
        startDate: "2027-09-01",
        endDate: "2026-09-01",
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION");
  });

  test("English branch session creation initializes 3 terms automatically", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const englishBranch = await db.branch.findFirstOrThrow({
      where: { name: "Secondary (English)" },
    });

    const label = `2026/2027-ENG-${Date.now()}`;
    const res = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: englishBranch.id,
        label,
        startDate: "2026-09-01",
        endDate: "2027-07-20",
      },
    });

    expect(res.status).toBe(201);
    const session = res.json.data.session;
    expect(session.label).toBe(label);
    expect(session.branch.name).toBe("Secondary (English)");
    // Should have 3 terms
    expect(session.periods.length).toBe(3);
    expect(session.periods.map((p: { label: string }) => p.label)).toEqual(["1st Term", "2nd Term", "3rd Term"]);
  });

  test("Arabic branch session creation initializes 2 terms automatically", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const arabicBranch = await db.branch.findFirstOrThrow({
      where: { name: "Secondary (Arabic)" },
    });

    const label = `1448/1449-ARB-${Date.now()}`;
    const res = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: arabicBranch.id,
        label,
        startDate: "2026-09-01",
        endDate: "2027-06-15",
      },
    });

    expect(res.status).toBe(201);
    const session = res.json.data.session;
    expect(session.label).toBe(label);
    expect(session.branch.name).toBe("Secondary (Arabic)");
    // Should have 2 terms
    expect(session.periods.length).toBe(2);
    expect(session.periods.map((p: { label: string }) => p.label)).toEqual(["1st Term", "2nd Term"]);
  });

  test("Duplicate session label on same branch is refused (409)", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const englishBranch = await db.branch.findFirstOrThrow({
      where: { name: "Primary (English)" },
    });

    const label = `2026/2027-DUP-${Date.now()}`;
    const first = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: englishBranch.id,
        label,
        startDate: "2026-09-01",
        endDate: "2027-07-20",
      },
    });
    expect(first.status).toBe(201);

    const dup = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: englishBranch.id,
        label,
        startDate: "2026-09-01",
        endDate: "2027-07-20",
      },
    });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("DUPLICATE_SESSION");
  });

  test("GET /api/v1/academics/sessions/[id] and PATCH workflow", async () => {
    const { cookie } = await asRole(Role.ADMIN);
    const branch = await db.branch.findFirstOrThrow({
      where: { name: "Primary (English)" },
    });

    const createRes = await api(SESSIONS_ROUTE, {
      method: "POST",
      cookie,
      body: {
        branchId: branch.id,
        label: `2027/2028-${Date.now()}`,
        startDate: "2027-09-01",
        endDate: "2028-07-20",
      },
    });
    const sessionId = createRes.json.data.session.id;

    // Get detail
    const getRes = await api(`${SESSIONS_ROUTE}/${sessionId}`, { cookie });
    expect(getRes.status).toBe(200);
    expect(getRes.json.data.session.id).toBe(sessionId);

    // Update session: activate it
    const patchRes = await api(`${SESSIONS_ROUTE}/${sessionId}`, {
      method: "PATCH",
      cookie,
      body: { status: "ACTIVE" },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.data.session.status).toBe("ACTIVE");

    // Activate a period as current term
    const periodId = patchRes.json.data.session.periods[1].id; // 2nd Term
    const periodPatch = await api(`/api/v1/academics/periods/${periodId}`, {
      method: "PATCH",
      cookie,
      body: { branchId: branch.id, isCurrent: true },
    });
    expect(periodPatch.status).toBe(200);
    expect(periodPatch.json.data.period.isCurrent).toBe(true);

    // Verify other periods in branch are not current
    const updatedDetail = await api(`${SESSIONS_ROUTE}/${sessionId}`, { cookie });
    const periods = updatedDetail.json.data.session.periods;
    expect(periods.find((p: { id: string }) => p.id === periodId).isCurrent).toBe(true);
    expect(periods.filter((p: { isCurrent: boolean }) => p.isCurrent).length).toBe(1);
  });
});
