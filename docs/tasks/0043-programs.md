# 0043: Programs (a structure beside the branches and classes, for learning that is not a normal class)

- **Period / Focus:** requested 2026-11-03 by the maintainer; design written the same day, nothing built yet
- **Status:** Design (plan written 2026-11-03; no slice started)
- **Priority:** High (progress records, task 0044, sit on top of it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR per slice, each off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
The school runs learning that is not a normal class in a branch: for example a Quran memorisation programme that never ends and has its own classes, categories and sub-classes, or a course of six months, three years or five years that looks like a school session but is limited. People in it may be existing students, adults, small children, staff, guardians, or people with no earlier connection to the school. A **program** is the structure that holds them: its own groups, its own people, its own staff, attendance, and (later) fees, certificates and progress records (task 0044).

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
| `ProgramAudit` | who changed what (structure, people, statuses, settings), append-only |

**Depth, not width.** A program names up to four levels; each level can have as many groups as it likes (Classes 1 to 30, Juz A to Z). Four is a cap to keep screens and paths readable; it is one constant if a school needs more.

**Branch rules.** A person is in a program *through a branch* (`ProgramEnrollment.branchId`): an existing student through their own branch; a person with no connection through a branch chosen when they are added. That branch decides which branch admin may manage them and which branch's settings narrow what they see. A program with a branch of its own creates the `Branch` row with the program (a branch admin, staff and settings of its own).

### 4.2 Who may do what
- **Super admin (school-wide ADMIN):** everything, in every program; names the program admin; sets the school-wide settings (the ceiling).
- **Program admin (`ProgramStaff.role = ADMIN`):** the program's structure, people, staff and settings, across the branches the program runs in.
- **Branch admin:** the people and staff of *their own branch* inside a program that runs in it; not the structure and not other branches' people.
- **Supervisor, teacher, recorder:** what task 0044 and the attendance slice give them; a program teacher marks attendance for the groups they are assigned to.
- Hiding a button is a courtesy. Every route checks the person's role and branch on the server, like the rest of the app, and a program's data is never returned to someone who has no place in it.

### 4.3 Statuses and the school's own records (decision D2)
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
- [ ] **P1 Structure:** `Program`, `ProgramBranch`, level labels and the group tree, the program's own branch option, the Programs page (list, create, a program's page with Overview, Structure, People, Staff, Settings tabs), the sidebar entry "Programs" in the Classroom section, audit, the ceiling settings, tests (API and browser, both themes, phone), matrix rows, docs
- [ ] **P2 People:** participants (existing student, staff, guardian, adult, child, someone with no connection), enrolment in a group through a branch, the statuses and their effect on one branch, `ENDED_BY_SCHOOL` from the existing archive and deactivate actions, history
- [ ] **P3 Staff and attendance:** program staff and their roles, attendance for programs (sessions, the roll call, who may mark), reports
- [ ] **P4 Fees:** fee items, who they are for, exemptions and discounts, invoices and payments for participants (its own design note first)
- [ ] **P5 Completion and certificates:** the complete action, certificates with the public verify page
- [ ] Octalve Edu parity (its own task, after AlEemaan's slices land; its structure is schools and campuses, with the same ceiling rules between a school administrator and a campus administrator)

## 6. Not in the first slices
Terms or sessions inside a program (a program has dates, not its own academic calendar); results, report cards and promotion for programs (a program is not graded the way a class is; progress records, task 0044, are its record); timetables for programs.

## 7. Open items (defaults are used unless the maintainer changes them)
- Who signs a certificate and how it should look: asked in P5.
- Whether a person with no connection to the school and no account can see their own progress: they can if they have an account; otherwise a teacher or guardian shows it to them (task 0044, section 4.6).
- Whether a real suspended or expelled status belongs on the student and staff records themselves: a separate task, see 4.3.
