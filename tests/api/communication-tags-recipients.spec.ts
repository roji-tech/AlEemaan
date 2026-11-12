import "../support/env";
import { test, expect } from "@playwright/test";
import { EnrollmentStatus, Gender, NotificationChannel, Role, SessionStatus } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { DEVTOOLS_URL } from "../support/env";
import { api, cookieHeader, loginAs } from "../support/http";
import { messageDate } from "@/lib/communication/tags";
import { resolveSchoolTimeZone } from "@/lib/question-bank/school-day";
import { clearMockTermiiMessages } from "@/lib/communication/gateways/termii";
import { clearMockEmails } from "@/lib/communication/gateways/email";

// Task 0055, through the real API on the staging-mode server (the dev tools are on, so the in-memory stand-in sends): the tags of a broadcast are filled in, a phone channel uses a
// phone number (and a staff member's comes from the staff record), and what cannot work is refused before any dispatch row exists. The rules of the input check are unit-tested in
// tests/unit/communication-tags.spec.ts. Everything here is in a branch of its own, so no other spec's data is touched.

const BRANCH = "Comm Tags Test Branch";
const SCHOOL = "Crescent Test School";
let branch: { id: string };
let schoolNameBefore: string | null = null;

test.beforeAll(async () => {
  await seedInstance();
  branch = await db.branch.upsert({ where: { name: BRANCH }, update: {}, create: { name: BRANCH } });
  schoolNameBefore = (await db.schoolSettings.findUnique({ where: { id: "global" } }))?.name ?? null;
  await db.schoolSettings.upsert({ where: { id: "global" }, update: { name: SCHOOL }, create: { id: "global", name: SCHOOL } });
});

test.afterAll(async () => {
  if (schoolNameBefore === null) await db.schoolSettings.deleteMany({ where: { id: "global" } });
  else await db.schoolSettings.update({ where: { id: "global" }, data: { name: schoolNameBefore } });
});

test.beforeEach(async () => {
  clearMockEmails();
  clearMockTermiiMessages();
  await db.notificationDispatch.deleteMany({ where: { branchId: branch.id } });
  await db.notificationAuditLog.deleteMany({ where: { branchId: branch.id } });
  await db.studentEnrollment.deleteMany({ where: { branchId: branch.id } });
  await db.studentRecord.deleteMany({ where: { branchId: branch.id } });
  await db.staffRecord.deleteMany({ where: { branchId: branch.id } });
  await db.academicSession.deleteMany({ where: { branchId: branch.id } });
});

const asAdmin = async () => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: branch.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user, { baseUrl: DEVTOOLS_URL })).token!) };
};
const broadcast = (cookie: string, body: Record<string, unknown>) =>
  api("/api/v1/communication/broadcast", { baseUrl: DEVTOOLS_URL, method: "POST", cookie, body: { branchId: branch.id, ...body } });
const dispatchCount = () => db.notificationDispatch.count({ where: { branchId: branch.id } });

const pupil = (firstName: string, lastName: string, n: number) => ({
  branchId: branch.id,
  firstName,
  lastName,
  gender: Gender.FEMALE,
  dateOfBirth: new Date("2012-05-10"),
  admissionNo: `ADM-TAGS-${n}`,
  guardianEmail: `${firstName.toLowerCase()}.parent@example.com`,
  guardianPhone: `0801000000${n}`,
});

test.describe("the tags of a broadcast are filled in", () => {
  test("a guardian's message names the pupil, the pupil's class now, the school and today's date; a pupil with no class this session gets 'their class'", async () => {
    const admin = await asAdmin();
    const active = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
        status: SessionStatus.ACTIVE,
      },
    });
    const closed = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-31"),
        status: SessionStatus.CLOSED,
      },
    });
    const amina = await db.studentRecord.create({ data: pupil("Amina", "Bello", 1) });
    await db.studentEnrollment.create({
      data: {
        studentId: amina.id,
        branchId: branch.id,
        sessionId: active.id,
        className: "JSS 1",
        arm: "A",
        status: EnrollmentStatus.ACTIVE,
      },
    });
    await db.studentRecord.create({ data: pupil("Ibrahim", "Sani", 2) }); // not enrolled at all
    const fatima = await db.studentRecord.create({ data: pupil("Fatima", "Musa", 3) }); // enrolled only in a session that has closed
    await db.studentEnrollment.create({
      data: {
        studentId: fatima.id,
        branchId: branch.id,
        sessionId: closed.id,
        className: "Primary 6",
        arm: "B",
        status: EnrollmentStatus.ACTIVE,
      },
    });

    const zone = resolveSchoolTimeZone();
    const dayBefore = messageDate(new Date(), zone);
    const res = await broadcast(admin.cookie, {
      channel: NotificationChannel.SMS,
      targetAudience: "ALL_PARENTS",
      body: "Dear Guardian, {{student_name}} of {{class_arm}} at {{school_name}}, {{date}}.",
    });
    const dayAfter = messageDate(new Date(), zone);
    expect(res.status).toBe(201);
    expect(res.json.data.sent).toBe(3);

    const bodyFor = (phone: string) =>
      res.json.data.dispatches.find((d: { recipientAddress: string }) => d.recipientAddress === phone).body as string;
    const expected = (name: string, klass: string) =>
      [dayBefore, dayAfter].map((day) => `Dear Guardian, ${name} of ${klass} at ${SCHOOL}, ${day}.`);
    expect(expected("Amina Bello", "JSS 1 A")).toContain(bodyFor("08010000001"));
    expect(expected("Ibrahim Sani", "their class")).toContain(bodyFor("08010000002"));
    expect(expected("Fatima Musa", "their class")).toContain(bodyFor("08010000003"));
    // and nothing was left as the text "{{...}}", in what was sent or in what was stored
    for (const d of res.json.data.dispatches) expect(d.body).not.toContain("{{");
    const stored = await db.notificationDispatch.findMany({ where: { branchId: branch.id } });
    for (const row of stored) expect(row.body).not.toContain("{{");
  });

  test("the subject is filled in too, and the four known tags win over a same-named entry in `variables` (a caller cannot say whose child it is) while other entries still work", async () => {
    const admin = await asAdmin();
    await db.studentRecord.create({ data: pupil("Amina", "Bello", 1) });
    const res = await broadcast(admin.cookie, {
      channel: NotificationChannel.EMAIL,
      targetAudience: "ALL_PARENTS",
      subject: "Note from {{school_name}} about {{student_name}}",
      body: "Hello {{student_name}} {{ward}}",
      variables: { student_name: "Spoofed Name", school_name: "Spoofed School", ward: "Red House" },
    });
    expect(res.status).toBe(201);
    const [d] = res.json.data.dispatches;
    expect(d.subject).toBe(`Note from ${SCHOOL} about Amina Bello`);
    expect(d.body).toBe("Hello Amina Bello Red House");
  });

  test("staff and pupil audiences get the school's name and the date", async () => {
    const admin = await asAdmin();
    const res = await broadcast(admin.cookie, {
      channel: NotificationChannel.EMAIL,
      targetAudience: "STAFF",
      body: "{{school_name}} staff meeting, {{date}}",
    });
    expect(res.status).toBe(201);
    expect(res.json.data.dispatches.length).toBeGreaterThan(0); // at least the administrator
    for (const d of res.json.data.dispatches) {
      expect(d.body).toContain(SCHOOL);
      expect(d.body).not.toContain("{{");
    }
  });
});

test.describe("a phone channel uses a phone number", () => {
  test("SMS to staff goes to the staff record's phone; a staff member with no phone or no staff record is left out; Email still goes to the account's email", async () => {
    const admin = await asAdmin();
    const withPhone = await createUser({ superAdmin: false, email: `tags.phone.${Date.now()}@example.com` });
    const noPhone = await createUser({ superAdmin: false, email: `tags.nophone.${Date.now()}@example.com` });
    const noRecord = await createUser({ superAdmin: false, email: `tags.norecord.${Date.now()}@example.com` });
    for (const u of [withPhone, noPhone, noRecord])
      await db.membership.create({ data: { userId: u.id, branchId: branch.id, role: Role.TEACHING_STAFF } });
    await db.staffRecord.create({
      data: {
        branchId: branch.id,
        userId: withPhone.id,
        category: "TEACHING",
        firstName: "Hauwa",
        lastName: "Phone",
        phone: " 08033334444 ",
      },
    });
    await db.staffRecord.create({
      data: { branchId: branch.id, userId: noPhone.id, category: "TEACHING", firstName: "Dayo", lastName: "Nophone" },
    });

    const sms = await broadcast(admin.cookie, { channel: NotificationChannel.SMS, targetAudience: "STAFF", body: "Staff meeting at 2pm" });
    expect(sms.status).toBe(201);
    const smsTo = sms.json.data.dispatches.map((d: { recipientAddress: string }) => d.recipientAddress);
    expect(smsTo).toEqual(["08033334444"]); // trimmed; nobody else has a phone number on a staff record in this branch
    expect(smsTo.some((a: string) => a.includes("@"))).toBe(false);
    expect(sms.json.data.sent).toBe(1);

    const email = await broadcast(admin.cookie, {
      channel: NotificationChannel.EMAIL,
      targetAudience: "STAFF",
      body: "Staff meeting at 2pm",
    });
    expect(email.status).toBe(201);
    const emailTo = email.json.data.dispatches.map((d: { recipientAddress: string }) => d.recipientAddress);
    for (const u of [admin.user, withPhone, noPhone, noRecord]) expect(emailTo).toContain(u.email);

    const whatsapp = await broadcast(admin.cookie, {
      channel: NotificationChannel.WHATSAPP,
      targetAudience: "STAFF",
      body: "Staff meeting at 2pm",
    });
    expect(whatsapp.json.data.dispatches.map((d: { recipientAddress: string }) => d.recipientAddress)).toEqual(["08033334444"]);
  });

  test("a staff member's archived record is not used for a phone", async () => {
    const admin = await asAdmin();
    const gone = await createUser({ superAdmin: false });
    await db.membership.create({ data: { userId: gone.id, branchId: branch.id, role: Role.TEACHING_STAFF } });
    await db.staffRecord.create({
      data: {
        branchId: branch.id,
        userId: gone.id,
        category: "TEACHING",
        firstName: "Old",
        lastName: "Record",
        phone: "08055556666",
        archivedAt: new Date(),
      },
    });
    const sms = await broadcast(admin.cookie, { channel: NotificationChannel.SMS, targetAudience: "STAFF", body: "Staff meeting at 2pm" });
    expect(sms.status).toBe(201);
    expect(sms.json.data.dispatches).toEqual([]);
    expect(sms.json.data.count).toBe(0);
  });

  test("guardians are unchanged: Email to the guardian's email, SMS to the guardian's phone", async () => {
    const admin = await asAdmin();
    await db.studentRecord.create({ data: pupil("Amina", "Bello", 1) });
    const email = await broadcast(admin.cookie, { channel: NotificationChannel.EMAIL, targetAudience: "ALL_PARENTS", body: "Hello" });
    expect(email.json.data.dispatches.map((d: { recipientAddress: string }) => d.recipientAddress)).toEqual(["amina.parent@example.com"]);
    const sms = await broadcast(admin.cookie, { channel: NotificationChannel.SMS, targetAudience: "ALL_PARENTS", body: "Hello" });
    expect(sms.json.data.dispatches.map((d: { recipientAddress: string }) => d.recipientAddress)).toEqual(["08010000001"]);
  });
});

test.describe("what cannot work is refused before anything is created", () => {
  const refused = [
    {
      what: "an In-App message",
      body: { channel: NotificationChannel.IN_APP, targetAudience: "STAFF", body: "Hello" },
      message: "In-App messages are sent from Announcements: nothing here shows them to the person.",
    },
    {
      what: "SMS to pupils",
      body: { channel: NotificationChannel.SMS, targetAudience: "STUDENTS", body: "Hello" },
      message: "Pupils have no phone number on file. Use Email, or send to guardians.",
    },
    {
      what: "WhatsApp to pupils",
      body: { channel: NotificationChannel.WHATSAPP, targetAudience: "STUDENTS", body: "Hello" },
      message: "Pupils have no phone number on file. Use Email, or send to guardians.",
    },
    {
      what: "a tag with no source (due_date) for guardians",
      body: { channel: NotificationChannel.EMAIL, targetAudience: "ALL_PARENTS", body: "Fees due {{due_date}}" },
      message: "These tags cannot be filled for guardians: {{due_date}}. Remove them or choose another audience.",
    },
    {
      what: "a pupil tag for staff",
      body: { channel: NotificationChannel.EMAIL, targetAudience: "STAFF", body: "About {{student_name}}" },
      message: "These tags cannot be filled for staff: {{student_name}}. Remove them or choose another audience.",
    },
    {
      what: "an unfillable tag in the subject",
      body: { channel: NotificationChannel.EMAIL, targetAudience: "STUDENTS", subject: "Re {{class_arm}}", body: "Hello" },
      message: "These tags cannot be filled for pupils: {{class_arm}}. Remove them or choose another audience.",
    },
  ];
  for (const { what, body, message } of refused) {
    test(`${what}: 400 with the reason, and no dispatch row, no audit entry`, async () => {
      const admin = await asAdmin();
      await db.studentRecord.create({ data: pupil("Amina", "Bello", 1) });
      const res = await broadcast(admin.cookie, body);
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
      expect(res.json.error.message).toBe(message);
      expect(await dispatchCount()).toBe(0);
      expect(await db.notificationAuditLog.count({ where: { branchId: branch.id } })).toBe(0);
    });
  }

  test("a tag the caller supplies in `variables` is allowed, and an Email to pupils still works", async () => {
    const admin = await asAdmin();
    const ok = await broadcast(admin.cookie, {
      channel: NotificationChannel.EMAIL,
      targetAudience: "ALL_PARENTS",
      body: "Fees due {{due_date}}",
      variables: { due_date: "1 December" },
    });
    expect(ok.status).toBe(201);
    const pupils = await broadcast(admin.cookie, {
      channel: NotificationChannel.EMAIL,
      targetAudience: "STUDENTS",
      body: "Hello {{school_name}}",
    });
    expect(pupils.status).toBe(201);
  });
});
