import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  KEY_PATTERN,
  checkDefinition,
  definitionSchema,
  rowState,
  schoolTemplateInput,
  sharedNameClashes,
  skippedBySync,
  slugKey,
  syncInput,
  type Definition,
} from "@/lib/results/school-templates-rules";
import { SCHOOL_SEEDS } from "@/lib/results/school-seeds";
import { schoolSeedId, slugKey as seedSlugKey } from "@/lib/results/school-template-seed";

// School-wide result templates (task 0120), the pure rules and the seed data.

const base = (): Definition => JSON.parse(JSON.stringify(SCHOOL_SEEDS[2].definition));

test.describe("keys", () => {
  test("slugKey: lower-case, one dash for anything else, no dash at the ends, at most 40 characters", () => {
    expect(slugKey("Co-operation with others")).toBe("co-operation-with-others");
    expect(slugKey("Speaking / hand writing")).toBe("speaking-hand-writing");
    expect(slugKey("  Drawing and painting!! ")).toBe("drawing-and-painting");
    expect(slugKey("x".repeat(60))).toHaveLength(40);
    expect(slugKey("a".repeat(39) + " b")).toBe("a".repeat(39)); // no dash left at the end after the cut
  });
  test("the rules' slugKey and the seed module's agree on every seeded trait name and on awkward text", () => {
    const names = [
      "Co-operation with others",
      "Speaking / hand writing",
      "  Drawing and painting!! ",
      "x".repeat(60),
      "a".repeat(39) + " b",
      "Ünïcode name",
    ];
    for (const s of SCHOOL_SEEDS) for (const g of s.definition.groups) for (const t of g.traits) names.push(t.name);
    for (const n of names) expect(slugKey(n), n).toBe(seedSlugKey(n));
  });
  test("every seeded group and trait key is a valid key and unique in its place", () => {
    for (const s of SCHOOL_SEEDS) {
      const groupKeys = s.definition.groups.map((g) => g.key);
      expect(new Set(groupKeys).size).toBe(groupKeys.length);
      for (const g of s.definition.groups) {
        expect(KEY_PATTERN.test(g.key), g.key).toBe(true);
        const keys = g.traits.map((t) => t.key);
        expect(new Set(keys).size, g.title).toBe(keys.length);
        for (const k of keys) expect(KEY_PATTERN.test(k), k).toBe(true);
      }
    }
  });
  test("the master ids are 'sct_' plus the md5 the migration builds", () => {
    expect(schoolSeedId("junior")).toMatch(/^sct_[0-9a-f]{32}$/);
    expect(new Set(SCHOOL_SEEDS.map((s) => s.id)).size).toBe(4);
  });
});

test.describe("the seeded masters", () => {
  test("each is a valid definition by the same rules a branch's own scheme and scale follow, and the four may live together", () => {
    for (const s of SCHOOL_SEEDS) {
      expect(definitionSchema.safeParse(s.definition).success, s.name).toBe(true);
      expect(checkDefinition(s.definition), s.name).toEqual([]);
    }
    for (const s of SCHOOL_SEEDS)
      expect(
        sharedNameClashes(
          s.definition,
          SCHOOL_SEEDS.filter((o) => o.id !== s.id),
        ),
        s.name,
      ).toEqual([]);
  });
  test("only the junior scale starts unconfirmed", () => {
    expect(SCHOOL_SEEDS.filter((s) => s.definition.scale!.unconfirmed).map((s) => s.key)).toEqual(["junior"]);
  });
  test("the migration's backfill carries the four masters, their ids, definitions and the link rules", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma", "migrations", "20261121090000_school_result_templates", "migration.sql"),
      "utf8",
    );
    const quoted = (v: string) => `'${v.replace(/'/g, "''")}'`;
    for (const s of SCHOOL_SEEDS) {
      expect(sql).toContain(quoted(s.id));
      expect(sql).toContain(quoted(s.name));
      expect(sql).toContain(quoted(JSON.stringify(s.definition)) + "::jsonb");
    }
    expect(sql).toContain('md5(r."branchId" || \':template:\' || k."key")');
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(sql).toContain('"ResultTemplate_live_school_key"');
    expect(sql).not.toContain('INSERT INTO "ResultTemplateClass"'); // no class is ever placed or moved
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|DROP COLUMN/);
  });
});

test.describe("checkDefinition", () => {
  test("bands must be contiguous from 0 to 100", () => {
    const d = base();
    d.scale!.bands = [{ min: 0, max: 40, letter: "F", remark: "Fail" }];
    expect(checkDefinition(d).map((p) => p.path)).toEqual(["scale"]);
  });
  test("the marks must add up", () => {
    const d = base();
    d.scheme!.components = [{ name: "Test", maxScore: 10 }];
    expect(checkDefinition(d).map((p) => p.path)).toEqual(["scheme"]);
  });
  test("two groups or two traits of one group cannot share a key or a name", () => {
    const d = base();
    d.groups[1].key = d.groups[0].key;
    d.groups[0].traits[1].key = d.groups[0].traits[0].key;
    d.groups[0].traits[2].name = d.groups[0].traits[0].name.toUpperCase();
    const paths = checkDefinition(d).map((p) => p.path);
    expect(paths).toContain("groups.1.key");
    expect(paths).toContain("groups.0.traits.1.key");
    expect(paths).toContain("groups.0.traits.2.name");
  });
  test("a scheme and a scale are optional ('as the branch does today')", () => {
    const d = base();
    d.scheme = null;
    d.scale = null;
    expect(definitionSchema.safeParse(d).success).toBe(true);
    expect(checkDefinition(d)).toEqual([]);
  });
});

test.describe("one name, one structure", () => {
  test("another master with the same scheme name and different marks clashes; the same marks do not; another name does not", () => {
    const a = base();
    const b = base();
    expect(sharedNameClashes(a, [{ name: "B", definition: b }])).toEqual([]);
    b.scheme!.examMax = 70;
    b.scheme!.components = [{ name: "Continuous assessment", maxScore: 30 }];
    expect(sharedNameClashes(a, [{ name: "B", definition: b }])[0]).toMatch(/Give this one another name/);
    b.scheme!.name = "Another structure";
    expect(sharedNameClashes(a, [{ name: "B", definition: b }])).toEqual([]);
  });
  test("the same for a grade scale name", () => {
    const a = base();
    const b = base();
    b.scale!.bands = [
      { min: 0, max: 50, letter: "F", remark: "Fail" },
      { min: 50, max: 100, letter: "P", remark: "Pass" },
    ];
    expect(sharedNameClashes(a, [{ name: "B", definition: b }])[0]).toMatch(/grade scale/);
  });
});

test.describe("row state", () => {
  test("up to date, behind, customised here, and both", () => {
    expect(rowState({ schoolTemplateVersion: 3, localEditedAt: null }, 3)).toBe("up-to-date");
    expect(rowState({ schoolTemplateVersion: 1, localEditedAt: null }, 3)).toBe("behind");
    expect(rowState({ schoolTemplateVersion: 3, localEditedAt: new Date() }, 3)).toBe("customised");
    expect(rowState({ schoolTemplateVersion: 2, localEditedAt: "2026-11-20T10:00:00Z" }, 3)).toBe("customised-behind");
    expect(rowState({ schoolTemplateVersion: null, localEditedAt: null }, 1)).toBe("behind");
  });
  test("a sync skips the customised rows whose branch was not chosen for replacement", () => {
    const rows = [
      { branchId: "a", localEditedAt: null },
      { branchId: "b", localEditedAt: new Date() },
      { branchId: "c", localEditedAt: new Date() },
    ];
    expect(skippedBySync(rows, [])).toEqual(["b", "c"]);
    expect(skippedBySync(rows, ["b"])).toEqual(["c"]);
    expect(skippedBySync(rows, ["a", "b", "c"])).toEqual([]);
  });
});

test.describe("what the routes accept", () => {
  const good = { name: "Evening card", definition: base() };
  test("a master needs a definition, accepts no stray keys and bounds its lists", () => {
    expect(schoolTemplateInput.safeParse(good).success).toBe(true);
    expect(schoolTemplateInput.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(schoolTemplateInput.safeParse({ name: "x" }).success).toBe(false);
    const many = base();
    many.groups = Array.from({ length: 9 }, (_, i) => ({
      key: `g${i}`,
      title: `G${i}`,
      showSign: false,
      traits: [{ key: "t", name: "T" }],
    }));
    expect(definitionSchema.safeParse(many).success).toBe(false); // at most 8 groups
    const badKey = base();
    badKey.groups[0].key = "Not A Key";
    expect(definitionSchema.safeParse(badKey).success).toBe(false);
  });
  test("a sync names 1 to 50 branches, and the replacement list is bounded too", () => {
    expect(syncInput.safeParse({ branchIds: ["a"] }).success).toBe(true);
    expect(syncInput.safeParse({ branchIds: [] }).success).toBe(false);
    expect(syncInput.safeParse({ branchIds: Array.from({ length: 51 }, (_, i) => `b${i}`) }).success).toBe(false);
    expect(syncInput.safeParse({ branchIds: ["a"], replaceLocal: Array.from({ length: 51 }, (_, i) => `b${i}`) }).success).toBe(false);
    expect(syncInput.safeParse({ branchIds: ["a"], other: true }).success).toBe(false);
  });
});
