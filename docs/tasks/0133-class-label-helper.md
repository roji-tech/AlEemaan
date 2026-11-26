# 0133: one way to write a class and its arm; the hidden default arm is named "_"

- **Status:** Built; see Tests. ONE small migration: `20261126210000_default_arm_name` (renames existing default arms).

The maintainer (2026-11-26) asked for the hidden default arm of a class without arms (task 0132) to stop showing on other screens ("Beginner Main" in a pupil's class picker), "or create a function that displays classes and can be used generally", and then: "don't use the name Main, use something a normal user will not use like `_`".

## Decisions
1. `src/lib/academics/class-label.ts` (client-safe): `DEFAULT_ARM_NAME = "_"`, `isHiddenArm`, `armLabel`, `classLabel`. `classLabel("Beginner", arm)` is "Beginner Gold", or just "Beginner" when the arm is the hidden one or there is none. It hides an arm that is flagged `isDefault` OR named "_", so a query that forgot to select the flag still does not leak it.
2. The default arm is stored as `_`. `armName` (structure-rules.ts) refuses `_` for an ordinary arm everywhere an arm is named: create, rename, and the bulk class import. The default arm itself cannot be renamed (409).
3. Migration `20261126210000_default_arm_name`: `UPDATE "ClassArm" SET name = '_' WHERE isDefault`. It does not edit the earlier 0132 migration, which dev and staging have already run.
4. Every screen, export and message that wrote a class and its arm now goes through the helper: pupil lists and forms, the Classes tab, marks entry, result review, department review, report cards (the card text and the traits dialog), attendance (the arm picker, the grant dialog, and the roll call, which no longer filters by an arm string for a class without arms), timetable, announcements, staff assignments, promotion preview and history, the portal, finance, search, guardians and the exports.
5. A class without arms: the pupil form hides the Arm field (the server places the pupil in the default arm when no arm is chosen); bulk pupil import and `resolveArmId` do the same. Where the default arm shows next to real arms, it reads "Whole class".
6. The legacy import still makes real arms called "Main"; those are arms a school had and still show.
7. Guard: `tests/unit/class-label-guard.spec.ts` fails when a file joins a class and an arm by hand.

## Not done (said plainly)
- A class without arms has no way yet to set a class teacher (the arm is hidden), so its attendance is open to administrators and explicit grants only.
- Wording on a few screens still says "arm" for a class without arms ("Say which arm of …" never appears for them; the Academics help text is unchanged).

## Tests
`tests/unit/class-label.spec.ts`, `tests/unit/class-label-guard.spec.ts`, the two class-without-arms specs (API, browser), and a browser check that a pupil in a class without arms reads as just the class.
