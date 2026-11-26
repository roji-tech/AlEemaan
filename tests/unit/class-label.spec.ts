import { test, expect } from "@playwright/test";
import { DEFAULT_ARM_NAME, armLabel, classLabel, isHiddenArm } from "@/lib/academics/class-label";
import { armInput, armPatch } from "@/lib/academics/structure";
import { armName } from "@/lib/academics/structure-rules";
import { classRowSchema } from "@/lib/bulk/classes";
import { classText } from "@/lib/academics/report-card-rules";
import { actionLook } from "@/components/ui/action-look";

// Task 0133: a class and its arm are written ONE way, and the hidden default arm of a class without arms never shows.

test("the hidden arm is flagged or carries the reserved name", () => {
  expect(DEFAULT_ARM_NAME).toBe("_");
  expect(isHiddenArm({ name: "_", isDefault: true })).toBe(true);
  expect(isHiddenArm({ name: "Anything", isDefault: true })).toBe(true);
  // a query that forgot to select the flag still hides it
  expect(isHiddenArm({ name: "_" })).toBe(true);
  expect(isHiddenArm("_")).toBe(true);
  expect(isHiddenArm({ name: "Gold" })).toBe(false);
  expect(isHiddenArm({ name: "Main", isDefault: false })).toBe(false);
  expect(isHiddenArm(null)).toBe(false);
  expect(isHiddenArm(undefined)).toBe(false);
});

test("armLabel is the arm's name, or nothing", () => {
  expect(armLabel({ name: "Gold", isDefault: false })).toBe("Gold");
  expect(armLabel("  Gold ")).toBe("Gold");
  expect(armLabel({ name: "_", isDefault: true })).toBe("");
  expect(armLabel(null)).toBe("");
  expect(armLabel(undefined)).toBe("");
});

test("classLabel writes the class and its arm, with no stray space", () => {
  expect(classLabel("Beginner", { name: "Gold" })).toBe("Beginner Gold");
  expect(classLabel("Beginner", "Gold")).toBe("Beginner Gold");
  expect(classLabel("Beginner", { name: "_", isDefault: true })).toBe("Beginner");
  expect(classLabel("Beginner", "_")).toBe("Beginner");
  expect(classLabel("Beginner", null)).toBe("Beginner");
  expect(classLabel("Beginner")).toBe("Beginner");
  expect(classLabel(" SSS 1 ", " A ")).toBe("SSS 1 A");
  expect(classLabel(null, null)).toBe("");
  // an old arm called Main is a real arm somebody named (the legacy import made them): it still shows
  expect(classLabel("Beginner", { name: "Main", isDefault: false })).toBe("Beginner Main");
});

test("the report card's class text drops the hidden arm too", () => {
  expect(classText({ group: "SSS 1", arm: "A", gradeLabel: "Grade 10" }, true)).toBe("SSS 1 A (Grade 10)");
  expect(classText({ group: "SSS 1", arm: "_" }, true)).toBe("SSS 1");
  expect(classText({ group: "SSS 1", arm: "_", gradeLabel: "Grade 10" }, true)).toBe("SSS 1 (Grade 10)");
  expect(classText({ group: "SSS 1", arm: "A" }, false)).toBe("SSS 1");
});

test("an ordinary arm cannot take the reserved name", () => {
  expect(armName.safeParse("_").success).toBe(false);
  expect(armName.safeParse(" _ ").success).toBe(false);
  expect(armName.safeParse("Gold").success).toBe(true);
  expect(armName.safeParse("_a").success).toBe(true);
  expect(armInput.safeParse({ classGroupId: "c", name: "_" }).success).toBe(false);
  expect(armPatch.safeParse({ name: "_" }).success).toBe(false);
  expect(armPatch.safeParse({ capacity: 30 }).success).toBe(true);
  const bulk = classRowSchema.safeParse({ name: "Basic 1", arms: "A, _", subjects: "" });
  expect(bulk.success).toBe(false);
  expect(classRowSchema.safeParse({ name: "Basic 1", arms: "A, B", subjects: "" }).success).toBe(true);
});

test('the Classes row\'s "Use without arms" action has its own icon and tone (every other action of that row has one too)', () => {
  expect(actionLook({ id: "noarms" })).toMatchObject({ tone: "info" });
  expect(actionLook({ id: "noarms" }).icon).not.toBeNull();
  for (const id of ["arm", "noarms", "subjects", "template", "edit", "archive", "delete"]) {
    expect(actionLook({ id }).icon, `the "${id}" action of a class row has an icon`).not.toBeNull();
  }
});
