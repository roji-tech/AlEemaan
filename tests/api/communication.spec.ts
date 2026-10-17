import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
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

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
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

  test("broadcast campaign: audience resolution and dispatch execution", async () => {
    const admin = await asRole(Role.ADMIN, home.id);

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
    const broadcastRes = await api("/api/v1/communication/broadcast", {
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

  test("retry dispatch: failed dispatch retry transitions state to SENT", async () => {
    const admin = await asRole(Role.ADMIN, home.id);

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
    const retryRes = await api(`/api/v1/communication/dispatches/${failedDispatch.id}/retry`, {
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
});
