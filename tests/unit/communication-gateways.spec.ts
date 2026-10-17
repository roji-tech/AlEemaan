import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import {
  normalizeNigerianPhoneNumber,
  isValidPhoneNumber,
  sendTermiiMessage,
  getMockTermiiMessages,
  clearMockTermiiMessages,
} from "@/lib/communication/gateways/termii";
import { isValidEmail, sendEmail, sendBatchEmails, getMockEmails, clearMockEmails } from "@/lib/communication/gateways/email";
import { defaultNotificationDispatcher } from "@/lib/communication/gateways/dispatcher";
import { generateGuardianMagicLink, verifyGuardianMagicLink } from "@/lib/communication/guardian-link";
import { db, seedInstance } from "../support/db";

test.describe("Phone Number Normalization & Validation (Termii)", () => {
  test("normalizeNigerianPhoneNumber converts local Nigerian formats to 234 prefix", () => {
    expect(normalizeNigerianPhoneNumber("08012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("07098765432")).toBe("2347098765432");
    expect(normalizeNigerianPhoneNumber("09011112222")).toBe("2349011112222");
    expect(normalizeNigerianPhoneNumber("+2348012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("2348012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("+234 (801) 234-5678")).toBe("2348012345678");
  });

  test("isValidPhoneNumber detects valid Nigerian and international numbers", () => {
    expect(isValidPhoneNumber("08012345678")).toBe(true);
    expect(isValidPhoneNumber("+2348012345678")).toBe(true);
    expect(isValidPhoneNumber("2348012345678")).toBe(true);
    expect(isValidPhoneNumber("+447911123456")).toBe(true);

    expect(isValidPhoneNumber("1234")).toBe(false);
    expect(isValidPhoneNumber("abc12345678")).toBe(false);
  });

  test("sendTermiiMessage routes through mock delivery in test environment", async () => {
    clearMockTermiiMessages();

    const res = await sendTermiiMessage({
      to: "08012345678",
      message: "Attendance alert: Ahmad is absent.",
      channel: "generic",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toContain("termii-mock-");

    const sent = getMockTermiiMessages();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("2348012345678");
    expect(sent[0].message).toContain("Ahmad is absent");
  });

  test("sendTermiiMessage rejects invalid phone numbers", async () => {
    const res = await sendTermiiMessage({
      to: "not-a-number",
      message: "Invalid number test",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid phone number");
  });
});

test.describe("Email Gateway (Resend / Mock)", () => {
  test("isValidEmail checks email validity correctly", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("guardian.ahmad@school.org.ng")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("@missing-user.com")).toBe(false);
  });

  test("sendEmail sends mock email in test environment", async () => {
    clearMockEmails();

    const res = await sendEmail({
      to: "parent@example.com",
      subject: "Fee Invoice Ready",
      body: "Your school invoice is ready.",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toContain("resend-mock-");

    const sent = getMockEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("parent@example.com");
    expect(sent[0].subject).toBe("Fee Invoice Ready");
  });

  test("sendBatchEmails dispatches multiple emails", async () => {
    clearMockEmails();

    const results = await sendBatchEmails([
      { to: "p1@example.com", subject: "S1", body: "B1" },
      { to: "p2@example.com", subject: "S2", body: "B2" },
    ]);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(getMockEmails().length).toBe(2);
  });
});

test.describe("Multi-Channel Dispatcher", () => {
  test("defaultNotificationDispatcher dispatches to correct channel adapter", async () => {
    clearMockEmails();
    clearMockTermiiMessages();

    // EMAIL
    const emailRes = await defaultNotificationDispatcher({
      dispatchId: "disp-1",
      branchId: "branch-1",
      channel: NotificationChannel.EMAIL,
      recipientAddress: "test@example.com",
      subject: "Test Email",
      body: "Email body",
    });
    expect(emailRes.success).toBe(true);

    // SMS
    const smsRes = await defaultNotificationDispatcher({
      dispatchId: "disp-2",
      branchId: "branch-1",
      channel: NotificationChannel.SMS,
      recipientAddress: "08012345678",
      body: "SMS body",
    });
    expect(smsRes.success).toBe(true);

    // IN_APP
    const inAppRes = await defaultNotificationDispatcher({
      dispatchId: "disp-3",
      branchId: "branch-1",
      channel: NotificationChannel.IN_APP,
      recipientAddress: "user-123",
      body: "In-app message",
    });
    expect(inAppRes.success).toBe(true);
    expect(inAppRes.externalId).toBe("inapp-disp-3");
  });
});

test.describe("Guardian Magic Link Tokens", () => {
  let branchId: string;
  let studentId: string;

  test.beforeAll(async () => {
    const branch = await seedInstance();
    branchId = branch.id;
    const student = await db.studentRecord.upsert({
      where: { admissionNo: "ADM/COMM/001" },
      update: {},
      create: {
        branchId,
        admissionNo: "ADM/COMM/001",
        firstName: "Zainab",
        lastName: "Ali",
        gender: "FEMALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    });
    studentId = student.id;
  });

  test("generates and verifies guardian magic link token", async () => {
    const link = await generateGuardianMagicLink({
      branchId,
      studentId,
      action: "VIEW_REPORT_CARD",
      channel: NotificationChannel.SMS,
      expiresInMinutes: 60,
    });

    expect(link.token).toBeDefined();
    expect(link.tokenHash).toBeDefined();
    expect(link.token.length).toBe(64);

    const verified = await verifyGuardianMagicLink(link.token, { markUsed: true });
    expect(verified).not.toBeNull();
    expect(verified?.studentId).toBe(studentId);
    expect(verified?.usedAt).toBeDefined();
  });
});
