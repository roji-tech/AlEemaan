# 0110: Add pupils and staff of any branch to a program, without registering them again

- **Period / Focus:** 2026-11-19 (maintainer request, programs)
- **Status:** Built (merged with this record)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/program-pupils-other-branches` / PR to `dev`
- **Started:** 2026-11-19

---

## 1. Objective

The maintainer, 2026-11-19, with screenshots of the Students page of the branch **Taaju Waqoor** ("No students yet") and of Settings > Programs (every branch "takes part"):

> "if a branch is created from a program, I should be able to directly link student from another branch to it especially based on the settings"

and then:

> "let's say I wanna register some students in a class or a whole class, or some staff for a Program or a program with it's own branch, do I have to reenter all their info"

Success:
- Nobody is typed in again. A pupil, a whole class or a member of staff of **any branch that takes part in programs** (the Programs settings) can be added to a program from its People tab.
- A program with its own branch says so on that branch's Students page and leads straight there.

## 2. Context and the decision

- A pupil's record belongs to **one** branch (`StudentRecord.branchId`; admission number, class, invoices and results hang off it). Nothing joins two records as the same child. Putting a Primary pupil "into" Taaju Waqoor as a second pupil record would split their history and their fees, so this task does **not** do that.
- The programs model (task 0043) already answers the need. A person is in a program *through* their own branch (`ProgramParticipant.branchId`), and the program's People tab **links** the school's record ("A pupil of the school", "A whole class of pupils", "A member of staff"). Nothing is retyped; only a person with no record (an adult, guardian or child) is typed in.
- The gap: that dialog offered only the branches the program already runs in. A super admin first had to "Add a branch" on the Overview tab, and nothing on the own branch's Students page said where those pupils were.

**Decided (the secure option):**
1. A **super admin** is offered the pupils, staff and classes of every branch that takes part in programs (school switch AND branch switch, Settings > Programs), linked or not. Adding one of a branch the program does not run in yet **links that branch in the same transaction**, with the same `BRANCH_LINKED` audit entry as the Overview tab (reason "Linked when one of its people was added to the program"). Linking a branch was already a super admin's act (task 0043, 8.6), so nobody gains a right they did not have.
2. A **program admin** and a **branch administrator** keep their current reach: the branches the program runs in that they manage.
3. A person **typed in** still goes through a branch the program runs in.
4. The link is written only **after every other check** and right before the people are written: a refusal returns inside the program's transaction and would otherwise commit it. A whole class's **preview** and a class with nobody left to add link nothing. Two adds from the same new branch at once link it once (`createMany … skipDuplicates`, one audit entry).
5. The **Students page** of a branch made for a program shows a card: the other branches' pupils and staff are not registered here again; they join from their own branch and keep their class, records and admission number. It shows how many are in the program now (super admin and program admin only), "See the program's people" (`/programs/<id>?tab=people`), and for a super admin while programs are on, "Add people from other branches" (`?tab=people&add=1`, which opens the dialog). The card is passed only to someone with a place in that program (`viewerOf`).
6. The program page keeps its open tab in the address (`?tab=`, `useTabParam`, as other pages since task 0100).

## 3. Work breakdown

- [x] `src/lib/programs/people-service.ts`: `reachFor` (linked branches the viewer manages, plus for a super admin every other branch that takes part), used by `candidates` and `classOptions`; the candidate note `LINKS_BRANCH_NOTE`; `branchAllowed(…, mayLink)` (checks only, hands back the branch to link) and `linkNow` (links and audits), used by `addPerson` (pupil, staff) and `addClass` (on confirm, when someone is added).
- [x] `src/components/students/OwnProgramCard.tsx` (new), `StudentsPanel.tsx` (`programs` prop), `src/app/(app)/students/page.tsx` (which branch is whose own branch, who may see what).
- [x] `ProgramPage.tsx` (`?tab=`), `ProgramPeopleTab.tsx` (`?add=1`).
- [x] Tests: `tests/api/program-people.spec.ts`: the old checks that a super admin gets 404 for a branch the program does not run in now name the program admin, who still does. New describe block: the search note; adding links once with its audit and the place is through the pupil's own branch; a class preview links nothing and confirming links; a branch with programs off is not offered and links nothing; a typed-in person and a program admin cannot link. `tests/e2e/programs.spec.ts`: the card for a super admin (no card on another branch, accessible, fits, leads to the open dialog) and for the own branch's administrator (no add button, no count).
- [x] Docs: `docs/functions/school-app.md` (candidates, classes, class), `docs/components/school-app.md` (OwnProgramCard, StudentsPanel, ProgramPage, ProgramPeopleTab).

## 4. Verification

Gates on the branch: typecheck, lint, build, and Prettier on the changed files. CI on the PR: build and unit tests, typecheck/lint/format, and Vercel all passed.

**Batch 2, 2026-11-19.** One build of this branch merged with #298 (task 0111), one worker on the shared test database. Projects: setup; unit (all); api program-people; browser programs, program-people and students-screen on desktop and phone (with 0111's specs). Run total: **1632 passed, 19 failed, 11 skipped**. **None of the 19 failures was in this task's specs.** They were all 0111's, and its record (task 0111, section 5) lists them.

**Batch 3, 2026-11-19.** This branch and #298 rebuilt on the current `dev` (9e62c32). Run total: **1653 passed, 1 failed, 1 skipped**. The one failure was a false alarm in the phone tap check on the Branches page; 0111's record explains it, and it passed after the test fix.

For this task in batch 3:
- `tests/api/program-people.spec.ts` and `tests/e2e/program-people.spec.ts`: 106 passed, 0 failed. This includes the new describe block: the search note; adding links the branch once, with its audit; a class preview links nothing and confirming links; a branch with programs off is neither offered nor linked; a typed-in person and a program admin cannot link.
- `tests/e2e/programs.spec.ts`: 24 passed, 0 failed. This includes the own-branch card for a super admin (accessible, fits, opens the dialog) and for that branch's administrator (no add button, no count).
- `tests/e2e/students-screen.spec.ts`: passed.

**Not run:** the full browser suite; the walkthrough (deferred).

## 5. Not in this task

- A pupil belonging to two branches at once (one child, two branch records). If the school wants it, it needs its own design: one admission number or two, where fees and results live.
- A program admin linking a branch by adding someone (it stays the super admin's).
