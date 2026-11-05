# 0043: Programs (a structure beside the branches and classes, for learning that is not a normal class)

- **Period / Focus:** requested 2026-11-03 by the maintainer; design written the same day, nothing built yet
- **Status:** Design written 2026-11-03; slice P1 (structure) in progress on branch `claude/programs-p1` (section 8); P2 to P5 (and P3b, assessments) not started
- **Priority:** High (progress records, task 0044, sit on top of it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR per slice, each off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
The school runs learning that is not a normal class in a branch: for example a Quran memorisation programme that never ends and has its own classes, categories and sub-classes, or a course of six months, three years or five years that looks like a school session but is limited. People in it may be existing students, adults, small children, staff, guardians, or people with no earlier connection to the school. A **program** is the structure that holds them: its own groups, its own people, its own staff, attendance, assessments, and (later) fees, certificates and progress records (task 0044).

Nothing about the branches, classes or results changes. A program is added beside them, and it uses the rules the school already has (branch scope, roles, settings, attendance, finance) rather than replacing them.

## 2. The maintainer's words (2026-11-03), the decisions they made
- A program is not necessarily a class: it can be **continuous** (no end date) with classes, categories and sub-classes of its own, or **for a period** (6 months, 3 years, 5 years), or something else later.
- A program can **belong to one or more branches, or have a branch of its own** (maybe a new branch).
- Level names are **flexible**, written like the school's section, class and category (JSS, 2, C): classes 1 to 6, or Juz A, B, C, or anything else.
- At the end of a fixed-term program: **issue a certificate and mark it completed.**
- People in it: **existing students, adults, small children, someone with no previous connection to the school, staff, guardians or parents.**
- Students and staff can be **suspended, expelled or terminated from any branch.** A suspension (or any branch-level action) affects **only that branch**; a school-wide expulsion ends the person's places in every branch.
- **Fees are optional** per program, a setting for the super admin or the admin, with fee items entered one by one, and a way to say who each item is for (for example, staff of a branch do not pay it).
- **Attendance is included.**
- **Programs may also have assessments** (2026-11-03, a later line from the maintainer): tests, exams or oral checks given to the people in a program. Design in 8.11, slice P3b.
- Who runs a program that spans branches: **the super admin plus a program admin they name; branch admins manage only their own branch's people in it.**
- The super admin's settings are a **ceiling**: a branch admin can narrow them, never widen them (the pattern of task 0040).

## 3. What is already in the code, and what that means (read 2026-11-03)
- **Everything is branch-scoped.** `Branch` is the unit; `StudentRecord` has one `branchId`; `StaffRecord` and `Membership` are per branch; an ADMIN is authorised across branches at the application layer. A program therefore links to branches (many to many) instead of living in one.
- **The school's own structure is Section, Class (`ClassGroup`), Arm (`ClassArm`)**: JSS, 2, C is three levels. A program needs the same idea with names the program chooses, so it gets its own tree and does not reuse these tables (they carry subjects, results, fees and approval scopes that a program does not have).
- **A student is a `StudentRecord` in one branch; there is no record for an adult learner, a guardian as a person, or someone with no connection.** Guardians are two fields and a link token on the student (`guardianName`, `guardianPhone`, `GuardianLinkToken`); parents who sign in have `Role.PARENT`. So a program needs its own **participant** (a person) that can point at an existing student, staff record or sign-in account, or stand alone.
- **Statuses that exist today are few:** a student's enrolment is ACTIVE, PROMOTED, REPEATED, WITHDRAWN, TRANSFERRED or ALUMNI; a student can be archived (`archivedAt`); a membership can be deactivated (`deactivatedAt`). **There is no suspended or expelled student and no terminated staff member in the school's records.** See decision D2.
- **Attendance** is a daily roll call per student (`AttendanceRecord`, unique per student and date) with grants per class arm. A program has its own roll call (a person can be at school and in a program on the same day).
- **Finance** (`FeeStructure` per class group, `Invoice` per student, `Payment`, discounts) is built around the student. Program fees need invoices for people who are not students (decision D5).
- **Settings** are `SettingValue` rows with a GLOBAL or BRANCH scope (and an approval workflow that these keys do not need). That is where the ceiling lives.
- **Certificates**: the public "verify by link" page (`/verify/[token]`) already exists for report cards and can be reused.

## 4. Design

### 4.1 Entities (names are working names; the migration is each slice's own task)
| Entity | What it holds |
| --- | --- |
| `Program` | name, `kind` (`ONGOING`, `FIXED_TERM`; the enum can grow), `startsOn`, `endsOn` (fixed-term; a duration in months or years is offered when it is created and stored as the date), `status` (`DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED`), `ownBranchId` (set when the program was created with a branch of its own), settings overrides |
| `ProgramBranch` | the branches a program runs in (one or more). `ownBranchId` is also in this list. |
| `ProgramLevelLabel` | the program's names for its levels, in order (for example "Section", "Class", "Category"); 1 to 4 of them |
| `ProgramGroup` | a node of the tree: `parentId`, `levelIndex`, `name`, `sortOrder`, `archivedAt`. A person is placed in a group at any level; its path is shown as `JSS–2–C` or `Juz A–Group 3` |
| `ProgramParticipant` | a person in the program: `kind` (`STUDENT`, `STAFF`, `GUARDIAN`, `ADULT`, `CHILD`, `OTHER`), a link to a `StudentRecord`, a `StaffRecord` or a `User` when they exist, otherwise their own name, birth date, phone, email and (for a child) a guardian's name and phone |
| `ProgramEnrollment` | a participant's place: `participantId`, `branchId` (the branch it runs through), `groupId`, `status` (`ACTIVE`, `SUSPENDED`, `WITHDRAWN`, `EXPELLED`, `COMPLETED`, `ENDED_BY_SCHOOL`), `reason`, dates, who decided |
| `ProgramStaff` | a staff member or person in a role in the program: `role` (`ADMIN`, `SUPERVISOR`, `TEACHER`, `RECORDER`), a branch, optional group scope, `status` (`ACTIVE`, `SUSPENDED`, `TERMINATED`, `ENDED_BY_SCHOOL`) |
| `ProgramSession` and `ProgramAttendance` | a day (or sitting) of a group and who was present, late, absent or excused (the statuses of `AttendanceStatus`) |
| `ProgramAssessment` and `ProgramAssessmentScore` | a dated sitting given to the whole program, some levels or some groups, and one score (or a result code) per participant; see 8.11 |
| `ProgramAudit` | who changed what (structure, people, statuses, settings), append-only (assessment scores have their own append-only audit) |

**Depth, not width.** A program names up to four levels; each level can have as many groups as it likes (Classes 1 to 30, Juz A to Z). Four is a cap to keep screens and paths readable; it is one constant if a school needs more.

**Branch rules.** A person is in a program *through a branch* (`ProgramEnrollment.branchId`): an existing student through their own branch; a person with no connection through a branch chosen when they are added. That branch decides which branch admin may manage them and which branch's settings narrow what they see. A program with a branch of its own creates the `Branch` row with the program (a branch admin, staff and settings of its own).

### 4.2 Who may do what
- **Super admin (school-wide ADMIN):** everything, in every program; names the program admin; sets the school-wide settings (the ceiling).
- **Program admin (`ProgramStaff.role = ADMIN`):** the program's structure, people, staff and settings, across the branches the program runs in.
- **Branch admin:** the people and staff of *their own branch* inside a program that runs in it; not the structure and not other branches' people.
- **Supervisor, teacher, recorder:** what task 0044 and the attendance slice give them; a program teacher marks attendance for the groups they are assigned to.
- Hiding a button is a courtesy. Every route checks the person's role and branch on the server, like the rest of the app, and a program's data is never returned to someone who has no place in it.

### 4.3 Statuses and the school's own records (decision D2; superseded by 8.9 and section 9)
The school's records today have no suspended or expelled student and no terminated staff member. Rather than change results, attendance and the portal in this task, the program records its own statuses per branch link:
- **Suspended, expelled (a participant), terminated (staff):** set on the place in the program, through one branch, and affect **only that branch's place**. A suspended person cannot be marked present, cannot have entries written, and sees the program read-only; an expelled or terminated place is ended and kept as history.
- **The school-wide actions that exist** (archiving a student, deactivating a membership) **end every program place of that person** (`ENDED_BY_SCHOOL`), in every branch. This is the "school-wide expulsion" of the maintainer's rule, using the actions the school has today.
- If the maintainer wants a real suspended or expelled status on the student record itself (so it also blocks results, attendance and the portal), that is a separate task (it touches those modules), and the program would then read it.

### 4.4 Completing a fixed-term program
At or after the end date a banner on the program says it has ended. **Complete the program** (an explicit action by the super admin or program admin, no background job) marks every ACTIVE place COMPLETED, sets the program COMPLETED and queues the certificates (slice P5). Suspended and expelled places are not completed. A certificate is a PDF with the school's look and a QR code to the existing public verify page; who signs it and the wording are the school's to give (slice P5 asks).

### 4.5 Settings (the ceiling pattern)
Settings are `SettingValue` rows (GLOBAL = the school, BRANCH = a branch) plus, where a program needs its own, a value on the program. **The effective value for a person is the strictest of the school, their branch and the program**: a switch is on only if every level has it on; a requirement (for example "entries must be verified") applies if any level requires it. A branch or program screen shows the effective value and, when a higher level decides it, says so ("Off, set by the school administrator") and is read-only for that setting. Keys for programs: `programs.enabled`, `programs.attendance.enabled` (on by default), `programs.fees.enabled` (off by default). The progress-record keys are in task 0044.

### 4.6 Fees (a later slice; the design problem is flagged now)
Fee items are entered one by one per program: name, amount, how often (once, monthly, per term, yearly), due date, **who it is for** (everyone in the program; certain kinds of participant; certain branches, levels or groups), an **exempt list** (people or groups), an optional **discount** (a percentage) and **who is billed** (the participant or their guardian). Staff of a branch not paying is one rule of this kind. The existing `Invoice` points at a `StudentRecord`; a participant who is not a student needs an invoice too, so the fees slice decides between giving `Invoice` an optional participant link and a separate program invoice, and it reuses the receipt and payment code either way. This is decided in that slice's own design, with the finance module read at that time.

## 5. Work breakdown (each slice: design note update, build, tests, docs, PR into `dev`)
- [x] **P1 Structure (section 8 is the build record):** `Program`, `ProgramBranch`, level labels and the group tree, the program's own branch option, the Programs page (list, create, a program's page with Overview, Structure, People, Staff, Settings tabs), the sidebar entry "Programs" in the Classroom section, audit, the ceiling settings, tests (API and browser, both themes, phone), matrix rows, docs
- [x] **P2 People (designed in section 9, built 2026-11-04; build record in 9.11):** participants (existing student, staff, guardian, adult, child), a place in a group through a branch, the state of a place read from the school's own records (task 0045), the program's own standing for people who have no school record, history
- [ ] **P3 Staff and attendance (designed in section 10):** program staff and their roles, attendance for programs (sessions, the roll call, who may mark), reports
- [ ] **P3b Assessments:** assessments for a program's levels and groups, scores for every kind of participant, publishing, the program's optional bands, the audit, the ceiling switch; see 8.11. Placed after P3 (it needs participants and teachers) and before P4 and P5 (the certificate's completion rule reads it); called P3b so the P4 and P5 named in code and docs stay correct
- [ ] **P4 Fees (designed in section 11):** fee items, who they are for, exemptions and discounts, invoices and payments for participants (its own design note first)
- [ ] **P5 Completion and certificates (designed in section 12):** the complete action, certificates with the public verify page
- [ ] Octalve Edu parity (its own task, after AlEemaan's slices land; its structure is schools and campuses, with the same ceiling rules between a school administrator and a campus administrator)

## 6. Not in the first slices
Terms or sessions inside a program (a program has dates, not its own academic calendar); class-style result sheets, report cards and promotion for programs (a program is not graded the way a class is: its assessments, 8.11, and its progress records, task 0044, are its record); timetables for programs.

## 7. Open items (defaults are used unless the maintainer changes them)
- Who signs a certificate and how it should look: asked in P5.
- Whether a person with no connection to the school and no account can see their own progress: they can if they have an account; otherwise a teacher or guardian shows it to them (task 0044, section 4.6).
- Whether a real suspended or expelled status belongs on the student and staff records themselves: a separate task, see 4.3.

## 8. Slice P1 as it is built (decisions of 2026-11-03, written before the code)

The maintainer answered "start building programs first" and, in the same sitting, asked for two things that change this design: **"build the suspension, expulsion and termination properly"** and **"a person can also pay part payment if allowed"**. Both are recorded in 8.9 and 8.10; neither is part of slice P1.

### 8.1 What P1 contains
Program, its branches, its own branch (optional), its level names, its group tree, its program admins, an audit trail, the one switch `programs.enabled`, the Programs list and a program's page, the sidebar entry. Nothing about people, attendance, fees, certificates or progress records (those are P2 to P5 and task 0044).

### 8.2 Tabs: only the ones that do something
The design above lists Overview, Structure, People, Staff and Settings. A tab that says "coming soon" is a dead end, so P1 ships **Overview, Structure and Staff**. **People** arrives with P2 (the first people), **Settings** arrives with the first switch that has an effect (attendance, P3). The program name, dates, description and lifecycle buttons live on Overview.

### 8.3 Who may do what (all enforced on the server; a hidden button is a courtesy)
| Action | Super admin | Program admin | Branch admin of a branch in the program | Anyone else |
| --- | --- | --- | --- | --- |
| See the programs list | all | their programs | programs that run in a branch they administer | none (an empty list, never an error that says a program exists) |
| Create a program, give it a branch of its own, link or unlink a branch | yes | no | no | no |
| Rename, change the description or dates, activate, archive | yes | yes | no | no |
| Structure: level names, add / rename / reorder / archive / restore groups | yes | yes | read only | no |
| Name or end a program admin | yes | no (read only) | read only | no |
| Restore an archived program | yes | no | no | no |
Naming the program admins is the super admin's alone so that no one can promote themselves or a friend. A program admin must hold an **active staff membership in a branch the program runs in** (`ProgramStaff.branchId` records which); if that membership is deactivated, or the branch is unlinked, the authority stops at once, with no job to run (it is read at every request, the same rule as `deactivatedAt` everywhere else). A program the caller has no place in answers **404** from the API and "We could not find that program." on the page, the same as a program that does not exist (a sentence and not Next's `notFound()`: the app has no not-found page of its own and the default one carries an inline style the CSP refuses).

### 8.4 Statuses and the dates of a fixed-term program
`DRAFT` -> `ACTIVE` (the Activate button) -> `ARCHIVED` (any time; read only from then on; the super admin can restore it to `DRAFT`). `COMPLETED` is set only by the complete action of slice P5, so P1 has no such button. A fixed-term program needs a start date and an end date after it; it is created with a **duration** (6 months, 1, 3 or 5 years, or a number of months) and the end date is stored: **start + duration - 1 day** (six months from 3 Nov 2026 ends on 2 May 2027), with the month end clamped (31 Aug + 6 months is 28 Feb, or 29). An ongoing program has no end date. Editing the dates later is allowed for an active program (the end date is the school's, not frozen).

### 8.5 Structure rules
- 1 to 4 level names, in order; the first is the top. A name is 1 to 40 characters.
- A group is 1 to 60 characters, unique among its live siblings (case-insensitive), at the level one below its parent (the first level has no parent). At most 1,000 live groups per program (a guard against a runaway client, not a design limit: it is one constant).
- **A level name cannot be removed while a live group is at that level**; a new level can be added at the end (up to four).
- **A group cannot be archived while it has a live group inside it** (archive the inner ones first), and cannot be restored while its parent is archived or a live namesake exists. People in groups (P2) will block archiving in the same way.
- Order is a `sortOrder` the screen changes with move up / move down; two siblings swap. Moving a group to another parent is not in P1.
- The path shown for a group is its names joined with an en dash (`JSS-2-C`, `Juz A-Group 3`).

### 8.6 A branch of its own
Only the super admin, at creation. It creates a real `Branch` row (the school's branches have only a name), links it, and records it as `ownBranchId` (unique: a branch is the own branch of at most one program). Its administrators, staff and settings are then given the usual way, on the Users pages. The own branch cannot be unlinked from its program. The branch name defaults to the program name and must be unused (the existing rule: branch names are unique).

### 8.7 The switch `programs.enabled` (the ceiling, as in tasks 0040 and the question bank)
Stored as `SettingValue`: scope GLOBAL (the school) and scope BRANCH (a branch). **Effective for a branch = school AND branch**, default on. School off: the Programs page tells the super admin it is off (and offers the Settings link), lists nothing for anyone else, and every program change is refused with 409 `PROGRAMS_OFF` (existing programs stay and can be read by the super admin). A branch that switches it off cannot be linked to a program (409), and says so on the program's page if it was linked before. A branch can only narrow: storing "on" for a branch while the school is off is refused. Who edits: the school value, the super admin (Settings, "Programs" tab); a branch value, the super admin or that branch's administrator through the API (`PATCH /api/v1/settings/programs`); the screen for a branch administrator is not in P1 (the API and the audit are). Every change writes an `AuditLog` row.

### 8.8 Audit
`ProgramAudit` is append-only (no route updates or deletes it; a test reads the code path to confirm): program created, changed, activated, archived, restored; branch linked or unlinked; level names changed; group added, renamed, moved up or down, archived, restored; program admin named or ended. It holds who, what, the old and the new value and a reason where one was asked. The program's page shows the latest entries to the people who may manage it.

### 8.9 New request: suspension, expulsion and termination built properly (task 0045, after P1)
This replaces decision D2 of 4.3. The maintainer wants a **real** status on the school's own records, not only on a program place. Reading the code (2026-11-03): `StudentRecord` has only `archivedAt`; `EnrollmentStatus` has WITHDRAWN, TRANSFERRED, ALUMNI and no suspended or expelled; `StaffRecord` has only `archivedAt`; `Membership` has only `deactivatedAt`, and five readers (`withAuth`, `branch-access`, `memberships`, `complete-sign-in`, `forms/access`) plus the members service already treat "deactivated" as absent. Portal sign-in finds a pupil with `archivedAt = null`. The note for task 0045 is written before it is built; the shape it will take: a `standing` on the student and the staff record (ACTIVE, SUSPENDED with an optional end date, EXPELLED / TERMINATED) with a history table that records who decided, why and when; a suspension or expulsion applies to the branch the record belongs to; the existing school-wide archive and deactivate remain the "everywhere" action; what a suspended or expelled pupil can still do in the portal narrows the existing portal access (never widens it); the program places follow the school's record.

### 8.10 New request: part payment "if allowed" (task 0046, with the fees slice)
Read 2026-11-03: an invoice already records part payments (`amountPaid`, `PARTIALLY_PAID`), and both the recorded-payment and the Paystack paths accept any amount up to the balance with **no setting**. "If allowed" therefore needs a switch whose default keeps what exists today, a minimum part (an amount or a percentage of the invoice), and the ceiling rule (the school's value, a branch can narrow). Its note is written before it is built; it applies to student invoices first and to program invoices in P4.

### 8.12 Test results of P1, standing and part payment (task 0043 slice P1, 0045 and 0046; branch merged into `dev` 2026-11-04)
A full run before the fixes: 3,205 tests, **3,138 passed, 46 skipped (viewport-specific tests that skip themselves), 21 failed**, 3.5 hours. All 21 were read and fixed: the route-guard test (2), the members list shape (2), the standing API tests (4: two wrong assertions, one for behaviour that does not exist, one test that could never reach its guard), the standing and payment browser tests (12: a branch to choose, an ambiguous button name, the red UNPAID badge failing the contrast check in both themes, and an invoice dialog that closed when a mark was set), and one 2-minute timeout in the approvals screen (a late answer replacing the list of the branch just chosen). After the fixes: a 140-test rerun (134 passed, 6 failed on one ambiguous selector in a test), then 31 of 31, then a final regression run of 1,078 tests (every unit test and the finance, webhook, part-payment, approvals, shell and programs specs) on the final build: **1,038 passed, 40 skipped, 0 failed**. Not run: a second full suite on the final head, a test that forces the approvals answers out of order, mutation testing (deferred to the end of phase 2), a hosted database, a person using the screens by hand.

### 8.11 New request: programs may have assessments (slice P3b, written 2026-11-03, nothing built yet)
The maintainer wrote **"programs may also have assessments too"**. Read the same day, what already exists cannot simply be stretched to cover it:
- Class results (tasks 0011, 0014, 0015) are subjects, grading and result sheets per class arm and term, all keyed to a `StudentRecord`.
- LMS assignments and quizzes and the Forms module are tied to a class group and carry one `branchId`; a program can run in several branches and its people are not all students.
- None of them can address a program group or a participant who is an adult, a small child or someone with no connection to the school.

So program assessments are a small module of their own that reuses the school's vocabulary (marking states, an append-only audit, the score-entry screen pattern) and does not touch class results, quizzes or forms.

**Decisions (the best and safest defaults; the maintainer can change any of them):**
1. **What it is.** An assessment is one dated sitting (test, exam, oral or recitation check, practical, assignment) with a title, a kind label, a date, a maximum score (up to 1000, two decimals), an optional pass mark and an optional weight, given to the whole program, to chosen levels, or to chosen groups. Status: `DRAFT` -> `OPEN` (scores can be entered) -> `MARKED` (every expected score is in) -> `PUBLISHED` (the person and their guardian can see their own result) -> `ARCHIVED`.
2. **Scores.** One row per participant per assessment: a number from 0 to the maximum, or a result code (`ABSENT`, `EXCUSED`, `EXEMPT`, `NOT_SITTING`), plus an optional comment, the marker, a version number and the times. Entry is by hand first (it works for oral, recitation and paper work); online questions marked by the system are a later add-on, because Forms and quizzes are branch-scoped and need their own decision.
3. **Grading.** A program may define its own bands (for example Excellent from 85, Good from 70, with a pass mark). The class grading is not reused, since it hangs on class groups. With no bands the result is the percentage and pass or fail from the pass mark.
4. **Who may.** Super admin and program admin: create, edit, open, publish, correct. A program teacher (the roles arrive in P3): enter and change scores for the groups they are assigned to, only while the assessment is `OPEN`. Supervisor: read and mark `MARKED`. Branch admin: read only, and only the people of their own branch. A participant or guardian: only their own published result, through the portal tab of progress records (0044, R3). The server checks the role, the branch and the group on every route; nobody gets a row for a person outside their reach.
5. **Settings (ceiling rule of 4.5).** `programs.assessments.enabled`: school and branch default on (they only say whether it is allowed), the program's own switch defaults **off** ("may"), so a program that does not use assessments shows no tab; it is on only when school, branch and program all have it on.
6. **Standing (task 0045).** A participant whose place is suspended or ended, or whose record is suspended or expelled, on the sitting date has no score entered: the row reads "Not sitting (suspended)" and the person is left out of the averages. A score already given stays exactly as it was.
7. **Integrity.** Every score change appends a row to an append-only audit (who, old value, new value, reason; the reason is required once the assessment is published). A version check stops two markers overwriting each other. Published scores can be corrected only by the program admin or super admin, with a reason. Scores are never deleted. An assessment of a completed or archived program is read only.
8. **What it feeds.** Certificates (P5): an optional completion rule (overall weighted average at least X, and or every required assessment passed). The complete action shows who meets it and who does not; the admin can still complete a place with an override that records a reason. Progress records (0044): a participant's record page lists their published assessment results next to the entries, read only; the marks are not copied.
9. **Placement.** Slice **P3b**, after P3 and before P4 and P5. Slice P1 (built) holds nothing of it: the group tree already gives it the levels and groups to scope to, and the Overview has no "coming soon" tab.
10. **Limits.** At most 200 assessments per program, titles up to 120 characters, comments up to 500.

## 9. Slice P2 (people): design, written 2026-11-04 before any code
Standing (task 0045) is built, so this slice reads it instead of inventing statuses. The decisions below are the best and safest defaults; the maintainer can change any of them before P2 is built.

### 9.1 What P2 contains
The **People** tab of a program; who can be in a program and how they are added; a place in a group; moving, withdrawing and re-enrolling; the state of a place; suspension and expulsion for people who have no school record; the history; the guard that a group or a branch with people in it cannot be archived or unlinked. Not in P2: attendance and teachers' group scopes (P3), assessments (P3b), fees (P4), completion (P5), a spreadsheet import of people (listed in 9.9).

### 9.2 Who is a participant (one table, `ProgramParticipant`)
| Kind | What it is | Where its details live |
| --- | --- | --- |
| `STUDENT` | a pupil of the school | the `StudentRecord` (name, birth date and guardian are read from it every time; the program keeps no copy) |
| `STAFF` | a member of staff taking part (not teaching it: that is `ProgramStaff`) | the `StaffRecord` |
| `GUARDIAN`, `ADULT` | a parent or any adult, with no school record | the participant row: name (first and last required), optional gender, birth date, phone, e-mail |
| `CHILD` | a small child with no school record | the participant row, and a **birth date, a guardian's name and a guardian's phone are required** |
The earlier working kind `OTHER` is dropped: a person with no connection to the school is an `ADULT` or a `CHILD`. A pupil or a member of staff is added **by linking the record** (never by typing the same person in again). One participant belongs to **one program** (a person in two programs is two rows; a shared directory of people is a later decision, and nothing here prevents it). A linked record can be in a program once (unique on the program and the record). A **namesake guard** like the one for students (ADR 0011) warns when a standalone person in the same program has the same name and birth date or the same phone; an administrator can confirm, and the confirmation is audited.

### 9.3 A place: one live place per person, in one group, through one branch
`groupId` (any live group, at any level of the tree), `branchId` (the branch the person is in the program through), `status` (`ACTIVE`, `WITHDRAWN`, `COMPLETED`; `COMPLETED` is set only by slice P5), `joinedOn`, `endedOn` and `endedReason`. There is **no separate enrolment table**: a person has one place in a program, and leaving and coming back re-opens the same row, so attendance, assessments and progress records (which point at the participant) keep one continuous history; every move, withdrawal and return is a `ProgramAudit` row. The branch is **derived, not chosen**, for a linked person (the record's own branch), and **chosen** for a standalone person from the program's branches that the person adding them administers (a program admin or super admin: any). It must be a branch that has programs on (`programs.enabled`).

### 9.4 The state of a place is read, never copied
`placeState(participant, record, today)` is a pure function (unit-tested) that gives one of: `ACTIVE`, `SUSPENDED`, `EXPELLED`, `TERMINATED`, `ENDED_BY_SCHOOL`, `WITHDRAWN`, `COMPLETED`. In this order: a place that is withdrawn or completed says so; a linked pupil who is archived is `ENDED_BY_SCHOOL`, **expelled** is `EXPELLED`, **suspended** (today, by `studentStandingNow`) is `SUSPENDED`; a linked member of staff whose record is archived or whose membership is deactivated without a standing is `ENDED_BY_SCHOOL`, **terminated** is `TERMINATED`, **suspended** is `SUSPENDED`; a standalone person is `SUSPENDED` or `EXPELLED` by the standing stored on the participant. Because nothing is copied, **reinstating, restoring or lifting on the school's own page brings the place back with no repair step**, and a suspension in one branch (a pupil's or a member of staff's record belongs to one branch) touches only the places through that branch, while a school-wide staff suspension reaches every place of the person: exactly the maintainer's rule.
`takesPart(state)` is true only for `ACTIVE`. It is the contract the later slices use: a person who does not take part cannot be marked present (P3), cannot be given a score (P3b) and cannot have an entry written (task 0044); a `SUSPENDED` person can still be read.

### 9.5 Standing for people who have no school record
A standalone participant carries `standing` (`ACTIVE`, `SUSPENDED` with an optional last day, `EXPELLED`) and `standingUntil` on its own row, the same enum and the same rules as a pupil (`effectiveStanding`, the suspension ends by itself on its last day), with the same history table: `StandingEvent` gains the subject `PARTICIPANT` and a `participantId` (a **new migration** that adds the enum value and the column and re-creates the subject check; the 0045 migration is never edited once it has been merged). A database check keeps a linked participant at `ACTIVE`: **a linked person's standing lives only on the school's record.** "Expelled" for a standalone person means expelled **from this program**.
Who may: a **super admin** everything; a **program admin** suspends and lifts (the person's whole place, in their program); a **branch administrator** suspends and lifts the people through their own branch, never expels; **expel and reinstate are a super admin's**, as for pupils. Program admins and branch administrators are both held by the school's switch `standing.branchAdminMaySuspend` for the person's branch (a school that took suspending from branch administrators has not meant program admins to have it). A reason of 3 to 500 characters is required and kept in the history. For a linked pupil or member of staff the People tab shows the state and says where to change it ("Change this on the Students page"): **one place to discipline a person, so two screens can never disagree.**

### 9.6 Who may do what (all enforced on the server)
| Action | Super admin | Program admin | Branch admin of the person's branch | Anyone else |
| --- | --- | --- | --- | --- |
| See the people of a program | all | all | the people through their own branch | none (404) |
| Add a person (link a record, or type a standalone person), move to another group, withdraw, re-enrol | yes | yes | only people through their own branch | no |
| Edit a standalone person's details | yes | yes | own branch only | no |
| Suspend and lift a standalone person | yes | yes (while the school's switch allows) | own branch only (same switch) | no |
| Expel and reinstate a standalone person | yes | no | no | no |
A branch administrator sees only the people through their branch, so one branch never reads another branch's phone numbers. A teacher of the program gets their reading and marking rights in P3 and later, by group. The program must be `DRAFT` or `ACTIVE`; an archived or completed program is read only.

### 9.7 Rules around the tree and the branches (these change P1)
- A group cannot be archived while a person with an `ACTIVE` place is in it or in a group inside it ("move or withdraw them first", as 8.5 promised).
- A branch cannot be unlinked from a program while people are in the program through it.
- A level name cannot be removed while a live group is at that level (unchanged).
- A person can be moved only to a live group of the same program. Moving is audited (from and to).
- Bounds: 50,000 participants per program (a guard against a runaway client, one constant), 50 on a page.

### 9.8 Screens and routes (the work breakdown follows)
The People tab: a search box and filters (group, branch, kind, state), the list (a card on a phone) with the name, the kind, the path of the group (`Juz A-Group 3`), the branch, the state as a badge, and a menu of what the viewer may do. "Add people" offers: **a pupil or a member of staff** (search the school's records within the branches the viewer administers), **a whole class of pupils** (choose the class and arm, see who will be added and who is skipped because they are already in, archived or expelled, then confirm: one audited step), and **a new person** (adult, guardian or child). The Structure tab shows how many people each group has. Routes under `/api/v1/programs/[id]/people`: list, add, candidates, add a class, one person (read, edit, move), status (withdraw, re-enrol), standing. Every route is `withAuth`, strict zod bodies, a program the caller has no place in answers 404, and every change goes through the same `change()` guard as P1 (the program row lock, the switch, the audit).

### 9.9 Not in P2 (and why)
A spreadsheet import of standalone people (a second slice once the single-add flow is settled), a shared directory of people across programs, anonymising a person who asks to be forgotten (nothing is hard-deleted; the personal fields of a standalone person can later be blanked while the counts stay), messages to people, and a sign-in for a standalone person (an adult sees their own record only if they have an account; task 0044 section 4.6).

### 9.10 Work breakdown and tests
- [x] P2a Migration (`ProgramParticipant`, the enums, the checks, `StandingEvent` gets `PARTICIPANT`), the pure rules (`placeState`, `takesPart`, the namesake key, who may), services and routes, the P1 guards of 9.7
- [x] P2b The People tab, the dialogs, the counts on the Structure tab, matrix rows
- [ ] Tests: unit (the state table for every combination of kind, place status and standing), API (who may; each kind; the namesake guard; one place per person; the state follows the school's record both ways; a school-wide staff suspension reaches every place; a branch admin never reads another branch's people; the guards of 9.7; races on add and move), browser (add each kind, add a class, move, withdraw, suspend, desktop and phone, both themes, axe, no horizontal scrolling)


### 9.11 P2 as it is built (2026-11-04)
**What exists.** Two additive migrations, to be run in this order: `20261105090000_standing_participant_subject` (one enum value: PostgreSQL cannot use a value that was added in the same transaction, so it is a migration of its own) and `20261105100000_program_people` (the enums `ParticipantKind` and `ProgramPlaceStatus`, the table `ProgramParticipant`, `StandingEvent.participantId`, a unique index on `ProgramGroup` that lets a place name a group of its own program, and the checks). Pure rules in `src/lib/programs/people-rules.ts` (`placeState`, `takesPart`, the namesake keys, who may), the services in `people-service.ts`, the request schemas in `people-validation.ts`, eight routes under `/api/v1/programs/[id]/people` (list and add; candidates; classes; add a class; one person to read and edit; move; place; standing), the People tab (`ProgramPeopleTab`, `AddPersonDialog`, `people-model.ts`), head counts on the Structure tab, and the matrix rows PPL-01 to PPL-11.

**What the database now guarantees by itself** (checked by tests that go around the service): a pupil or a member of staff is LINKED and keeps no details on the row; a person typed in has names, and a child a birth date and a guardian's name and phone; a linked person's standing on the row is always ACTIVE; a place is in a group OF THIS PROGRAM, through a branch the program RUNS IN, and through the branch of the school's record for a linked person (composite foreign keys, so a branch cannot be unlinked while a place uses it); a pupil or a member of staff is in a program once; a place that is open has no end date and an end is never before the start.

**Decisions made while building** (the safest option each time; any can be changed):
- `change()` gained a third level, `"people"`: a super admin, a program admin, or an administrator of a branch the program runs in; the work then limits itself to the people through THEIR branches (a place outside that reach is a 404, not a 403).
- A branch cannot leave a program while any person **is or was** in it through that branch (409 `BRANCH_HAS_PEOPLE`). The foreign key would refuse it anyway, and a person who left keeps their history with the branch.
- A group with an open place is not archived (409 `HAS_PEOPLE`); one with only people who left can be.
- A person's standing is changed in one place only: a pupil's on the Students page, a member of staff's on the Users page; here it is refused with 409 `LINKED` and says where to go. Program admins and branch administrators suspend and lift people typed in only while the school's switch `standing.branchAdminMaySuspend` allows it (it holds both); expelling and reinstating are a super admin's. Each row carries what the viewer may do (`can`) so a button is not shown that would be refused.
- The list is ordered by the day people joined, newest first, because a name sort across a pupil's record, a staff record and a typed-in person cannot be paged in the database; the search box finds a name. A `state` filter is read from the school's records and so is applied in memory to at most 50,000 rows.
- A suspended pupil can still be added (a class is added as it is; the preview marks who is suspended); an expelled or archived one cannot.
- Not changed by P2: the branch of a place. A person is moved between groups, not between branches; to change the branch, withdraw and add again.

**Not built:** a spreadsheet import of people, a shared directory of people across programs, anonymising a person who asks to be forgotten, messages to people, a sign-in for a standalone person (section 9.9). Attendance and teachers' group scopes are slice P3.

**Tests.** Unit: `tests/unit/program-people.spec.ts` (the state of a place for every kind and standing, the namesake guard, the tree, who may). API: `tests/api/program-people.spec.ts` (who may, each kind, the state following the school's record both ways, a school-wide suspension reaching every place, the guards, the checks of the database, races). Browser: `tests/e2e/program-people.spec.ts` (desktop and phone, both themes, axe, no horizontal scrolling). Results of the batch's full run are recorded when it is done.

## 10. Slice P3 (staff and attendance): design, written 2026-11-04 before any code
Decisions are the best and safest defaults; the maintainer can change any of them before P3 is built. P3 builds on P2 (`placeState`, `takesPart`), so it cannot start before P2 is merged.

### 10.1 What P3 contains
Program teachers, supervisors and recorders with the groups they are assigned to; attendance sessions and the roll call; the correction history; summaries and a person's history; the program's **Settings** tab (the first switch that has an effect, as 8.2 promised: `programs.attendance.enabled`). Not in P3: offline marking, QR or card check-in, messages about absences, timetables, a spreadsheet export.

### 10.2 Program staff and their groups
- P1 names only the program **admin**. P3 adds the other three roles (`ProgramStaffRole` already has them): **SUPERVISOR** (reads everything in the program, corrects marks with a reason), **TEACHER** and **RECORDER** (mark attendance, and later enter scores and entries, for the groups they are assigned to).
- Who names whom: a **super admin** names every role; a **program admin** names supervisors, teachers and recorders (not another admin); a branch administrator names no one. The person must hold an **active staff membership in a branch the program runs in** (the rule of P1), read at every request.
- A new table `ProgramStaffGroup` (`programStaffId`, `groupId`) holds the assignment of a teacher or a recorder to groups; an assignment to a group **covers the groups inside it**, so a teacher of "Juz A" marks every "Juz A-Group n". A teacher or recorder with no group sees nothing. An admin and a supervisor reach every group.
- An assignment can be added only to a live group of the same program; archiving a group that still has an assignment is refused ("remove the assignment first"), as for people in 9.7.

### 10.3 Sessions and the roll call
- A program meets on the days it chooses, not on school days, so attendance is by **session**: `ProgramSession` (`programId`, `groupId`, `date`, optional `label` such as "Morning" or "After Asr", `createdBy`), unique on program, group, date and label (empty label counts as one value). A group can have more than one session a day (a label tells them apart). A session is **opened on demand** by the first person who takes the roll, so no job runs and no empty sessions pile up.
- The roll lists the participants of the group **and the groups inside it**, once each: those whose place is `ACTIVE` on that date (`takesPart`, 9.4), who joined on or before it and whose place had not ended before it. A `SUSPENDED` person is listed and flagged "Suspended", cannot be marked, and (as for pupils, 0045) the flag shows only for **today and later dates**, so an earlier day's roll is never rewritten by today's standing.
- `ProgramAttendance` (`sessionId`, `participantId`, `branchId` of the place, `status` using the existing `AttendanceStatus`: PRESENT, LATE, ABSENT, EXCUSED, `remarks` up to 200, `markedByUserId`, `markedAt`, `version`), unique on session and participant. Marking is one request for the whole roll (at most 500 marks), all or nothing, and a stale `version` on a row is refused with who changed it and when.
- **Who may mark:** super admin and program admin (any group); an assigned teacher or recorder (their groups) while the program is `ACTIVE` and the date is **not in the future and not older than 7 days** (the window is one constant; an admin can mark any past date); a supervisor corrects an existing mark with a reason; a **branch administrator reads only the people through their own branch** and marks none. A program that is `ARCHIVED` or `COMPLETED` is read only.
- Every change after the first mark is an append-only `ProgramAttendanceChange` (`before`, `after`, `by`, `at`, `reason`, required for a supervisor's or an admin's correction of a day more than 7 days old); no route updates or deletes one.

### 10.4 The switch and the ceiling
`programs.attendance.enabled`: school and branch default on, the program's own switch default on (attendance is "included" in the maintainer's words), on only when all three levels are on. Off at any level: the Attendance tab is not shown, the routes answer 409 `ATTENDANCE_OFF`, and what was recorded stays readable. The same `ceilingSwitch` pattern as `programs.enabled`, with the Settings tab showing "Off, set by the school" when a higher level decides it.

### 10.5 Reports
A **summary** for a group (and what is inside it) over a date range: per person the sessions held, present, late, absent, excused and a percentage (present and late over sessions held, excused sessions left out of both sides); a per-person **history**; a low-attendance flag at a threshold the program sets (default 75%). The same tab shows the week at a glance. Numbers are computed on the server from the marks, never stored.

### 10.6 Work breakdown and tests
- [x] P3 build: migration (`ProgramStaffGroup`, `ProgramSession`, `ProgramAttendance`, `ProgramAttendanceChange`, the `programs.attendance.enabled` key), rules (pure: who may mark, the roll for a date, the percentage), services, routes
- [x] P3 screens: the Staff tab (all four roles, group assignment), the Attendance tab (roll, summary, history), the Settings tab, matrix rows
- [ ] Tests: unit (the roll for a date for every place state, the percentage, the window), API (who may, each refusal, group coverage, the 7-day window, stale version, a suspended person cannot be marked, earlier rolls unchanged, branch admin reads only their people, all-or-nothing), races on opening the same session, browser (desktop and phone, both themes, axe)

### 10.7 P3 as it is built (2026-11-04)
**What exists.** One additive migration, `20261106090000_program_attendance`, to be run after `20261105100000_program_people`: two columns on `Program` (`attendanceEnabled`, default on; `lowAttendancePercent`, default 75, checked 1 to 100), two unique indexes that only add a guarantee (so a table can point at a staff place or a participant of its own program by a composite key), and four tables: `ProgramStaffGroup`, `ProgramSession` (unique on program, group, day and name), `ProgramAttendance` (unique on session and person, with a `version`) and `ProgramAttendanceChange` (no foreign keys, so the history outlives what it is about; a trigger refuses every UPDATE and DELETE). Nothing that exists is changed, and the release before this one never reads any of it.

**Routes.** `PUT /programs/[id]/staff/[staffId]/groups`; `GET`/`PUT /programs/[id]/attendance` (the roll; save the roll); `GET .../attendance/sessions`, `.../attendance/summary`, `.../attendance/people/[personId]`; `PATCH /programs/[id]/settings`; `GET`/`PATCH /settings/programs-attendance`. The staff routes of P1 now take a `role` (`ADMIN` by default, so the old calls still mean what they meant).

**What the database now guarantees by itself:** an assignment is to a staff place and a group OF THIS PROGRAM; a session is of a group of this program; a mark is for a participant of this program and for one session; one session per program, group, day and name; one mark per person per session; a name is trimmed and at most 40 characters; remarks at most 200; the threshold 1 to 100; the correction history is append-only.

**Decisions made while building** (the safest option each time; any can be changed):
- **Reading stays open when attendance is switched off; only writing is refused** (409 `ATTENDANCE_OFF`). The design said "the routes answer 409"; a roll, a summary and a person's history are what was recorded, and "what was recorded stays readable" would be false if they vanished. The Attendance tab is hidden while it is off.
- **Three levels, with a branch that can leave on its own.** Attendance is on for a program when the school, the program and at least one of its branches have it on. A branch that has it off does not switch the others off: its people are not on any roll and cannot be marked (they show "Branch has attendance off"), while the other branches go on. Only when every branch has it off is the whole program off (the screen says "switched off in every branch this program runs in"). A branch can never turn it on when the school has it off.
- **Rights come from the staff places, not from the level of the viewer.** A branch administrator who is also named a teacher or a recorder keeps those rights; a branch administrator alone reads the people through their own branch and marks none. A person who is both a supervisor and a teacher creates marks in their own groups and corrects marks elsewhere, with a reason.
- **The server tells the screen what it may do** (`rights`: create, change, reasonOnChange; `earliest`; per row `canEdit`), and checks again on every save. A teacher or a recorder: today and the 6 days before. An administrator: any past day, and a reason when changing a mark older than that. A supervisor: changes what exists, on any day, always with a reason; cannot add a mark.
- **A save is partial by design:** not everyone has to be marked (a class can be taken in two goes); "Mark everyone present" fills only those with no mark and no choice yet.
- **A mark that equals what is stored writes nothing** (and asks for no version); a change needs the version the screen saw, and a version for a mark that does not exist, or none for one that does, is refused as `CHANGED`. The correction history keeps a row for every change after the first mark (before, after, who, when, why). The mark keeps the person who first took the roll (`markedByUserId`); who changed it later is in the history (found while building: the first version overwrote it, so a supervisor's fix made the roll say the supervisor had taken it).
- **A roll is the record of its day.** On a past day everyone whose place was open that day is listed and markable whatever their standing is today; today, a suspended person is listed with a flag and cannot be marked, and anyone expelled, terminated, ended by the school or gone is off the roll. Someone with a mark in the session who has since moved or left is still shown, read only.
- **Days are UTC calendar days**, like the standing rules. A day before the program's start date cannot be marked (400 `BEFORE_START`).
- **Naming a person again starts with no groups.** Found while building: ending a teacher's place and naming them again re-opens the same row, and their old group assignment would have come back by itself. The assignments are now cleared on naming; they stay in the audit. An ended place's assignments stop counting at once (the place is no longer active), and a group is not archived while an ACTIVE place is assigned to it (409 `HAS_STAFF`).
- **Limits:** 500 marks in a save, 240 saves per person per window, a summary lists at most 2,000 people, a person's history 400 marks, the sessions of a range 500, and a range at most 366 days.
- **Numbers:** present and late over present, late and absent; excused is left out of both sides; none held is "No marks", not 0%; whole percent, half up; the summary lists the lowest first. A teacher's, a recorder's and a branch administrator's numbers cover only the people and groups they may see.

**Not built:** offline marking, QR or card check-in, messages about absences, timetables, a spreadsheet export (section 10.1).

### 10.8 Test results of P2 and P3 (batch A, 2026-11-04 to 05)
**Final run, on the final build:** 3,385 tests, **3,338 passed, 46 skipped (viewport-specific tests that skip themselves), 1 failed**, 3.6 hours. The one failure was `tests/https/host-cookie.spec.ts` (the first sign-in over HTTPS stayed on the login page); it passed 3 out of 3 when run again on its own, and nothing in this change touches sign-in, so it is recorded as a timing flake, not fixed.

**What the new tests cover.** Unit: `program-people`, `program-people-ui`, `program-attendance` (the roll for every place state, the percentage, the window, `rightsFor`, `reachOfAccess`) and `program-attendance-ui`. API: `program-people` and `program-attendance` (who may; each refusal; group coverage; the 7-day window; a stale or missing version; all or nothing; a suspended person; earlier rolls unchanged; a branch administrator reads only their people; the three levels of the switch; the numbers; races on opening a session, on marking the same person and on correcting the same mark; the database's own checks and the append-only history). Browser (desktop and phone, both themes, axe): `program-people` and `program-attendance`. Matrix rows PPL-01 to PPL-11 and PAT-01 to PAT-14.

**Found by the tests and by reading the code while building, and fixed before the final run:** a branch administrator's `branchId` filter replaced their reach and showed another branch's people; `q=%` matched everyone; the date rule threw on an impossible date such as month 13; a second switch panel on the Settings tab would have made two existing browser specs ambiguous (the second panel now has its own wording); a correction overwrote the person who first took the roll; naming a staff place again brought its old groups back. The other failures of the earlier runs were wrong expectations in my own specs, corrected after reading each (6 API tests, and 2 browser runs of one test, desktop and phone: an id such as `not-an-id` is well formed and gets 404, a deactivated membership is stopped at the route's role gate with 403, the exact `can` objects, the text of the page for a program you have no place in).

**Not run:** mutation testing (deferred to the end of phase 2); anything against a hosted database; a person using the screens by hand; a test with thousands of people in one group (the limits are set in the code, 2,000 summary rows, 400 history marks, 500 sessions, but not load tested).

## 11. Slice P4 (fees): design, written 2026-11-04 before any code
This slice was flagged in 4.6 to decide between giving `Invoice` a participant link and a separate invoice. **Decision: a separate set of tables for programs, reusing the finance module's pure rules and helpers.**

### 11.1 Why separate
`Invoice` requires a `studentId`, a term (`periodId`), is unique on branch, student and term, and is the parent of `Payment` through composite keys; every finance screen, the part-payment rule (0046) and the gateway webhook read it. Making the student and the term optional would change a table that holds real money, in the module most expensive to get wrong, for people who are not students. A program has no terms. Separate tables leave every existing invoice and payment untouched and are additive in the migration.

### 11.2 What is reused
The pure part-payment rule and the school's and branch's policy (`checkPart`, `effectivePolicy`: **one rule for the school's money, whoever the payer is**), the invoice row lock before a payment is taken, `allocateReceiptNo` for receipts, the Paystack initialise and verify helpers, `naira()` wording, the amounts and rounding helpers, and the look of the invoice and receipt screens. The gateway webhook finds a payment by its reference in either table (references carry a prefix so they cannot collide).

### 11.3 Entities
- `ProgramFeeItem`: program, name (up to 80), amount (0.01 to 10,000,000, two decimals), `frequency` (`ONCE`, `MONTHLY`, `YEARLY`; no terms, a program has none), optional due day, `audience` (JSON, validated: participant kinds, branches, groups with their inner groups; an empty list means everyone), `exempt` (participant ids), optional `discountPercent` (0 to 100), `billedTo` (`PARTICIPANT` or `GUARDIAN`), status `ACTIVE` or `ARCHIVED`. At most 200 items per program.
- `ProgramInvoice`: program, branch (the branch of the place: each branch collects and sees its own money), participant, `periodKey` (`once`, `2026-11` or `2026`), `invoiceNo` (`PINV-2026-0001`, unique), total, amount paid, status (the existing `InvoiceStatus`), due date, `payInFull`, `lineItems` (a snapshot of the item name, amount and discount when the invoice was made), the billing contact snapshot (name and phone). Unique on program, participant and period key, so generating again never duplicates.
- `ProgramPayment` and `ProgramInvoiceDiscount`: the same shape as `Payment` and `InvoiceDiscount`, pointing at a `ProgramInvoice`, with an audit of every discount.

### 11.4 Rules
- **Who an item is for** is a pure function `feeApplies(item, participant, place)` (unit-tested): kind, branch, group subtree, not exempt, item active. "Staff of a branch do not pay" is an audience that leaves out the kind `STAFF`, or an exemption.
- **Generating invoices** is an explicit action for one period key: a preview lists who gets an invoice, who is skipped and why, and the total, then one confirmed step makes them in one transaction under the program lock. It makes invoices for places whose state is `ACTIVE` or `SUSPENDED` (a suspension does not cancel a fee; a person who has left owes nothing new, and their old invoices stay visible and payable, as in 0045). It never changes an invoice that exists. A fee item added later can be **added to open invoices that have no payment yet** (explicit, audited), never to a paid or part-paid one.
- **Billing a guardian** uses the contact on the record: a pupil's guardian fields, a child's required guardian, an adult's own details. The portal's pay button is still not built (as in 0046); staff record the payment or start a gateway payment.
- **Payments** go through the same locked path as 0046: the invoice row is locked, the part-payment rule of the invoice's branch applies, `payInFull` can tighten it, the webhook is not subject to it (money already sent is accepted).

### 11.5 Who may, the switch, the ceiling
- Fee items, generating invoices, a program-wide discount: a **super admin** or a **program admin**. Recording a payment or a discount on one invoice: also a **branch administrator** of the invoice's branch. A branch administrator sees only invoices through their branch. Teachers and supervisors see none. A program the caller has no place in answers 404.
- `programs.fees.enabled`: school and branch default **on** (they only say whether it is allowed), the program's own switch default **off**, as for assessments, so a program with no fees shows no tab; on only when all three are on.
- An `ARCHIVED` program refuses new invoices and new items; payments on open invoices are still accepted. A `COMPLETED` program too.

### 11.6 Reports and not in P4
Collected, outstanding and the collection rate per program, branch and group; a list of people who owe, for the people who may see them. Not in P4: a pay button in the portal, instalment plans, refunds, scholarships beyond a percentage, other currencies, tax, a statement sent to the payer.

### 11.7 Work breakdown and tests
- [ ] P4 build: migration (the four tables, the `programs.fees.enabled` key), pure rules (`feeApplies`, the period key, totals), services (items, preview and generate, record payment, discount, gateway start), routes, the webhook lookup
- [ ] P4 screens: the Fees tab (items, generate, invoices, an invoice, record a payment, reports), matrix rows
- [ ] Tests: unit (`feeApplies` for every audience combination, the period key, totals and discounts), API (who may, each refusal, nothing duplicated when generating twice, a paid invoice is never changed, a branch administrator sees only their branch, the part-payment rule applies and the webhook is exempt, two payments at once, the webhook finds a program payment), browser (desktop and phone, both themes, axe)

## 12. Slice P5 (completion and certificates): design, written 2026-11-04 before any code
Who signs a certificate and how it looks was an open question (section 7). The defaults below are the safe choice; the maintainer can change the wording and the signatories at any time because both are stored per program.

### 12.1 What P5 contains
Completing one place or a whole fixed-term program; certificates, their public check page and a print-ready page; withdrawing a certificate. Not in P5: images of signatures, certificates in bulk by e-mail, a template designer.

### 12.2 Completing
- **One person's place** can be completed at any time by a super admin or program admin (a Quran memoriser finishes a level in a continuous program): the place becomes `COMPLETED` with the date and a note, and a certificate can be issued.
- **A whole program** is completed only if it is fixed-term and has reached its end date (the banner of 4.4). The screen first **shows** who will be completed (`ACTIVE` places), who is skipped and why (suspended, expelled, withdrawn, ended by the school), who does not meet the **completion rule** if the program has one (an optional rule from P3b: weighted average at least X and, or, every required assessment passed), and, when fees are on, who still owes. Then one confirmed step, under the program lock and in one transaction, completes the places and sets the program `COMPLETED`. A person who does not meet the rule is completed only with an **override and a reason** that is kept. Owing money **warns and never blocks** unless the program turns on "no certificate while fees are owed" (default off).
- A continuous program is never completed as a whole; it is archived. Completing is not undone; a mistake is corrected by withdrawing the certificate (12.3) and, for the place, by a super admin reopening it with a reason (audited).

### 12.3 Certificates
- `ProgramCertificate`: program, participant, `serialNo` (`CERT-2026-0001`, unique), a random **`verifyToken`** (unique across certificates and report-card tokens, so the one public page can tell them apart), `issuedOn`, `title`, the **wording as it was when issued** (a snapshot: a later change to the wording never changes an old certificate), up to two **signatories** (a name and a title, typed text), `status` `ISSUED` or `REVOKED` with `revokedAt`, `revokedBy`, `reason`. Nothing is ever deleted. A new certificate for the same person after a withdrawal gets a new serial and points at the one it replaces.
- **Wording** is stored on the program: a title (default "Certificate of Completion"), a body with a few placeholders (`{name}`, `{program}`, `{from}`, `{to}`), and the signatories; the defaults say the school's name and nothing about marks. It is plain text, rendered as text (never markup), up to 600 characters.
- **Issue:** by a super admin or program admin, for completed places, one or all in one step (idempotent: a person with an `ISSUED` certificate for this completion is skipped). Each is an audited `ProgramAudit` row.
- **Print-ready page** `/programs/[id]/certificates/[certId]` for staff (and, later, for the person from the portal): the school's look, the wording, the signatories and a **QR code** (the `qrcode` package is already a dependency) to the public check page; printed from the browser (the module's existing print approach), so no new PDF library is added.
- **Public check page** `/verify/[token]` (already exists for report cards) also finds a certificate: it says the certificate is genuine, the program, the completion date and the person as **first name and last initial only** (a child may be on it), never marks, phone or guardian; a withdrawn one says so. Rate limited as today.

### 12.4 Who may, the audit, the ceiling
Completing and issuing: super admin and program admin. A branch administrator sees the certificates of people through their branch. The person and their guardian see their own certificate only through the portal tab of 0044 (R3). Every complete, issue, withdraw and reopen is in `ProgramAudit`. No new switch: certificates are part of completing, and the program's own wording is the only setting.

### 12.5 Work breakdown and tests
- [ ] P5 build: migration (`ProgramCertificate`, the wording fields on `Program`, the place's completion fields), pure rules (who is completed, the completion rule, the serial), services, routes, the public lookup
- [ ] P5 screens: the Completion screen and the Certificates tab, the print page, the verify page change, matrix rows
- [ ] Tests: unit (who is completed for every place state, the rule, the override), API (who may, each refusal, a continuous program cannot be completed, the end date, owing warns, issuing twice does not duplicate, a withdrawn certificate says so on the public page, the public page shows first name and last initial only and no private data, an old certificate keeps its wording), browser (desktop and phone, both themes, axe, the print page fits one page)

## 13. Build order and how the slices are tested
P1 (with standing and part payment) is built and in its first full run. The rest follow in this order, each slice designed above before its code: **P2, P3**, then **P3b, P4, P5**, then the progress records (task 0044, R1 to R5). Slices that depend on each other are built **together on one branch with one full run**, as P1, standing and part payment were: batch A = P2 and P3 (people and attendance), batch B = P3b, P4 and P5 (assessments, fees, completion), batch C = progress records R1 to R3, then R4 and R5. Each batch is one pull request with a commit per slice, the migrations additive and listed in `docs/open-items.md` in the order the maintainer runs them. A batch is not started until the one before it is merged, because the next builds on its code.
