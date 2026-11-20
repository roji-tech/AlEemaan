import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { CONFIRM_WHERE, UNCONFIRMED_NOTICE, staysUnconfirmed, unconfirmedPublishMessage } from "@/lib/results/scale-confirmation";
import { SCALE_SOURCE_TEXT, pickScale } from "@/lib/results/templates-rules";
import { SEED_SCALES } from "@/lib/results/seed-templates";

// Task 0116 (the maintainer, 2026-11-20): a class's own grade scale (class, then template, then branch default) and the UNCONFIRMED marker on the seeded junior scale (publishing refused until it is
// confirmed or its bands edited). Pure rules and the migration's text; no server, no database.

test.describe("which scale a class grades on", () => {
  test("its own scale, else its template's, else the branch default, else none", () => {
    expect(pickScale("c", "t", "b")).toEqual({ scaleId: "c", source: "class" });
    expect(pickScale(null, "t", "b")).toEqual({ scaleId: "t", source: "template" });
    expect(pickScale(undefined, undefined, "b")).toEqual({ scaleId: "b", source: "branch" });
    expect(pickScale(null, null, null)).toEqual({ scaleId: null, source: null });
    expect(pickScale("", "", "b")).toEqual({ scaleId: "b", source: "branch" }); // an empty id is no id
  });
  test("a named scale is never skipped in favour of the next one, whatever its state (the server refuses an archived one rather than substituting)", () => {
    expect(pickScale("archived-class-scale", "t", "b").scaleId).toBe("archived-class-scale");
    expect(pickScale(null, "archived-template-scale", "b").scaleId).toBe("archived-template-scale");
  });
  test("the words for where it comes from", () => {
    expect(SCALE_SOURCE_TEXT).toEqual({
      class: "set for this class",
      template: "from its result template",
      branch: "the branch's default",
    });
  });
});

test.describe("the unconfirmed notice and the publish refusal", () => {
  test("the notice says the bands were set from a card that prints no ranges", () => {
    expect(UNCONFIRMED_NOTICE).toBe("Please confirm these grade bands: they were set from the card, which prints no ranges");
  });
  test("nothing unconfirmed is no refusal; each unconfirmed scale is named once with its version and where to confirm", () => {
    expect(unconfirmedPublishMessage([])).toBeNull();
    expect(unconfirmedPublishMessage([{ name: "Junior", version: 1, unconfirmed: false }])).toBeNull();
    const one = unconfirmedPublishMessage([
      { name: "Junior", version: 1, unconfirmed: true },
      { name: "Junior", version: 1, unconfirmed: true },
    ])!;
    expect(one).toContain("Junior");
    expect(one.match(/Junior/g)).toHaveLength(1);
    expect(one).toContain(CONFIRM_WHERE);
    expect(one).toContain("cannot be published");
    const two = unconfirmedPublishMessage([
      { name: "Junior", version: 2, unconfirmed: true },
      { name: "Other", version: 1, unconfirmed: true },
      { name: "Fine", version: 1, unconfirmed: false },
    ])!;
    expect(two).toContain("Junior (version 2)");
    expect(two).toContain("Other");
    expect(two).not.toContain("Fine");
  });
  test("saving changed bands on an unconfirmed scale confirms it; a rename alone does not; a confirmed scale stays confirmed", () => {
    expect(staysUnconfirmed(true, true)).toBe(false);
    expect(staysUnconfirmed(true, false)).toBe(true);
    expect(staysUnconfirmed(false, true)).toBe(false);
    expect(staysUnconfirmed(false, false)).toBe(false);
  });
});

test.describe("what is seeded as unconfirmed", () => {
  test("only the junior scale (the junior card prints no ranges); the senior ranges are printed on the card", () => {
    expect(
      Object.entries(SEED_SCALES)
        .filter(([, s]) => s.unconfirmed)
        .map(([k]) => k),
    ).toEqual(["junior"]);
    expect(SEED_SCALES.senior.unconfirmed).toBeUndefined();
    expect(SEED_SCALES.plain.unconfirmed).toBeUndefined();
  });
  test("the migration adds the column false for everyone and flags only the seeded junior scale, by the id the seeding uses", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma", "migrations", "20261119240000_grade_scale_unconfirmed", "migration.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "unconfirmed" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain(`'rts_' || md5("branchId" || ':${SEED_SCALES.junior.key}')`);
    expect(sql.match(/UPDATE "GradeScale"/g)).toHaveLength(1);
    expect(sql).not.toMatch(/scale-senior|scale-plain/);
  });
  test("the class-scale migration is one table with the branch carried by every key and a unique class", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "prisma", "migrations", "20261119230000_class_grade_scale", "migration.sql"),
      "utf8",
    );
    expect(sql).toContain('CREATE UNIQUE INDEX "ClassGradeScale_branchId_classGroupId_key"');
    expect(sql).toContain('FOREIGN KEY ("branchId", "gradeScaleId") REFERENCES "GradeScale"("branchId", "id") ON DELETE NO ACTION');
    expect(sql).toContain('FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE CASCADE');
  });
});
