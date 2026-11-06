# 0045: Standing - suspension, expulsion and termination on the school's own records

- **Period / Focus:** requested 2026-11-03 by the maintainer; design written the same day, built in the same branch as programs slice P1 and part payment (task 0046)
- **Status:** Built and tested 2026-11-03 on `claude/programs-p1` (section 7 is the build record); waiting for the migration `20261104100000_standing` on the hosted databases and the maintainer's promotion. Octalve Edu parity is a separate task.
- **Priority:** High (programs slice P2 reads it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** `claude/programs-p1`, into `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A student can be **suspended** or **expelled** and a member of staff **suspended** or **terminated**, from any branch, as a real status on the school's own records that the rest of the system respects, with who decided, why and when kept for ever. Today the records have no such state: the only things that exist are archiving a student, deactivating a membership and the enrolment statuses WITHDRAWN, TRANSFERRED and ALUMNI.

## 2. The maintainer's words (2026-11-03)
- "Build the suspension, expulsion and termination properly."
- Students and staff can be suspended, expelled or terminated **from any branch**. A suspension (or any branch-level action) affects **only that branch**; a school-wide expulsion ends the person's places in every branch.
- The super admin's settings are a ceiling: a branch administrator can narrow them, never widen them (task 0040).

## 3. What the code does today (read 2026-11-03)
- `StudentRecord` has one `branchId` and only `archivedAt`. Archiving hides the pupil everywhere (lists, attendance, portal sign-in, guardian siblings). There is no "suspended" and no "expelled".
- Attendance rolls (`attendance/service.ts`), invoice generation (`finance/service.ts` `generateInvoices`), result sheets (`academics/results.ts`) and the promotion rollover (`promotion/service.ts`) all select pupils by **`StudentEnrollment.status = ACTIVE`** (and `student.archivedAt = null` in some). So a new enrolment status that is not ACTIVE removes a pupil from all four without touching them.
- The portal finds a pupil by admission number with `archivedAt IS NULL` (`portal/service.ts`), decides what each actor may do with `portal_access` (task 0040, `portal/access.ts`), and the guardian's siblings come from a shared contact.
- `StaffRecord` (an HR record; `userId` is optional, a guard or a driver has none) has `archivedAt`. `Membership` has `deactivatedAt`, and `getUserMemberships`, `withAuth({ roles })`, the sign-in admin check, `branch-access`, `forms/access` and the member counts all treat a deactivated membership as absent. `deactivateMember` already refuses yourself and the last super admin, deletes the sessions when it was the person's last active membership, and writes an `AuditLog` row.
- Only a super admin may change or deactivate an administrator (`members/service.ts`).

## 4. Design

### 4.1 The states
| Subject | States |
| --- | --- |
| Student (a `StudentRecord`) | `ACTIVE`, `SUSPENDED` (with an optional end date), `EXPELLED` |
| Member of staff (a `StaffRecord` and/or a `Membership` in one branch) | `ACTIVE`, `SUSPENDED` (with an optional end date), `TERMINATED` |
Archiving and deactivating stay exactly what they are (the "hide" and "sign out" actions); standing is the disciplinary / employment record on top of them.

### 4.2 Where it is stored (one additive migration, nothing existing changes)
- `StudentRecord.standing` (default `ACTIVE`) and `StudentRecord.standingUntil` (a date; null = until someone lifts it). Same two columns on `StaffRecord`.
- `Membership.suspendedUntil` (a date, set only by a suspension; it is what lets a suspension end by itself, see 4.5).
- `EnrollmentStatus` gains **`EXPELLED`**: an expelled pupil's active enrolment becomes EXPELLED, which is why the four modules in section 3 drop the pupil with no change.
- `StandingEvent`, append-only: `subjectKind` (`STUDENT` or `STAFF`), `studentId?`, `staffRecordId?`, `membershipId?`, `branchId`, `action` (`SUSPENDED`, `EXPELLED`, `TERMINATED`, `LIFTED`, `REINSTATED`), `scope` (`BRANCH` or `SCHOOL`), `reason` (required, 3 to 500 characters), `startsOn`, `endsOn?`, `decidedByUserId`, `createdAt`. Every change also writes an `AuditLog` row, in the same transaction, as members already do.

### 4.3 What each state does
**A pupil**
| | Suspended | Expelled |
| --- | --- | --- |
| Class list, attendance roll | stays, with a "Suspended" badge; attendance is recorded as usual | leaves (enrolment EXPELLED) |
| Results | unchanged | not on new result sheets; past results stay |
| Invoices and payments | unchanged; existing invoices stay payable | no new invoices; what is already owed stays owed and payable |
| Promotion rollover | stays active; the rollover shows a note | not promoted (not ACTIVE) |
| Portal, the pupil | can sign in, cannot hand in work, take quizzes or practise | **refused**, with the one generic sign-in sentence (the page never says why) |
| Portal, the guardian | unchanged | can sign in to **see and settle the invoices only** |
| Programs (task 0043, slice P2) | the pupil's places are read only | the places end (`ENDED_BY_SCHOOL`), kept as history |
The portal part is a pure function that **narrows** the access the branch already gave (`capForStanding`, applied where the access is read, like the guardian's practice ceiling), so no portal route can forget it and a standing can never widen anything.

**A member of staff**
| | Suspended | Terminated |
| --- | --- | --- |
| Sign-in and authority in that branch | the membership of that branch is deactivated until the end date (other branches are untouched); sessions are deleted if it was the last active one | the membership of that branch is deactivated (scope BRANCH), or **every** membership the person holds (scope SCHOOL, super admin only) |
| The staff record | stays, flagged "Suspended" | archived with standing TERMINATED (the existing live filters already drop an archived record) |
| Class teacher / subject assignments | untouched | untouched, and the dialog shows how many classes and subjects need a new teacher |
| Programs | program roles in that branch are paused | the roles in that branch end |

### 4.4 Who may do what (checked on the server)
- **Suspend and lift a suspension:** a super admin, or an administrator of the subject's own branch while the ceiling setting (4.7) allows it. Suspending an administrator or a super admin: a super admin only (the existing rule for administrators).
- **Expel, terminate, reinstate:** a super admin only. **Scope SCHOOL** (a staff member in every branch): a super admin only.
- Nobody changes their own standing. The last active super admin cannot be suspended or terminated (the `deactivateMember` guard is reused, not copied).
- A reason is required and is kept in the history.

### 4.5 A suspension that ends by itself, with no background job
A pupil's **effective** standing is a pure function (`effectiveStanding(standing, until, today)`): SUSPENDED only while `until` is null or not before today. Everything reads it, so a suspension simply stops applying on the day after its end date. A member of staff is different because suspending deactivates the membership (which is how every authority check already works): the suspension is lifted **at the next sign-in** once its date has passed (`liftEndedSuspensions(userId)` runs in the one place a person becomes signed in), and the Users page shows "ready to lift" for a suspended member whose date has passed. An administrator can also lift it by hand at any time.

### 4.6 Reinstating
Expelled pupil: standing ACTIVE; if an active session exists and the pupil has an EXPELLED enrolment in it, that enrolment goes back to ACTIVE, otherwise they are enrolled the normal way. Terminated member of staff: the record is restored and the membership reactivated (branch scope) or all of them (school scope). Both are history rows, never an edit of an old one.

### 4.7 One setting (the ceiling pattern)
`standing.branchAdminMaySuspend` (default on): when the school turns it off, only a super admin can suspend; a branch can turn it off for itself and never on over the school. Stored as `SettingValue` (GLOBAL and BRANCH), audited, edited on the Settings page (Programs tab neighbour: "Discipline") by a super admin, and by a branch administrator through the API for their own branch.

### 4.8 Screens
Students page: a Standing column with a badge, a filter, and a row menu Suspend / Lift suspension / Expel / Reinstate, each a dialog that asks for the reason (and the end date for a suspension), with History. Staff: the same on the Users page (by membership) and the Academics staff panel (by record). A suspended pupil's portal overview says what is paused and until when. Walkthrough rows are added for each screen.

### 4.9 Programs
Slice P2 of task 0043 reads the effective standing of the linked student or staff record; a program place never stores its own copy of it.

## 5. Work breakdown
- [x] S1 Migration; the pure rules (`effectiveStanding`, the portal narrowing, who may); the student service (suspend, lift, expel, reinstate) and routes; the Students page; portal effects; attendance badge
- [x] S2 The staff service (suspend, lift, terminate, reinstate, scope), the sign-in lift, routes; Users page and the staff panel
- [x] S3 The ceiling setting and its Settings tab; walkthrough rows; docs
- [x] Tests: unit (rules), API (who may, every effect, the history, the guards), browser (screens, both themes, phone)

## 6. Not in this task
Messages to guardians about a suspension (the communication module could send them; the wording is the school's to give), an appeal process, a guardian's acknowledgement, and reporting by period. Each can be added on top of the history table.

## 7. Build record (2026-11-03)
Built with tasks 0043 P1 and 0046 on one branch, as separate commits, and tested together in one full run.

**What exists.** The migration `20261104100000_standing` (additive): the enums `StandingState`, `StandingSubject`, `StandingEventAction` and `StandingScope`; the value `EXPELLED` on `EnrollmentStatus`; `standing` and `standingUntil` on `StudentRecord`, `StaffRecord` and `Membership`; the table `StandingEvent` with its indexes; check constraints (a pupil is never terminated, a member of staff never expelled, an end date only on a suspension, a reason of 3 to 500 characters, an action that fits its subject); and a trigger that refuses every update and delete of a `StandingEvent` (a truncate is not a row operation and is left alone, because the test database empties itself that way). The code is in `src/lib/standing/`, the routes under `students/[id]/standing`, `members/[id]/standing`, `staff/[id]/standing` and `settings/standing`, the screens in `src/components/standing/`, and the lists, the roll, the portal and the sign-in were changed as listed in `docs/functions/school-app.md` (section "API routes: standing and part payment"). The walkthrough matrix has rows STD-01 to STD-10.

**Decisions made while building** (the best and safest option each time; any can be changed):
- A suspended or terminated person cannot be **reactivated** on the Users page (`409 UNDER_STANDING`): the only way back is lifting or reinstating, which records why. A terminated staff record cannot be **restored** either. Otherwise the standing and the access would disagree.
- A suspended pupil **stays on the class list** (the roll shows a Suspended badge, today and later days only, because an earlier day's roll must not be rewritten by today's standing). An expelled pupil comes off it with every other list that selects by active enrolment.
- The **sibling switch** of a guardian is kept when one child is expelled, so a guardian whose other child is in good standing still sees that child in the same sign-in; each child is judged on their own standing.
- The portal notice says that the pupil is suspended (and until when) or is no longer a pupil, and **never says why**.
- A suspension of staff ends **at the next sign-in** after its last day (no background job). Until then the Users page still reads Suspended and an administrator can lift it by hand.
- Terminating a staff member **archives the record without asking for their subject assignments to be removed first** (the usual archive rule): the assignments are kept as history and come back with the record on reinstating.
- Standing changes are **rate-limited** per administrator.

**Not built** (listed in section 6, plus): Octalve Edu parity (its own task); program places reading the standing (slice P2 of task 0043); a message to the guardian or the person.

**Tests.** Unit: `tests/unit/standing-rules.spec.ts`, `standing-ui.spec.ts`. API: `tests/api/standing.spec.ts` (who may, every effect, the history cannot be rewritten even by the database user, the checks of the database, the school's setting and its ceiling, school-wide, the last super admin, the sign-in lift, the portal, races). Browser: `tests/e2e/standing-and-payment-rules.spec.ts` (desktop and phone, both themes, axe, no horizontal scrolling). Results of the full run are in section 8 of `docs/tasks/0043-programs.md`.

