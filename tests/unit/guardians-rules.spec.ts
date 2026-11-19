import { test, expect } from "@playwright/test";
import {
  cleanEmail,
  cleanPhone,
  guardianQuery,
  maySeeGuardian,
  mayActForGuardian,
  mayManageLink,
  mirrorOf,
  phoneKey,
  sameName,
  type MirrorLink,
} from "@/lib/guardians/rules";
import { EVERY_BRANCH, type AdminScope } from "@/lib/auth/branch-access";

// Task 0113, the pure rules of guardians as records of their own: how a phone and an e-mail are kept, which guardian a pupil's old columns mirror, and who may do what.

const link = (name: string, over: Partial<MirrorLink> = {}, guardian: Partial<MirrorLink["guardian"]> = {}): MirrorLink => ({
  isMain: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  blockedAt: null,
  guardian: { name, phone: `+234${name.length}`, email: `${name.toLowerCase()}@x.example`, archivedAt: null, ...guardian },
  ...over,
});
const branchAdmin = (...branchIds: string[]): AdminScope => ({ superAdmin: false, branchIds });

test.describe("phone and e-mail as kept", () => {
  test("a phone loses spaces, dashes, brackets and dots, and keeps the digits and a leading +", () => {
    expect(cleanPhone("+234 803-123 (4567)")).toBe("+2348031234567");
    expect(cleanPhone("0803.123.4567")).toBe("08031234567");
    expect(cleanPhone("  ")).toBeNull();
    expect(cleanPhone(null)).toBeNull();
  });
  test("an e-mail is trimmed and lower case; blank is none", () => {
    expect(cleanEmail("  Amina.Yusuf@School.ORG ")).toBe("amina.yusuf@school.org");
    expect(cleanEmail("")).toBeNull();
    expect(cleanEmail(undefined)).toBeNull();
  });
  test("0803... and +234803... are one number; a short or empty one is none", () => {
    expect(phoneKey("08031234567")).toBe("8031234567");
    expect(phoneKey("+234 803 123 4567")).toBe("8031234567");
    expect(phoneKey("2348031234567")).toBe("8031234567");
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
  test("two names are the same guardian's ignoring case and repeated spaces", () => {
    expect(sameName("  Mrs  Amina   Yusuf", "mrs amina yusuf")).toBe(true);
    expect(sameName("Amina Yusuf", "Amina Yusufu")).toBe(false);
  });
});

test.describe("the mirror: what a pupil's old guardian columns hold", () => {
  test("the main contact first, then the earliest linked", () => {
    const a = link("Ada", { createdAt: new Date("2026-01-02T00:00:00Z") });
    const b = link("Bola", { createdAt: new Date("2026-01-01T00:00:00Z") });
    const main = link("Chidi", { isMain: true, createdAt: new Date("2026-01-03T00:00:00Z") });
    expect(mirrorOf([a, b, main]).guardianName).toBe("Chidi");
    expect(mirrorOf([a, b]).guardianName).toBe("Bola");
  });
  test("a blocked or archived guardian is never the contact; with none allowed the columns are empty", () => {
    const blocked = link("Ada", { isMain: true, blockedAt: new Date() });
    const archived = link("Bola", {}, { archivedAt: new Date() });
    const fine = link("Chidi");
    expect(mirrorOf([blocked, archived, fine]).guardianName).toBe("Chidi");
    expect(mirrorOf([blocked, archived])).toEqual({ guardianName: null, guardianPhone: null, guardianEmail: null });
    expect(mirrorOf([])).toEqual({ guardianName: null, guardianPhone: null, guardianEmail: null });
  });
  test("it carries the guardian's phone and e-mail as kept", () => {
    const m = mirrorOf([link("Ada", { isMain: true }, { phone: "+2348031234567", email: "ada@x.example" })]);
    expect(m).toEqual({ guardianName: "Ada", guardianPhone: "+2348031234567", guardianEmail: "ada@x.example" });
  });
});

test.describe("who may do what (task 0113 D4)", () => {
  test("see a guardian: a superadmin, or an administrator of at least one branch a child is in", () => {
    expect(maySeeGuardian(EVERY_BRANCH, ["b1"])).toBe(true);
    expect(maySeeGuardian(branchAdmin("b1"), ["b1", "b2"])).toBe(true);
    expect(maySeeGuardian(branchAdmin("b3"), ["b1", "b2"])).toBe(false);
  });
  test("edit details or make the code: a superadmin, or an administrator of EVERY branch the children are in", () => {
    expect(mayActForGuardian(EVERY_BRANCH, ["b1", "b2"])).toBe(true);
    expect(mayActForGuardian(branchAdmin("b1", "b2"), ["b1", "b2"])).toBe(true);
    expect(mayActForGuardian(branchAdmin("b1"), ["b1", "b2"])).toBe(false);
    expect(mayActForGuardian(branchAdmin("b1"), ["b1"])).toBe(true);
  });
  test("a guardian with no child is a superadmin's", () => {
    expect(mayActForGuardian(branchAdmin("b1"), [])).toBe(false);
    expect(mayActForGuardian(EVERY_BRANCH, [])).toBe(true);
  });
  test("link, unlink, block or unblock: a superadmin or an administrator of the child's branch", () => {
    expect(mayManageLink(branchAdmin("b1"), "b1")).toBe(true);
    expect(mayManageLink(branchAdmin("b1"), "b2")).toBe(false);
    expect(mayManageLink(EVERY_BRANCH, "b2")).toBe(true);
  });
});

test.describe("the search box", () => {
  test("a name stays text; a phone in any form becomes its national digits (at least 3)", () => {
    expect(guardianQuery("  Amina ")).toEqual({ text: "Amina", digits: null });
    expect(guardianQuery("0803 123")).toEqual({ text: "0803 123", digits: "803123" });
    expect(guardianQuery("+234 803 123 4567").digits).toBe("8031234567");
    expect(guardianQuery("12").digits).toBeNull();
    expect(guardianQuery("amina2026").digits).toBeNull();
  });
  test("an over-long search is cut", () => {
    expect(guardianQuery("x".repeat(500)).text).toHaveLength(100);
  });
});
