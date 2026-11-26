// How a class and its arm are written for a person (task 0133), CLIENT-SAFE (no database), the one place that knows about the hidden default arm.
//
// A class "without arms" (task 0132) gets ONE flagged default arm, because pupils, marks, attendance and the timetable are all kept per arm. That arm is a bookkeeping row,
// not something a school named, so it never appears in text: "Beginner", not "Beginner _". Every screen, export and message that writes a class and its arm goes through
// `classLabel` / `armLabel`, and `tests/unit/class-label-guard.spec.ts` fails when a file joins them by hand instead.

/// The name the default arm is stored under. A name no school types: ordinary arms may not use it (`armName` in structure-rules.ts refuses it), so a real arm can never be mistaken
/// for the hidden one, and the helpers below still hide it when a query forgot to select `isDefault`.
export const DEFAULT_ARM_NAME = "_";

type ArmLike = { name: string; isDefault?: boolean | null };

/// Whether this arm is the hidden default one: flagged, or (a query that did not select the flag) carrying the reserved name.
export function isHiddenArm(arm: ArmLike | string | null | undefined): boolean {
  if (arm === null || arm === undefined) return false;
  if (typeof arm === "string") return arm.trim() === DEFAULT_ARM_NAME;
  return arm.isDefault === true || arm.name.trim() === DEFAULT_ARM_NAME;
}

/// The arm as a person reads it: its name, or "" for the hidden default arm (and for no arm).
export function armLabel(arm: ArmLike | string | null | undefined): string {
  if (arm === null || arm === undefined || isHiddenArm(arm)) return "";
  return (typeof arm === "string" ? arm : arm.name).trim();
}

/// The class and its arm as one phrase: "Beginner Gold", or just "Beginner" when the arm is the hidden one or there is none.
export function classLabel(className: string | null | undefined, arm?: ArmLike | string | null): string {
  return [(className ?? "").trim(), armLabel(arm)].filter((part) => part !== "").join(" ");
}
