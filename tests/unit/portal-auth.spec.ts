import { test, expect } from "@playwright/test";
import {
  signPortalSession,
  verifyPortalSession,
  normalizePhone,
  matchesPhone,
  matchesDateOfBirth,
  PortalSessionPayload,
} from "@/lib/portal/auth";

test.describe("Portal Auth & Security Rules", () => {
  test.describe("HMAC Session Signing & Verification", () => {
    test("round-trips a valid portal session payload", () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: PortalSessionPayload = {
        primaryStudentId: "student-123",
        allowedStudentIds: ["student-123", "student-456"],
        guardianPhone: "+2348012345678",
        guardianEmail: "parent@example.com",
        issuedAt: now,
        expiresAt: now + 3600,
      };

      const token = signPortalSession(payload);
      expect(typeof token).toBe("string");
      expect(token).toContain(".");

      const verified = verifyPortalSession(token);
      expect(verified).not.toBeNull();
      expect(verified?.primaryStudentId).toBe("student-123");
      expect(verified?.allowedStudentIds).toEqual(["student-123", "student-456"]);
      expect(verified?.guardianPhone).toBe("+2348012345678");
    });

    test("rejects a tampered payload or signature", () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: PortalSessionPayload = {
        primaryStudentId: "student-123",
        allowedStudentIds: ["student-123"],
        issuedAt: now,
        expiresAt: now + 3600,
      };

      const token = signPortalSession(payload);
      const [data, sig] = token.split(".");

      // Tamper signature
      const tamperedSig = sig.slice(0, -2) + "xx";
      expect(verifyPortalSession(`${data}.${tamperedSig}`)).toBeNull();

      // Tamper payload data
      const tamperedData = Buffer.from(
        JSON.stringify({ ...payload, primaryStudentId: "student-hacked" })
      ).toString("base64url");
      expect(verifyPortalSession(`${tamperedData}.${sig}`)).toBeNull();
    });

    test("rejects an expired session token", () => {
      const past = Math.floor(Date.now() / 1000) - 100;
      const payload: PortalSessionPayload = {
        primaryStudentId: "student-123",
        allowedStudentIds: ["student-123"],
        issuedAt: past - 3600,
        expiresAt: past,
      };

      const token = signPortalSession(payload);
      expect(verifyPortalSession(token)).toBeNull();
    });

    test("rejects malformed token strings", () => {
      expect(verifyPortalSession("")).toBeNull();
      expect(verifyPortalSession("invalid")).toBeNull();
      expect(verifyPortalSession("a.b.c")).toBeNull();
      expect(verifyPortalSession(undefined)).toBeNull();
    });
  });

  test.describe("Phone Verification Rules", () => {
    test("normalizes phone formats correctly", () => {
      expect(normalizePhone("+234 803 123 4567")).toBe("+2348031234567");
      expect(normalizePhone("0803-123-4567")).toBe("08031234567");
      expect(normalizePhone("(080) 3123.4567")).toBe("08031234567");
    });

    test("matches phone numbers by full value or suffix", () => {
      const target = "+2348031234567";
      expect(matchesPhone("08031234567", target)).toBe(true);
      expect(matchesPhone("+234 803 123 4567", target)).toBe(true);
      expect(matchesPhone("4567", target)).toBe(true);
      expect(matchesPhone("9999", target)).toBe(false);
      expect(matchesPhone("", target)).toBe(false);
      expect(matchesPhone("123", target)).toBe(false); // Less than 4 digits
    });
  });

  test.describe("Date of Birth Verification Rules", () => {
    test("matches ISO YYYY-MM-DD and DD/MM/YYYY formats", () => {
      const dob = new Date("2012-05-18T00:00:00Z");
      expect(matchesDateOfBirth("2012-05-18", dob)).toBe(true);
      expect(matchesDateOfBirth("18/05/2012", dob)).toBe(true);
      expect(matchesDateOfBirth("18-05-2012", dob)).toBe(true);
      expect(matchesDateOfBirth("2012-05-19", dob)).toBe(false);
      expect(matchesDateOfBirth("random", dob)).toBe(false);
    });
  });
});
