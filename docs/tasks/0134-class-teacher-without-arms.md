# 0134: a class used without arms has a class teacher

- **Status:** Built; see Tests. No migration.

The maintainer (2026-11-26), on the gap I reported after task 0133: "a class used without arms can't have a class teacher set, because its arm is hidden, so its attendance is open only to administrators and explicit grants. FIX".

## Cause
The class teacher is kept on the arm (`ClassArm.classTeacherId`, task 0114), and the Classes tab only offered "Set class teacher" beside an arm chip. A class used without arms (task 0132) shows no arm chip, so there was nowhere to click. The API (`PATCH /arms/[id]/class-teacher`) and the attendance access rules already work for any arm, the hidden default arm included.

## Decisions
1. On the Classes tab a class used without arms shows the same class-teacher line under its row ("Set class teacher", then the teacher's name), bound to its hidden default arm. No API or schema change.
2. `ClassTeacherLine` (new, in `ClassesPanel.tsx`) is the one place that draws that line, for an arm and for a class without arms; people who cannot edit see the name only.
3. The dialog says "register for this class. One per class" when the arm is the default one, and the confirmation reads "… is the class teacher of Reception." (via `classLabel`).
4. Attendance needs nothing: the teacher then reads the class in their arm list as "Reception (Class Teacher)".

## Tests
API (`tests/api/class-without-arms.spec.ts`): set over HTTP, the teacher's attendance arm list gains the class with grantType CLASS_TEACHER, the class list carries the teacher on the hidden arm, and clearing removes access. Browser (`tests/e2e/staff-sign-in-transfer.spec.ts`): set from the class row, no arm chip, axe on the dialog.
