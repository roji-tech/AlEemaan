import { test, expect } from "@playwright/test";
import {
  buildCoverage,
  cleanTemplateName,
  diffClasses,
  idsInSection,
  mergeLayoutOptions,
  movePreview,
  rangeSelection,
  resolveTemplateId,
  schemeSource,
  sortClasses,
  type Assignment,
  type ClassRef,
  type TemplateRef,
} from "@/lib/results/templates-rules";
import { setClassTemplate } from "@/components/results/template-calls";
import { moveLines } from "@/components/results/template-types";

// Task 0116: result templates, the pure rules. The maintainer's scenario (2026-11-19) is the fixture: template A for Prep A, Prep B and Nur 1; B for Nur 2 and Basic 1 to 5; C for Basic 6 and
// JSS 1 to 3; D for SSS 1 and 2; E for SSS 3. No server, no database.

const CLASS_NAMES = [
  "Prep A",
  "Prep B",
  "Nur 1",
  "Nur 2",
  "Basic 1",
  "Basic 2",
  "Basic 3",
  "Basic 4",
  "Basic 5",
  "Basic 6",
  "JSS 1",
  "JSS 2",
  "JSS 3",
  "SSS 1",
  "SSS 2",
  "SSS 3",
];
const classes: ClassRef[] = CLASS_NAMES.map((name, i) => ({
  id: `c-${name.replace(/\s+/g, "").toLowerCase()}`,
  name,
  sortOrder: i,
  sectionId: name.startsWith("JSS") ? "sec-jss" : name.startsWith("SSS") ? "sec-sss" : null,
  sectionName: name.startsWith("JSS") ? "JSS" : name.startsWith("SSS") ? "SSS" : null,
}));
const id = (name: string) => classes.find((c) => c.name === name)!.id;
const templates: TemplateRef[] = ["A", "B", "C", "D", "E"].map((n, i) => ({ id: `t-${n}`, name: `Template ${n}`, isDefault: i === 0 }));
const place = (templateId: string, ...names: string[]): Assignment[] => names.map((n) => ({ classGroupId: id(n), templateId }));
const scenario: Assignment[] = [
  ...place("t-A", "Prep A", "Prep B", "Nur 1"),
  ...place("t-B", "Nur 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5"),
  ...place("t-C", "Basic 6", "JSS 1", "JSS 2", "JSS 3"),
  ...place("t-D", "SSS 1", "SSS 2"),
  ...place("t-E", "SSS 3"),
];

test.describe("which template a class uses", () => {
  test("the one it was placed in, else the default, else nothing when the branch has none", () => {
    expect(resolveTemplateId(scenario, "t-A", id("Basic 3"))).toBe("t-B");
    expect(resolveTemplateId(scenario, "t-A", id("SSS 3"))).toBe("t-E");
    expect(resolveTemplateId([], "t-A", id("Basic 3"))).toBe("t-A"); // nobody placed it: the default
    expect(resolveTemplateId([], null, id("Basic 3"))).toBeNull();
  });

  test("the maintainer's scenario: every class has a template and none is unplaced", () => {
    const { rows, unplaced } = buildCoverage(classes, scenario, templates);
    expect(unplaced).toBe(0);
    expect(rows).toHaveLength(16);
    expect(Object.fromEntries(rows.map((r) => [r.name, r.templateName]))).toMatchObject({
      "Prep B": "Template A",
      "Nur 2": "Template B",
      "Basic 5": "Template B",
      "Basic 6": "Template C",
      "JSS 3": "Template C",
      "SSS 2": "Template D",
      "SSS 3": "Template E",
    });
    expect(rows.every((r) => r.explicit)).toBe(true);
  });

  test("a class nobody placed uses the default and is counted; a scattered assignment works the same", () => {
    // Scattered: Template B holds Prep B, Basic 2 and SSS 1 and nothing else; the default (A) takes the rest.
    const scattered = place("t-B", "Prep B", "Basic 2", "SSS 1");
    const { rows, unplaced } = buildCoverage(classes, scattered, templates);
    expect(unplaced).toBe(13);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName["Prep B"]).toMatchObject({ templateName: "Template B", explicit: true });
    expect(byName["Basic 3"]).toMatchObject({ templateName: "Template A", explicit: false });
    expect(byName["SSS 1"].templateId).toBe("t-B");
  });

  test("an assignment to a template that is not in the list (archived) counts as not placed", () => {
    const { rows, unplaced } = buildCoverage(classes, place("t-gone", "Nur 1"), templates);
    expect(rows.find((r) => r.name === "Nur 1")).toMatchObject({ templateId: "t-A", explicit: false });
    expect(unplaced).toBe(16);
  });

  test("a class's own scheme is carried so the table can say it is used instead", () => {
    const { rows } = buildCoverage(classes, scenario, templates, { [id("JSS 1")]: { id: "s1", name: "JSS scheme" } });
    expect(rows.find((r) => r.name === "JSS 1")?.ownScheme).toEqual({ id: "s1", name: "JSS scheme" });
    expect(rows.find((r) => r.name === "JSS 2")?.ownScheme).toBeNull();
    expect(schemeSource({ name: "JSS scheme" }, { name: "B scheme" })).toBe("its own scheme, JSS scheme");
    expect(schemeSource(null, { name: "B scheme" })).toBe("the template's scheme, B scheme");
    expect(schemeSource(null, null)).toBe("the branch's default scheme");
  });
});

test.describe("the list's order and picking classes", () => {
  test("sort order first, then the name with numbers read as numbers", () => {
    const shuffled = [
      { id: "1", name: "Basic 10", sortOrder: 0 },
      { id: "2", name: "Basic 2", sortOrder: 0 },
      { id: "3", name: "Basic 1", sortOrder: 0 },
      { id: "4", name: "Nursery", sortOrder: -1 },
    ];
    expect(sortClasses(shuffled).map((c) => c.name)).toEqual(["Nursery", "Basic 1", "Basic 2", "Basic 10"]);
  });

  test("a range is every class between two, both ends in, in either order; an unknown end gives nothing", () => {
    const ordered = classes.map((c) => ({ id: c.id }));
    expect(rangeSelection(ordered, id("Basic 1"), id("Basic 5"))).toEqual(["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5"].map(id));
    expect(rangeSelection(ordered, id("Basic 5"), id("Basic 1"))).toEqual(["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5"].map(id));
    expect(rangeSelection(ordered, id("SSS 3"), id("SSS 3"))).toEqual([id("SSS 3")]);
    expect(rangeSelection(ordered, id("Basic 1"), "nope")).toEqual([]);
  });

  test("all the classes of a section; classes in no section are never picked by it", () => {
    expect(idsInSection(classes, "sec-jss")).toEqual(["JSS 1", "JSS 2", "JSS 3"].map(id));
    expect(idsInSection(classes, "sec-none")).toEqual([]);
  });
});

test.describe("moving classes", () => {
  test("only classes that are in ANOTHER template are a move; one already there or in none is not", () => {
    const moves = movePreview(scenario, templates, classes, "t-C", [id("Basic 5"), id("Basic 6"), id("SSS 3")]);
    expect(moves.map((m) => [m.className, m.fromTemplateName])).toEqual([
      ["Basic 5", "Template B"],
      ["SSS 3", "Template E"],
    ]); // Basic 6 is already in C
    expect(movePreview([], templates, classes, "t-C", [id("Basic 5")])).toEqual([]); // nobody placed it: nothing leaves anywhere
  });

  test("the set a template ends up with: who is added, who goes back to the default, who stays", () => {
    expect(diffClasses(["a", "b", "c"], ["b", "c", "d", "d"])).toEqual({ add: ["d"], drop: ["a"], keep: ["b", "c"] });
    expect(diffClasses([], [])).toEqual({ add: [], drop: [], keep: [] });
  });

  test("the screen's lines for a refused move come from the answer's details", () => {
    expect(
      moveLines({ ok: false, status: 409, code: "CONFIRM_MOVES", details: [{ path: "x", message: "Basic 5 leaves Template B" }] }),
    ).toEqual(["Basic 5 leaves Template B"]);
    expect(moveLines({ ok: false, status: 409, code: "CONFLICT", details: [{ path: "x", message: "ignored" }] })).toEqual([]);
  });
});

test.describe("names and looks", () => {
  test("a name is trimmed and collapsed, 1 to 60 characters", () => {
    expect(cleanTemplateName("  Nursery   and   Prep ")).toBe("Nursery and Prep");
    expect(cleanTemplateName("   ")).toBeNull();
    expect(cleanTemplateName("x".repeat(60))).toHaveLength(60);
    expect(cleanTemplateName("x".repeat(61))).toBeNull();
  });

  test("a template's look is the layout's options with the template's choices on top; only known true/false keys count", () => {
    expect(mergeLayoutOptions({ logo: true, signatureLine: true, nextTermDate: true }, { signatureLine: false })).toEqual({
      logo: true,
      signatureLine: false,
      nextTermDate: true,
    });
    expect(mergeLayoutOptions({ logo: true }, { logo: "no", other: true, nextTermDate: true })).toEqual({ logo: true, nextTermDate: true });
    expect(mergeLayoutOptions(null, null)).toEqual({});
  });
});

test.describe("placing one class from the Classes tab (the calls it makes)", () => {
  // The helper builds the template's WHOLE new set for the API; it is checked here without a server by replacing fetch.
  const data = {
    templates: [
      {
        id: "t-A",
        name: "A",
        description: null,
        isDefault: true,
        archived: false,
        layoutCode: null,
        layoutOptions: null,
        scheme: null,
        gradeScale: null,
        classGroupIds: ["x", "y"],
      },
      {
        id: "t-B",
        name: "B",
        description: null,
        isDefault: false,
        archived: false,
        layoutCode: null,
        layoutOptions: null,
        scheme: null,
        gradeScale: null,
        classGroupIds: ["z"],
      },
    ],
    classes: [],
    coverage: [],
    unplaced: 0,
    choices: { layouts: [], schemes: [], scales: [] },
  };
  async function capture(run: () => Promise<unknown>) {
    const seen: { url: string; body: unknown }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ data: {}, error: null }), { status: 200 });
    }) as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
    return seen;
  }

  test("into a template: its set plus the class; confirmMoves only when asked", async () => {
    const seen = await capture(() => setClassTemplate(data, "q", "t-B", true));
    expect(seen).toEqual([{ url: "/api/v1/results/templates/t-B/classes", body: { classGroupIds: ["z", "q"], confirmMoves: true } }]);
  });

  test("back to the default: the template that holds it, without it; a class in none makes no call", async () => {
    expect(await capture(() => setClassTemplate(data, "y", null, false))).toEqual([
      { url: "/api/v1/results/templates/t-A/classes", body: { classGroupIds: ["x"], confirmMoves: true } },
    ]);
    expect(await capture(() => setClassTemplate(data, "nobody", null, false))).toEqual([]);
  });
});
