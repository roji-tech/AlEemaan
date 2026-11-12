import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { DEVTOOLS_URL } from "../support/env";
import { api, cookieHeader, loginAs } from "../support/http";
import { clearMockEmails } from "@/lib/communication/gateways/email";
import { clearMockTermiiMessages } from "@/lib/communication/gateways/termii";

let home: { id: string; name: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  clearMockEmails();
  clearMockTermiiMessages();
  await db.notificationAuditLog.deleteMany();
  await db.guardianLinkToken.deleteMany();
  await db.notificationDispatch.deleteMany();
  await db.notificationTemplate.deleteMany();
  await db.studentRecord.deleteMany();
});

// The servers under test are production-shaped, so a send with no provider key FAILS there (task 0053). The tests that need a send to succeed run on the staging-mode server, where the dev
// tools are on and the in-memory stand-in is allowed; the tests below that need to see the failure stay on the production-shaped one.
const asRole = async (role: Role, branchId = home.id, superAdmin = false, baseUrl?: string) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user, { baseUrl })).token!) };
};
const onStaging = (path: string, opts: Parameters<typeof api>[1] = {}) => api(path, { baseUrl: DEVTOOLS_URL, ...opts });
const seedParents = async () => {
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Bello",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2012-05-10"),
      admissionNo: "ADM-COMM-001",
      guardianEmail: "amina.parent@example.com",
      guardianPhone: "08012345678",
    },
  });
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ibrahim",
      lastName: "Sani",
      gender: Gender.MALE,
      dateOfBirth: new Date("2011-08-20"),
      admissionNo: "ADM-COMM-002",
      guardianEmail: "ibrahim.parent@example.com",
      guardianPhone: "08098765432",
    },
  });
};

test.describe("Slice P6 — Multi-Channel Communication & Messaging API", () => {
  test("template lifecycle: list system templates, create custom, update, get, delete", async () => {
    const admin = await asRole(Role.ADMIN, home.id);

    // 1. List templates (triggers ensureSystemTemplates seeding)
    const listRes = await api(`/api/v1/communication/templates?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(listRes.status).toBe(200);
    const initialTemplates = listRes.json.data;
    expect(initialTemplates.length).toBeGreaterThan(0);
    expect(initialTemplates.some((t: { isSystem: boolean }) => t.isSystem)).toBe(true);

    // 2. Create custom template
    const createRes = await api("/api/v1/communication/templates", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        code: "CUSTOM_EXAM_SCHEDULE",
        name: "Terminal Exam Schedule",
        channel: NotificationChannel.SMS,
        bodyTemplate: "Dear Parent, exam begins on {{exam_date}} for {{student_name}}.",
        variables: ["exam_date", "student_name"],
      },
    });
    expect(createRes.status).toBe(201);
    const created = createRes.json.data;
    expect(created.code).toBe("CUSTOM_EXAM_SCHEDULE");
    expect(created.isSystem).toBe(false);

    // 3. Get template by ID
    const getRes = await api(`/api/v1/communication/templates/${created.id}?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(getRes.status).toBe(200);
    expect(getRes.json.data.id).toBe(created.id);

    // 4. Update template
    const updateRes = await api(`/api/v1/communication/templates/${created.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        name: "Terminal Exam Schedule (Updated)",
      },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.json.data.name).toBe("Terminal Exam Schedule (Updated)");

    // 5. Delete custom template
    const deleteRes = await api(`/api/v1/communication/templates/${created.id}?branchId=${home.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(deleteRes.status).toBe(200);
  });

  test("broadcast campaign: audience resolution and dispatch execution (staging-mode server: the stand-in is allowed)", async () => {
    const admin = await asRole(Role.ADMIN, home.id, false, DEVTOOLS_URL);

    // Seed students with parent phone & email contacts
    await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Amina",
        lastName: "Bello",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-05-10"),
        admissionNo: "ADM-COMM-001",
        guardianEmail: "amina.parent@example.com",
        guardianPhone: "08012345678",
      },
    });

    await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Ibrahim",
        lastName: "Sani",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-08-20"),
        admissionNo: "ADM-COMM-002",
        guardianEmail: "ibrahim.parent@example.com",
        guardianPhone: "08098765432",
      },
    });

    // Broadcast SMS to ALL_PARENTS
    const broadcastRes = await onStaging("/api/v1/communication/broadcast", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        channel: NotificationChannel.SMS,
        targetAudience: "ALL_PARENTS",
        body: "School closes tomorrow by 1:00 PM for mid-term break.",
      },
    });

    expect(broadcastRes.status).toBe(201);
    const data = broadcastRes.json.data;
    expect(data.count).toBe(2);
    // the answer says what happened, not only how many rows were made (task 0053)
    expect(data.sent).toBe(2);
    expect(data.failed).toBe(0);
    expect(data.firstError).toBeNull();
    expect(data.dispatches.length).toBe(2);
    expect(data.dispatches.every((d: { status: string }) => d.status === NotificationDispatchStatus.SENT)).toBe(true);

    // Verify dispatches query API
    const dispatchesRes = await api(`/api/v1/communication/dispatches?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(dispatchesRes.status).toBe(200);
    const dispatchesData = dispatchesRes.json.data;
    expect(dispatchesData.total).toBe(2);
    expect(dispatchesData.items.length).toBe(2);
  });

  test("retry dispatch: failed dispatch retry transitions state to SENT (staging-mode server: the stand-in is allowed)", async () => {
    const admin = await asRole(Role.ADMIN, home.id, false, DEVTOOLS_URL);

    // Seed a failed dispatch manually
    const failedDispatch = await db.notificationDispatch.create({
      data: {
        branchId: home.id,
        channel: NotificationChannel.SMS,
        recipientAddress: "08012345678",
        status: NotificationDispatchStatus.FAILED,
        body: "Retry test message",
        attempts: 1,
        lastError: "Network timeout simulated",
      },
    });

    // Retry the dispatch
    const retryRes = await onStaging(`/api/v1/communication/dispatches/${failedDispatch.id}/retry`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id },
    });

    expect(retryRes.status).toBe(200);
    const retryData = retryRes.json.data;
    expect(retryData.success).toBe(true);
    expect(retryData.status).toBe(NotificationDispatchStatus.SENT);

    // Verify record in database
    const updated = await db.notificationDispatch.findUnique({
      where: { id: failedDispatch.id },
    });
    expect(updated?.status).toBe(NotificationDispatchStatus.SENT);
    expect(updated?.attempts).toBe(2);
    expect(updated?.sentAt).not.toBeNull();
  });

  test("a production-shaped server with no provider key records the broadcast as FAILED with the reason, and the answer says so (task 0053)", async () => {
    const admin = await asRole(Role.ADMIN, home.id);
    await seedParents();

    for (const [channel, variable] of [
      [NotificationChannel.EMAIL, "RESEND_API_KEY"],
      [NotificationChannel.SMS, "TERMII_API_KEY"],
      [NotificationChannel.WHATSAPP, "TERMII_API_KEY"],
    ] as const) {
      await db.notificationDispatch.deleteMany();
      const res = await api("/api/v1/communication/broadcast", {
        method: "POST",
        cookie: admin.cookie,
        body: { branchId: home.id, channel, targetAudience: "ALL_PARENTS", subject: "Notice", body: "School closes early on Friday." },
      });
      expect(res.status, channel).toBe(201);
      expect(res.json.data.count, channel).toBe(2);
      expect(res.json.data.sent, channel).toBe(0);
      expect(res.json.data.failed, channel).toBe(2);
      expect(res.json.data.firstError, channel).toContain(variable);
      expect(res.json.data.firstError, channel).toContain("is not set up on this server");
      const rows = await db.notificationDispatch.findMany({ where: { branchId: home.id, channel } });
      expect(rows, channel).toHaveLength(2);
      for (const row of rows) {
        expect(row.status, channel).toBe(NotificationDispatchStatus.FAILED);
        expect(row.sentAt, channel).toBeNull();
        expect(row.lastError, channel).toContain(variable);
      }
    }
  });

  test("on a production-shaped server with no provider key a retry stays FAILED and says why; an In-App broadcast is refused (task 0055)", async () => {
    const admin = await asRole(Role.ADMIN, home.id);
    const failed = await db.notificationDispatch.create({
      data: {
        branchId: home.id,
        channel: NotificationChannel.EMAIL,
        recipientAddress: "parent@example.com",
        status: NotificationDispatchStatus.FAILED,
        subject: "Notice",
        body: "Retry test message",
        attempts: 1,
        lastError: "earlier failure",
      },
    });
    const retry = await api(`/api/v1/communication/dispatches/${failed.id}/retry`, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id },
    });
    expect(retry.status).toBe(200);
    expect(retry.json.data.success).toBe(false);
    expect(retry.json.data.status).toBe(NotificationDispatchStatus.FAILED);
    expect(retry.json.data.error).toContain("RESEND_API_KEY");
    const row = await db.notificationDispatch.findUnique({ where: { id: failed.id } });
    expect(row?.status).toBe(NotificationDispatchStatus.FAILED);
    expect(row?.attempts).toBe(2);
    expect(row?.sentAt).toBeNull();
    expect(row?.lastError).toContain("not set up");

    // The In-App channel used to need no provider and was recorded as sent, but no screen shows an In-App message to anyone (Announcements do), so it is refused before anything is
    // created (task 0055; the rules of the check are in tests/unit/communication-tags.spec.ts).
    await seedParents();
    const before = await db.notificationDispatch.count({ where: { branchId: home.id } });
    const inApp = await api("/api/v1/communication/broadcast", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        channel: NotificationChannel.IN_APP,
        targetAudience: "ALL_PARENTS",
        subject: "Notice",
        body: "In-app notice.",
      },
    });
    expect(inApp.status).toBe(400);
    expect(inApp.json.error.message).toContain("Announcements");
    expect(await db.notificationDispatch.count({ where: { branchId: home.id } })).toBe(before);
  });
});
