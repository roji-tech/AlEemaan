import { test, expect } from "@playwright/test";
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  doorFor,
  formatCode,
  hashAccessCode,
  newAccessCode,
  normalizeCode,
  verifyAccessCode,
} from "@/lib/portal/door";
import type { HostInfo } from "@/lib/portals";

// Task 0113 (task 0094 D2, D7, D9): the family sign-in's one door and its access codes. The pure parts: which address means which door, what a code looks like, and how a code is hashed
// and checked (a pupil's code is salted with the pupil, a guardian's with the guardian).

test.describe("the door the address decides", () => {
  test("student. is the pupil, parent. a guardian, the school's own and the staff addresses none; portals off is one address for everyone", () => {
    expect(doorFor({ kind: "portal", portal: "student", root: "x.example" } as HostInfo)).toBe("PUPIL");
    expect(doorFor({ kind: "portal", portal: "parent", root: "x.example" } as HostInfo)).toBe("GUARDIAN");
    expect(doorFor({ kind: "portal", portal: "staff", root: "x.example" } as HostInfo)).toBe("NONE");
    expect(doorFor({ kind: "portal", portal: "admin", root: "x.example" } as HostInfo)).toBe("NONE");
    expect(doorFor({ kind: "apex", root: "x.example" } as HostInfo)).toBe("NONE");
    expect(doorFor({ kind: "off" } as HostInfo)).toBe("ANY");
  });
});

test.describe("a code", () => {
  test("is 8 characters from an alphabet without look-alikes", () => {
    expect(ACCESS_CODE_LENGTH).toBe(8);
    for (const ch of "0O1IL") expect(ACCESS_CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) {
      const code = newAccessCode();
      expect(code).toHaveLength(8);
      for (const ch of code) expect(ACCESS_CODE_ALPHABET).toContain(ch);
    }
  });
  test("is printed as ABCD-EFGH and typed in any case, with or without the dash or spaces", () => {
    expect(formatCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCode(" abcd efgh ")).toBe("ABCDEFGH");
  });
  test("anything that cannot be a code is null, so a date of birth or a phone number is never hashed as one", () => {
    expect(normalizeCode("2013-05-10")).toBeNull();
    expect(normalizeCode("08031234567")).toBeNull();
    expect(normalizeCode("ABCDEFG")).toBeNull();
    expect(normalizeCode("ABCDEFGHJ")).toBeNull();
    expect(normalizeCode("ABCDEFG0")).toBeNull(); // 0 is not in the alphabet
  });
});

test.describe("hashing a code", () => {
  test("verifies the right code, written any way, and refuses a wrong one", () => {
    const hash = hashAccessCode("ABCDEFGH", "stu_1", "pupil");
    expect(hash.startsWith("s1$")).toBe(true);
    expect(verifyAccessCode("ABCD-EFGH", hash, "stu_1", "pupil")).toBe(true);
    expect(verifyAccessCode("abcdefgh", hash, "stu_1", "pupil")).toBe(true);
    expect(verifyAccessCode("ABCDEFGJ", hash, "stu_1", "pupil")).toBe(false);
  });
  test("is salted with its owner: another pupil's or guardian's hash of the same code is different, and does not verify", () => {
    const one = hashAccessCode("ABCDEFGH", "stu_1", "pupil");
    expect(hashAccessCode("ABCDEFGH", "stu_2", "pupil")).not.toBe(one);
    expect(verifyAccessCode("ABCDEFGH", one, "stu_2", "pupil")).toBe(false);
    // The same id as a pupil and as a guardian is two different owners.
    expect(hashAccessCode("ABCDEFGH", "x_1", "guardian")).not.toBe(hashAccessCode("ABCDEFGH", "x_1", "pupil"));
    expect(verifyAccessCode("ABCDEFGH", hashAccessCode("ABCDEFGH", "x_1", "guardian"), "x_1", "pupil")).toBe(false);
  });
  test("nothing stored, an unknown format, or something that is not a code never verifies", () => {
    expect(verifyAccessCode("ABCDEFGH", null, "stu_1", "pupil")).toBe(false);
    expect(verifyAccessCode("ABCDEFGH", "plain", "stu_1", "pupil")).toBe(false);
    expect(verifyAccessCode("2013-05-10", hashAccessCode("ABCDEFGH", "stu_1", "pupil"), "stu_1", "pupil")).toBe(false);
  });
});
