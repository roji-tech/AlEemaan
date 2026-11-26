# 0136: delete an empty arm

- **Status:** Built; see Tests. No migration.

The maintainer (2026-11-27, screenshot of Nursery 1 with arms "A, 16 pupils" and "B, 0 pupils"): "I should be able to delete an unconnected or empty arm".

## Decisions
1. `DELETE /api/v1/academics/arms/[id]` (administrators of the arm's branch; another branch's arm is the same 404 as an unknown id). `deleteArm` in `lib/academics/structure.ts` deletes an arm nothing is connected to. Refused (409, naming what): pupils (placed in it, or an enrolment of its class carrying its name, any session), marks, teachers' subject assignments, register permissions, timetable slots, announcements to it, assignments. Its class teacher link goes with it (the person's record stays). Hard delete, audited `CLASS_ARM_DELETED`; a foreign-key refusal is the same 409. Archive keeps an arm that has history. Same idea as deleting an unused class (task 0135) and scheme (task 0128).
2. Screen: the arm's Edit dialog (the pencil chip) has a Delete button while the arm has no pupils; it opens a confirmation ("Delete B of Nursery 1?"), and the server's refusal is shown in that dialog if something else is connected.
3. The hidden default arm of a class without arms can be deleted too while it is empty (the class has no arms again and "Use without arms" is offered); it shows as the "Whole class" chip when real arms exist beside it.

## Tests
API (`tests/api/class-without-arms.spec.ts`): an empty arm deleted (sister arm and teacher record stay, audited, then 404), refused for a pupil and for a timetable slot (nothing deleted, no audit), the hidden arm, who may. Browser (`tests/e2e/class-without-arms.spec.ts`): Edit dialog, Delete, confirmation, the arm gone, the other stays, axe on both dialogs.
