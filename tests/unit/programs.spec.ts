import "../support/env";
import { test, expect } from "@playwright/test";
import {
  MAX_LEVELS,
  addMonths,
  buildTree,
  cleanName,
  effectiveEnabled,
  endDateFor,
  groupPath,
  isEditableStatus,
  parseEnabled,
  parseIsoDate,
  sameName,
  statusAfter,
  toIsoDate,
} from "@/lib/programs/rules";
import {
  createGroupSchema,
  createProgramSchema,
  levelLabelsSchema,
  programsSettingSchema,
  updateGroupSchema,
  updateProgramSchema,
} from "@/lib/programs/validation";

// Programs, slice P1 (task 0043): the pure rules and the request schemas. No database, no server.

const day = (iso: string) => parseIsoDate(iso)!;

test.describe("dates", () => {
  test("a real calendar date parses, an impossible or oddly written one does not", () => {
    expect(toIsoDate(day("2026-11-03"))).toBe("2026-11-03");
    for (const bad of [
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "26-11-03",
      "2026/11/03",
      "2026-11-3",
      "",
      " 2026-11-03",
      "2026-11-03T00:00:00Z",
    ]) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
    expect(parseIsoDate("2028-02-29")).not.toBeNull(); // a leap day
    expect(parseIsoDate("2027-02-29")).toBeNull();
  });

  test("adding months keeps the month end instead of spilling into the next month", () => {
    expect(toIsoDate(addMonths(day("2026-08-31"), 6))).toBe("2027-02-28");
    expect(toIsoDate(addMonths(day("2027-08-31"), 6))).toBe("2028-02-29");
    expect(toIsoDate(addMonths(day("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIsoDate(addMonths(day("2026-11-03"), 14))).toBe("2028-01-03");
    expect(toIsoDate(addMonths(day("2026-12-15"), 1))).toBe("2027-01-15");
  });

  test("the end date of a program is its last day: start + duration - 1 day", () => {
    expect(toIsoDate(endDateFor(day("2026-11-03"), { value: 6, unit: "MONTHS" }))).toBe("2027-05-02");
    expect(toIsoDate(endDateFor(day("2026-11-03"), { value: 3, unit: "YEARS" }))).toBe("2029-11-02");
    expect(toIsoDate(endDateFor(day("2026-11-03"), { value: 5, unit: "YEARS" }))).toBe("2031-11-02");
    expect(toIsoDate(endDateFor(day("2026-01-01"), { value: 1, unit: "YEARS" }))).toBe("2026-12-31");
    expect(toIsoDate(endDateFor(day("2026-08-31"), { value: 6, unit: "MONTHS" }))).toBe("2027-02-27");
  });
});

test.describe("names", () => {
  test("a name is trimmed and its inner spaces collapsed; namesakes differ only by case or spacing", () => {
    expect(cleanName("  Juz   A \t ")).toBe("Juz A");
    expect(sameName("Juz A", " juz   a ")).toBe(true);
    expect(sameName("Juz A", "Juz B")).toBe(false);
  });
});

test.describe("the tree of groups", () => {
  const groups = [
    { id: "a", parentId: null, name: "JSS", sortOrder: 0 },
    { id: "b", parentId: "a", name: "2", sortOrder: 1 },
    { id: "c", parentId: "b", name: "C", sortOrder: 0 },
    { id: "d", parentId: "a", name: "1", sortOrder: 0 },
    { id: "x", parentId: null, name: "Juz A", sortOrder: 1 },
  ];

  test("the path of a group is its names from the top joined by an en dash", () => {
    expect(groupPath(groups, "c")).toBe("JSS–2–C");
    expect(groupPath(groups, "x")).toBe("Juz A");
    expect(groupPath(groups, "missing")).toBe("");
  });

  test("a broken or looping chain is shown by what can be followed, never loops", () => {
    expect(groupPath([{ id: "k", parentId: "gone", name: "Orphan" }], "k")).toBe("Orphan");
    const loop = [
      { id: "p", parentId: "q", name: "P" },
      { id: "q", parentId: "p", name: "Q" },
    ];
    expect(groupPath(loop, "p")).toBe("Q–P");
  });

  test("siblings are ordered by sortOrder, then name, and an orphan is kept at the top", () => {
    const tree = buildTree([...groups, { id: "o", parentId: "gone", name: "Lost", sortOrder: 5 }]);
    expect(tree.map((node) => node.name)).toEqual(["JSS", "Juz A", "Lost"]);
    expect(tree[0]!.children.map((node) => node.name)).toEqual(["1", "2"]);
    expect(tree[0]!.children[1]!.children.map((node) => node.name)).toEqual(["C"]);
  });
});

test.describe("status buttons", () => {
  test("only the buttons that apply lead anywhere, and COMPLETED is never reached from here", () => {
    expect(statusAfter("activate", "DRAFT")).toBe("ACTIVE");
    expect(statusAfter("activate", "ACTIVE")).toBeNull();
    expect(statusAfter("activate", "ARCHIVED")).toBeNull();
    expect(statusAfter("archive", "DRAFT")).toBe("ARCHIVED");
    expect(statusAfter("archive", "ACTIVE")).toBe("ARCHIVED");
    expect(statusAfter("archive", "COMPLETED")).toBeNull();
    expect(statusAfter("archive", "ARCHIVED")).toBeNull();
    expect(statusAfter("restore", "ARCHIVED")).toBe("DRAFT");
    expect(statusAfter("restore", "ACTIVE")).toBeNull();
    for (const action of ["activate", "archive", "restore"] as const) {
      for (const status of ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const) expect(statusAfter(action, status)).not.toBe("COMPLETED");
    }
  });

  test("only a draft or active program can be changed", () => {
    expect(isEditableStatus("DRAFT")).toBe(true);
    expect(isEditableStatus("ACTIVE")).toBe(true);
    expect(isEditableStatus("COMPLETED")).toBe(false);
    expect(isEditableStatus("ARCHIVED")).toBe(false);
  });
});

test.describe("the programs switch", () => {
  test("a branch takes part only if the school AND the branch have it on; nothing stored is on", () => {
    expect(effectiveEnabled(undefined, undefined)).toBe(true);
    expect(effectiveEnabled(true, undefined)).toBe(true);
    expect(effectiveEnabled(true, true)).toBe(true);
    expect(effectiveEnabled(false, undefined)).toBe(false);
    expect(effectiveEnabled(false, true)).toBe(false); // a branch can never widen the school's "off"
    expect(effectiveEnabled(true, false)).toBe(false);
    expect(effectiveEnabled(undefined, false)).toBe(false);
  });

  test("a stored value that is not a boolean is ignored, never trusted", () => {
    expect(parseEnabled(true)).toBe(true);
    expect(parseEnabled(false)).toBe(false);
    for (const odd of ["true", 1, 0, null, undefined, {}, [], "off"]) expect(parseEnabled(odd), String(odd)).toBeUndefined();
  });
});

test.describe("request schemas", () => {
  const base = { name: "Quran memorisation", kind: "ONGOING", branchIds: ["b1"], levelLabels: ["Juz", "Group"] };

  test("an ongoing program with a branch and level names is accepted; names are cleaned", () => {
    const parsed = createProgramSchema.parse({ ...base, name: "  Quran   memorisation " });
    expect(parsed.name).toBe("Quran memorisation");
    expect(parsed.levelLabels).toEqual(["Juz", "Group"]);
  });

  test("a program for a period needs a start and a duration or an end, not both", () => {
    const fixed = { ...base, kind: "FIXED_TERM" };
    expect(createProgramSchema.safeParse(fixed).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03" }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", duration: { value: 6, unit: "MONTHS" } }).success).toBe(true);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2027-05-02" }).success).toBe(true);
    expect(
      createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2027-05-02", duration: { value: 6, unit: "MONTHS" } })
        .success,
    ).toBe(false);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2026-11-03" }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2026-10-01" }).success).toBe(false);
  });

  test("a program that never ends has no end date or duration", () => {
    expect(createProgramSchema.safeParse({ ...base, endsOn: "2027-01-01" }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, duration: { value: 1, unit: "YEARS" } }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, startsOn: "2026-11-03" }).success).toBe(true);
  });

  test("a program has at least one branch or a branch of its own, and no branch twice", () => {
    expect(createProgramSchema.safeParse({ ...base, branchIds: [] }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, branchIds: [], ownBranch: { name: "Daarul-Hadeeth" } }).success).toBe(true);
    expect(createProgramSchema.safeParse({ ...base, branchIds: ["b1", "b1"] }).success).toBe(false);
  });

  test("unknown keys are refused, not ignored (no mass assignment)", () => {
    expect(createProgramSchema.safeParse({ ...base, status: "ACTIVE" }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, createdByUserId: "x" }).success).toBe(false);
    expect(updateProgramSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
    expect(updateProgramSchema.safeParse({ kind: "FIXED_TERM" }).success).toBe(false);
    expect(updateProgramSchema.safeParse({}).success).toBe(false);
  });

  test("bad names are refused: empty, too long, a control character", () => {
    expect(createProgramSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, name: "Quran\u0007" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "g".repeat(61) }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "Juz A", parentId: "../../etc" }).success).toBe(false);
  });

  test("level names: 1 to 4, each different, each short", () => {
    expect(levelLabelsSchema.safeParse([]).success).toBe(false);
    expect(levelLabelsSchema.safeParse(Array.from({ length: MAX_LEVELS }, (_, i) => `L${i}`)).success).toBe(true);
    expect(levelLabelsSchema.safeParse(Array.from({ length: MAX_LEVELS + 1 }, (_, i) => `L${i}`)).success).toBe(false);
    expect(levelLabelsSchema.safeParse(["Class", "class"]).success).toBe(false);
    expect(levelLabelsSchema.safeParse(["x".repeat(41)]).success).toBe(false);
  });

  test("a group change is exactly one of a name, a move or archived", () => {
    expect(updateGroupSchema.safeParse({ name: "Juz B" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ move: "up" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ move: "sideways" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ name: "x", archived: true }).success).toBe(false);
    expect(updateGroupSchema.safeParse({}).success).toBe(false);
  });

  test("the setting names a branch only for a branch value", () => {
    expect(programsSettingSchema.safeParse({ scope: "GLOBAL", enabled: false }).success).toBe(true);
    expect(programsSettingSchema.safeParse({ scope: "GLOBAL", branchId: "b1", enabled: false }).success).toBe(false);
    expect(programsSettingSchema.safeParse({ scope: "BRANCH", enabled: false }).success).toBe(false);
    expect(programsSettingSchema.safeParse({ scope: "BRANCH", branchId: "b1", enabled: null }).success).toBe(true);
    expect(programsSettingSchema.safeParse({ scope: "BRANCH", branchId: "b1", enabled: "no" }).success).toBe(false);
  });
});
