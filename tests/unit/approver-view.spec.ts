import { test, expect } from "@playwright/test";
import { describeScope, describeScopes, heldEntries, placementTargets, roleLabel, sameEntries, scopeEntries, wordsFor } from "../../src/lib/academics/approver-view";
import type { ClassGroupView, ScopeView, SectionView } from "../../src/lib/academics/approver-settings";
import type { ScopeEntry } from "../../src/lib/academics/section-rules";

// What the Results approval tab decides without a browser (task 0039, slice 3). No server, no database.

const section = (id: string, name: string, archived = false): SectionView => ({ id, name, sortOrder: 0, archived, classGroups: [] });
const group = (id: string, name: string, sectionId: string | null = null): ClassGroupView => ({ id, name, sectionId });
const scope = (kind: ScopeView["kind"], over: Partial<ScopeView> = {}): ScopeView => ({ kind, sectionId: null, sectionName: null, classGroupId: null, classGroupName: null, ...over });

test.describe("where a class can be moved", () => {
  const sections = [section("s1", "Primary"), section("s2", "JSS"), section("s3", "Old", true)];
  test("every live section except the one it is in; never an archived one", () => {
    expect(placementTargets(group("g1", "JSS 1", "s2"), sections).map((s) => s.id)).toEqual(["s1"]);
    expect(placementTargets(group("g2", "SSS 1"), sections).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(placementTargets(group("g3", "X"), [section("s9", "Old", true)])).toEqual([]);
  });
});

test.describe("the words for scopes", () => {
  test("one scope, and a set in the order it is kept; no scope is Nothing", () => {
    expect(describeScope(scope("GENERAL"))).toBe("Everything");
    expect(describeScope(scope("SECTION", { sectionId: "s1", sectionName: "Primary" }))).toBe("Section: Primary");
    expect(describeScope(scope("CLASS", { classGroupId: "g1", classGroupName: "JSS 1" }))).toBe("Class: JSS 1");
    expect(describeScope(scope("SECTION"))).toBe("Section: unknown");
    expect(describeScopes([])).toBe("Nothing");
    expect(describeScopes([scope("SECTION", { sectionId: "s1", sectionName: "Primary" }), scope("CLASS", { classGroupId: "g1", classGroupName: "JSS 1" })])).toBe("Section: Primary, Class: JSS 1");
    expect(roleLabel("TEACHING_STAFF")).toBe("Teaching staff");
    expect(roleLabel("ADMIN")).toBe("Admin");
  });

  test("the words for what the editor would save", () => {
    const sections = [section("s1", "Primary")];
    const groups = [group("g1", "JSS 1")];
    expect(wordsFor([], sections, groups)).toBe("Nothing");
    expect(wordsFor([{ kind: "GENERAL" }], sections, groups)).toBe("Everything");
    expect(wordsFor([{ kind: "SECTION", sectionId: "s1" }, { kind: "CLASS", classGroupId: "g1" }], sections, groups)).toBe("Section: Primary, Class: JSS 1");
    expect(wordsFor([{ kind: "CLASS", classGroupId: "gone" }], sections, groups)).toBe("Class: unknown");
  });
});

test.describe("entries", () => {
  test("General stands alone; otherwise sections then classes, each by id; what a person holds comes back the same", () => {
    expect(scopeEntries(true, ["s2"], ["g1"])).toEqual([{ kind: "GENERAL" }]);
    expect(scopeEntries(false, ["s2", "s1"], ["g2", "g1"])).toEqual([
      { kind: "SECTION", sectionId: "s1" },
      { kind: "SECTION", sectionId: "s2" },
      { kind: "CLASS", classGroupId: "g1" },
      { kind: "CLASS", classGroupId: "g2" },
    ]);
    expect(scopeEntries(false, [], [])).toEqual([]);
    const held = heldEntries([scope("CLASS", { classGroupId: "g2" }), scope("SECTION", { sectionId: "s1" })]);
    expect(held).toEqual([{ kind: "SECTION", sectionId: "s1" }, { kind: "CLASS", classGroupId: "g2" }]);
    expect(heldEntries([scope("GENERAL"), scope("SECTION", { sectionId: "s1" })])).toEqual([{ kind: "GENERAL" }]);
  });

  test("two lists are the same only when every entry matches in order", () => {
    const a: ScopeEntry[] = [{ kind: "SECTION", sectionId: "s1" }, { kind: "CLASS", classGroupId: "g1" }];
    expect(sameEntries(a, [...a])).toBe(true);
    expect(sameEntries(a, [a[0]])).toBe(false);
    expect(sameEntries(a, [a[1], a[0]])).toBe(false);
    expect(sameEntries([], [])).toBe(true);
    expect(sameEntries([{ kind: "SECTION", sectionId: "x" }], [{ kind: "CLASS", classGroupId: "x" }])).toBe(false);
  });
});
