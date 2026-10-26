import { test, expect } from "@playwright/test";
import { cleanSectionName, normaliseScopeSet, scopeKey, SECTION_NAME_MAX } from "../../src/lib/academics/section-rules";

// The pure rules of sections and scopes the superadmin's API and the screen share (task 0039, slice 2b). No server, no database.

test.describe("a section's name", () => {
  test("trimmed, inner spaces collapsed, 1 to 80 characters of text, no control characters", () => {
    expect(cleanSectionName("  Junior   Secondary ")).toBe("Junior Secondary");
    expect(cleanSectionName("a\tb\nc")).toBe("a b c");
    expect(cleanSectionName("x".repeat(SECTION_NAME_MAX))).toHaveLength(SECTION_NAME_MAX);
    for (const bad of ["", "   ", "x".repeat(SECTION_NAME_MAX + 1), "bad\u0000name", "bell\u0007", 5, null, undefined, {}]) {
      expect(cleanSectionName(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

test.describe("the set a superadmin asked for", () => {
  test("a repeat is one entry, the order is fixed, and General cannot sit beside anything", () => {
    const set = normaliseScopeSet([
      { kind: "CLASS", classGroupId: "g2" },
      { kind: "SECTION", sectionId: "s1" },
      { kind: "SECTION", sectionId: "s1" },
      { kind: "CLASS", classGroupId: "g1" },
    ]);
    expect(set).toEqual({ ok: true, scopes: [{ kind: "SECTION", sectionId: "s1" }, { kind: "CLASS", classGroupId: "g1" }, { kind: "CLASS", classGroupId: "g2" }] });
    expect(normaliseScopeSet([{ kind: "GENERAL" }, { kind: "GENERAL" }])).toEqual({ ok: true, scopes: [{ kind: "GENERAL" }] });
    expect(normaliseScopeSet([{ kind: "GENERAL" }, { kind: "SECTION", sectionId: "s1" }])).toEqual({ ok: false, problem: "GENERAL_WITH_OTHERS" });
    expect(normaliseScopeSet([])).toEqual({ ok: true, scopes: [] });
    expect(scopeKey({ kind: "GENERAL" })).toBe("GENERAL");
    expect(scopeKey({ kind: "SECTION", sectionId: "s1" })).toBe("SECTION:s1");
    expect(scopeKey({ kind: "CLASS", classGroupId: "g1" })).toBe("CLASS:g1");
  });
});
