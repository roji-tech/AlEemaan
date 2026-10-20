import "../support/env";
import { test, expect } from "@playwright/test";
import { UNUSABLE_PATH_VALUE_STAND_IN, hasUnusablePathParam, isPlausibleId, isUnusablePathValue, sanitizePathParams } from "@/lib/api/ids";
import { hasForbiddenCharacters, idSchema } from "@/lib/question-bank/validation";

// An id from a request must be the shape of a cuid before it reaches a query: a NUL byte in a parameter is a Postgres error, so the request would end as a 500 instead
// of "not found" (found by fuzzing the branch gate, 2026-10-19). And a label may not hide a character that makes two different labels look alike.

test.describe("isPlausibleId and idSchema", () => {
  test("a cuid, a seeded-style id and a hyphenated test id are fine", () => {
    for (const id of ["cmgx1y2z30000abcd1234efgh", "a", "A_b-9", "no-such-branch", "x".repeat(64)]) {
      expect(isPlausibleId(id), id).toBe(true);
      expect(idSchema.safeParse(id).success, id).toBe(true);
    }
  });

  test("anything else is refused, including every way to smuggle a NUL byte", () => {
    for (const id of [
      "",
      " ",
      "a b",
      "a\u0000",
      "\u0000",
      "a\u0000b",
      "a/b",
      "a.b",
      "../x",
      "é",
      "a\n",
      "%00",
      "a;b",
      "a'b",
      'a"b',
      "a\\b",
      "x".repeat(65),
      "😀",
      "\ud800",
    ]) {
      expect(isPlausibleId(id), JSON.stringify(id)).toBe(false);
      expect(idSchema.safeParse(id).success, JSON.stringify(id)).toBe(false);
    }
    for (const value of [undefined, null, 1, {}, [], ["a"], true, Symbol("x")]) expect(isPlausibleId(value as never)).toBe(false);
  });
});

test.describe("hasForbiddenCharacters", () => {
  test("ordinary names, in any script, are allowed", () => {
    for (const text of ["Mathematics", "Maths & English", "الرياضيات", "Математика", "Français 2", "JSS-1 (Science)", "O'Level"]) {
      expect(hasForbiddenCharacters(text), text).toBe(false);
    }
  });

  test("control, zero-width, bidi, private-use and lone-surrogate characters are forbidden", () => {
    for (const text of ["a\u0000b", "a\u0007", "a​b", "a‍b", "‮abc", "a﻿b", "ab", "a\ud800b", "a\u007fb", "a\u0085b"]) {
      expect(hasForbiddenCharacters(text), JSON.stringify(text)).toBe(true);
    }
  });
});

test.describe("path values (applied to every dynamic route by withAuth)", () => {
  test("ordinary values pass: cuids, admission numbers, dates, codes, accented and Arabic text", () => {
    for (const v of ["cmgx1y2z30000abcd1234efgh", "2026/001", "2026-10-19", "ABC.123", "é", "الرياضيات", "😀", "a b", "x".repeat(256)]) {
      expect(isUnusablePathValue(v), JSON.stringify(v)).toBe(false);
    }
  });

  test("a NUL byte, any control character, DEL, an unpaired surrogate and 257 characters are refused", () => {
    for (const v of ["\u0000", "a\u0000b", "\u0001", "\u001f", "\u007f", "\n", "\t", "\u0085", "\ud800", "a\udc00b", "x".repeat(257)]) {
      expect(isUnusablePathValue(v), JSON.stringify(v)).toBe(true);
    }
  });

  test("params: every value is checked, including each part of a catch-all; no params, null and odd shapes are fine", () => {
    expect(hasUnusablePathParam({ id: "ok", other: "fine" })).toBe(false);
    expect(hasUnusablePathParam({ id: "ok", other: "a\u0000" })).toBe(true);
    expect(hasUnusablePathParam({ path: ["a", "b"] })).toBe(false);
    expect(hasUnusablePathParam({ path: ["a", "b\u0000"] })).toBe(true);
    for (const odd of [undefined, null, {}, "text", 5, [], { id: 5 }, { id: null }, { id: [5] }]) {
      expect(hasUnusablePathParam(odd)).toBe(false);
    }
  });

  test("sanitizePathParams replaces only the unusable values, keeps the rest, and returns the same object when nothing changes", () => {
    const fine = { id: "abc", day: "2026-10-19" };
    expect(sanitizePathParams(fine)).toBe(fine);
    expect(sanitizePathParams({ id: "a\u0000b", day: "2026-10-19" })).toEqual({ id: UNUSABLE_PATH_VALUE_STAND_IN, day: "2026-10-19" });
    expect(sanitizePathParams({ path: ["ok", "x".repeat(300), "fine"] })).toEqual({ path: ["ok", UNUSABLE_PATH_VALUE_STAND_IN, "fine"] });
    for (const odd of [undefined, null, "text", 5]) expect(sanitizePathParams(odd)).toBe(odd);
    // the stand-in is itself a usable value (no loop) and is not a plausible-looking id of anything real
    expect(isUnusablePathValue(UNUSABLE_PATH_VALUE_STAND_IN)).toBe(false);
  });
});
