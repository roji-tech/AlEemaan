import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  ATTENDANCE_MESSAGES,
  RATING_MESSAGES,
  TRAIT_SCALE,
  annualFigures,
  checkAttendance,
  checkRatings,
  fromRegister,
  isRating,
  mergeAttendance,
  ratingLabel,
  type RegisterRow,
} from "@/lib/results/report-traits-rules";
import { SEED_SCALES, SEED_SCHEME, SEED_TEMPLATES, seedId } from "@/lib/results/seed-templates";
import { LAYOUT_CODES } from "@/lib/results/templates-rules";
import { isTemplateLayout } from "@/components/results/TemplateReportCard";

// Task 0116, report-card sets: the pure rules for trait ratings, attendance and the annual columns, and the four seeded cards (the maintainer's photos of Al-Eeman's printed cards, 2026-11-20).
// No server, no database.

test.describe("the 1 to 5 scale", () => {
  test("5 Excellent, 4 V. Good, 3 Good, 2 Fair, and 1 Poor (added: the printed scale stops at 2)", () => {
    expect(TRAIT_SCALE.map((s) => `${s.rating} ${s.label}`)).toEqual(["5 Excellent", "4 V. Good", "3 Good", "2 Fair", "1 Poor"]);
    expect(ratingLabel(4)).toBe("V. Good");
    expect(ratingLabel(9)).toBe("");
  });
  test("only whole numbers from 1 to 5 are ratings", () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isRating(ok)).toBe(true);
    for (const bad of [0, 6, -1, 2.5, NaN, "3", null, undefined]) expect(isRating(bad)).toBe(false);
  });
});

test.describe("checking a save of ratings", () => {
  const allowed = new Set(["t1", "t2", "t3"]);
  test("a good save, including a clear (null), passes", () => {
    expect(
      checkRatings(
        [
          { traitId: "t1", rating: 5 },
          { traitId: "t2", rating: null },
        ],
        allowed,
      ),
    ).toBeNull();
  });
  test("empty, too many, a repeated trait, a trait of another template, and a rating out of range are each refused with the trait named", () => {
    expect(checkRatings([], allowed)).toEqual({ problem: "EMPTY" });
    expect(
      checkRatings(
        Array.from({ length: 81 }, (_, i) => ({ traitId: `x${i}`, rating: 3 })),
        allowed,
      ),
    ).toEqual({ problem: "TOO_MANY" });
    expect(
      checkRatings(
        [
          { traitId: "t1", rating: 3 },
          { traitId: "t1", rating: 4 },
        ],
        allowed,
      ),
    ).toEqual({ problem: "DUPLICATE", traitId: "t1" });
    expect(checkRatings([{ traitId: "other", rating: 3 }], allowed)).toEqual({ problem: "UNKNOWN_TRAIT", traitId: "other" });
    expect(checkRatings([{ traitId: "t1", rating: 6 }], allowed)).toEqual({ problem: "RANGE", traitId: "t1" });
    expect(checkRatings([{ traitId: "t1", rating: 0 }], allowed)).toEqual({ problem: "RANGE", traitId: "t1" });
    expect(Object.keys(RATING_MESSAGES).sort()).toEqual(["DUPLICATE", "EMPTY", "RANGE", "TOO_MANY", "UNKNOWN_TRAIT"]);
  });
});

test.describe("entered attendance", () => {
  test("whole numbers from 0 to 366; present and absent cannot exceed the times the school opened", () => {
    expect(checkAttendance({ timesOpen: 90, timesPresent: 80, timesAbsent: 10 })).toBeNull();
    expect(checkAttendance({ timesOpen: null, timesPresent: 80, timesAbsent: null })).toBeNull(); // without the open count there is nothing to compare
    expect(checkAttendance({ timesOpen: 90, timesPresent: 91, timesAbsent: null })).toBe("PRESENT_ABOVE_OPEN");
    expect(checkAttendance({ timesOpen: 90, timesPresent: null, timesAbsent: 91 })).toBe("ABSENT_ABOVE_OPEN");
    expect(checkAttendance({ timesOpen: 367, timesPresent: null, timesAbsent: null })).toBe("RANGE");
    expect(checkAttendance({ timesOpen: -1, timesPresent: null, timesAbsent: null })).toBe("RANGE");
    expect(checkAttendance({ timesOpen: 90.5, timesPresent: null, timesAbsent: null })).toBe("RANGE");
    expect(Object.keys(ATTENDANCE_MESSAGES)).toHaveLength(3);
  });
});

test.describe("the register's numbers", () => {
  const rows: RegisterRow[] = [
    { date: "2026-09-07", status: "PRESENT", mine: true },
    { date: "2026-09-07", status: "ABSENT", mine: false },
    { date: "2026-09-08", status: "LATE", mine: true },
    { date: "2026-09-09", status: "ABSENT", mine: true },
    { date: "2026-09-10", status: "EXCUSED", mine: true },
    { date: "2026-09-11", status: "PRESENT", mine: false },
  ];
  test("days open are the distinct dates a register was taken; present is present plus late; absent is absent; excused is neither", () => {
    expect(fromRegister(rows)).toEqual({ timesOpen: 5, timesPresent: 2, timesAbsent: 1 });
  });
  test("a day inside a break is not a school day", () => {
    expect(fromRegister(rows, [{ start: "2026-09-09", end: "2026-09-10" }])).toEqual({ timesOpen: 3, timesPresent: 2, timesAbsent: 0 });
  });
  test("no register means no numbers: nothing is invented", () => {
    expect(fromRegister([])).toEqual({ timesOpen: null, timesPresent: null, timesAbsent: null });
    expect(fromRegister(rows, [{ start: "2026-09-01", end: "2026-09-30" }])).toEqual({
      timesOpen: null,
      timesPresent: null,
      timesAbsent: null,
    });
  });
  test("an entered number wins field by field and says so; the rest come from the register or stay empty", () => {
    const merged = mergeAttendance(
      { timesOpen: 100, timesPresent: null, timesAbsent: null },
      { timesOpen: 5, timesPresent: 2, timesAbsent: null },
    );
    expect(merged).toEqual({
      timesOpen: { value: 100, source: "entered" },
      timesPresent: { value: 2, source: "register" },
      timesAbsent: { value: null, source: null },
    });
  });
});

test.describe("the annual columns", () => {
  test("the annual score is the sum over the terms that have a result and the annual average the percentage over them", () => {
    expect(
      annualFigures([
        { ordinal: 3, total: 80, max: 100 },
        { ordinal: 2, total: 60, max: 100 },
        { ordinal: 1, total: 70, max: 100 },
      ]),
    ).toEqual({ annual: 210, annualAverage: 70 });
    expect(
      annualFigures([
        { ordinal: 2, total: 45, max: 50 },
        { ordinal: 1, total: null, max: null },
      ]),
    ).toEqual({ annual: 45, annualAverage: 90 });
    expect(annualFigures([{ ordinal: 1, total: null, max: null }])).toEqual({ annual: null, annualAverage: null });
    expect(annualFigures([])).toEqual({ annual: null, annualAverage: null });
  });
});

test.describe("the four seeded cards match the printed ones", () => {
  const byKey = Object.fromEntries(SEED_TEMPLATES.map((t) => [t.key, t]));
  test("four templates, each with its own look that the card knows how to draw", () => {
    expect(SEED_TEMPLATES.map((t) => t.key)).toEqual(["preschool", "basic", "junior", "senior"]);
    for (const t of SEED_TEMPLATES) {
      expect((LAYOUT_CODES as readonly string[]).includes(t.layoutCode)).toBe(true);
      expect(isTemplateLayout(t.layoutCode)).toBe(true);
    }
    expect(isTemplateLayout("DEFAULT")).toBe(false);
    expect(isTemplateLayout(undefined)).toBe(false);
  });
  test("pre-school and basic: psychomotor skill (6) and affective domain (13), no sign column; secondary: character development (5) and practical skills (5), with SIGN", () => {
    for (const k of ["preschool", "basic"]) {
      expect(byKey[k].groups.map((g) => [g.title, g.traits.length, g.showSign])).toEqual([
        ["Psychomotor skill", 6, false],
        ["Affective domain", 13, false],
      ]);
    }
    for (const k of ["junior", "senior"]) {
      expect(byKey[k].groups.map((g) => [g.title, g.traits.length, g.showSign])).toEqual([
        ["Character development", 5, true],
        ["Practical skills", 5, true],
      ]);
    }
    expect(byKey.preschool.groups[0].traits).toEqual([
      "Verbal fluency",
      "Games",
      "Sports",
      "Handling tools",
      "Drawing and painting",
      "Music skills",
    ]);
    expect(byKey.senior.groups[0].traits).toEqual(["Attentiveness in class", "Neatness", "Politeness", "Self control", "Punctuality"]);
    expect(byKey.junior.groups[1].traits).toEqual(["Relationship with others", "Drama", "Clubs / society", "Hobbies", "Sport"]);
  });
  test("senior grades A1 (75-100) B2 (70-74) B3 (65-69) C4 (60-64) C5 (55-59) C6 (50-54) D7 (45-49) E8 (40-44) F9 (0-39)", () => {
    const bands = SEED_SCALES.senior.bands;
    expect(bands.map((b) => b.letter).reverse()).toEqual(["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]);
    const at = (score: number) => [...bands].reverse().find((b) => score >= b.min)!.letter;
    expect([100, 75, 74, 70, 69, 65, 64, 60, 59, 55, 54, 50, 49, 45, 44, 40, 39, 0].map(at)).toEqual([
      "A1",
      "A1",
      "B2",
      "B2",
      "B3",
      "B3",
      "C4",
      "C4",
      "C5",
      "C5",
      "C6",
      "C6",
      "D7",
      "D7",
      "E8",
      "E8",
      "F9",
      "F9",
    ]);
  });
  test("every scale is contiguous from 0 to 100; junior prints A, B, C and E (no D) and pre-school/basic use a scale that is never printed", () => {
    for (const scale of Object.values(SEED_SCALES)) {
      const sorted = [...scale.bands].sort((a, b) => a.min - b.min);
      expect(sorted[0].min).toBe(0);
      expect(sorted[sorted.length - 1].max).toBe(100);
      sorted.slice(1).forEach((b, i) => expect(b.min).toBe(sorted[i].max));
    }
    expect(SEED_SCALES.junior.bands.map((b) => b.letter).sort()).toEqual(["A", "B", "C", "E"]);
    expect(byKey.preschool.scale).toBe("plain");
    expect(byKey.basic.scale).toBe("plain");
    expect(SEED_SCALES.junior.bands.find((b) => b.letter === "A")?.remark).toBe("Excellent");
  });
  test("the marks structure adds up to its total", () => {
    expect(SEED_SCHEME.components.reduce((n, c) => n + c.maxScore, 0) + SEED_SCHEME.examMax).toBe(SEED_SCHEME.totalMax);
  });
  test("ids are 'rts_' plus the md5 of branch and parts, the text the migration builds", () => {
    expect(seedId("b1", "template", "senior")).toBe("rts_" + createHash("md5").update("b1:template:senior").digest("hex"));
    expect(seedId("b1", "scheme")).not.toBe(seedId("b2", "scheme"));
  });
});

test.describe("the migration's backfill carries exactly the seed data", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "prisma", "migrations", "20261119220000_report_card_templates", "migration.sql"),
    "utf8",
  );
  const quoted = (s: string) => `'${s.replace(/'/g, "''")}'`;
  test("every template, group, trait, scale name and band appears in it, and its checks are there", () => {
    expect(sql).toContain(quoted(SEED_SCHEME.name));
    for (const t of SEED_TEMPLATES) {
      expect(sql).toContain(quoted(t.name));
      expect(sql).toContain(quoted(t.layoutCode));
      for (const g of t.groups) {
        expect(sql).toContain(quoted(g.title));
        for (const trait of g.traits) expect(sql).toContain(quoted(trait));
      }
    }
    for (const scale of Object.values(SEED_SCALES)) {
      expect(sql).toContain(quoted(scale.name));
      for (const b of scale.bands) expect(sql).toContain(`${b.min}, ${b.max}, ${quoted(b.letter)}, ${quoted(b.remark)}`);
    }
    expect(sql).toContain('CHECK ("rating" BETWEEN 1 AND 5)');
    expect(sql).toContain("md5(b.\"id\" || ':template:senior')");
  });
  test("no seeded grade scale is made the branch's default and no class is placed", () => {
    expect(sql).not.toMatch(/INSERT INTO "GradeScale"[^;]*true, now\(\)/);
    expect(sql).not.toContain('INSERT INTO "ResultTemplateClass"');
    expect(sql).toContain("false, now()");
  });
});
