# 0132: classes can be used without arms

- **Status:** Done: built; API and browser specs pass (30). ONE migration: `20261126180000_class_default_arm`.

The maintainer (2026-11-26, Classes tab): "we need to be able to skip adding arms in some situation; we want adding arm to be optional". Answered question: they chose "the class works with no arms": the class behaves as one group.

## Why it is not just "skip"
Pupils are placed in an arm, and marks, attendance, the timetable and staff assignments are all kept per arm (`classArmId` is required on `Result`, `StaffSubjectAssignment`, `AttendanceGrant`, `TimetableSlot`). A class with no arm cannot hold any of it. So a class "without arms" gets ONE hidden arm.

## Decisions
1. `ClassArm.isDefault` (migration: a column, default false, and a partial unique index: one live default arm per class). The arm was first named "Main"; task 0133 renamed it "_" (reserved) and added `classLabel` so no screen shows it.
2. `POST /class-groups/[id]/without-arms` creates it (administrators of the branch; safe to repeat; 409 for an archived class or a class that already has live arms; audited `CLASS_ARM_DEFAULT_CREATED`).
3. On the Classes tab a class with no arms has "Use without arms" next to "Add arm". Afterwards the row says "arms: none needed" and shows no arm chip while the default arm is the only one. Add arm still works; then both arms show (the default one is shown so its pupils are not hidden).
4. Existing classes and every other way of making a class are unchanged: nothing creates an arm by itself, so no existing behaviour or test changes.

## Not done (said plainly) — done in task 0133
The default arm was called "Main" and other screens that list an arm still show that name (a pupil's class picker reads "Beginner Main"; the report card and enrolment strings carry it). Hiding the name everywhere needs a change in many of the places that print a class and arm; it was left. Placing a pupil still needs the arm picked once, though a class with one arm has only that choice.

## Tests
`tests/api/class-without-arms.spec.ts` and `tests/e2e/class-without-arms.spec.ts` (desktop and phone, axe).
