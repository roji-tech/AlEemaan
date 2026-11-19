# 0112: Invite staff from their records, transfer staff between branches, class teachers on the Classes tab, list filters and export, records in the top-bar search, the scheme list in one request

- **Period / Focus:** 2026-11-19 (maintainer requests, batch 1 of the backlog sweep)
- **Status:** In Progress
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/backlog-sweep` / PR into `dev`
- **Started:** 2026-11-19

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What the maintainer asked (2026-11-19)

- With the Invite dialog open: "so how do I get to select a staff email or multiple from here?" and "you don't expect me to start copying each staff email from staff page to users page do you?"
- On the Users page: "we also wanna have staff tab here too".
- "can we add transfer to the list of options in staff card under staff tab in both /academic and /users so we can use that to transfer a staff or add a staff to another branch".
- "how do we assign class teachers or class master or class mistress (mostly called class teacher I think) to classes?"
- "can you start these now ... in one sweep", for the backlog:
  - export of the lists (task 0103 D3; its filters D1 were not built either);
  - records in the top-bar search (task 0107 D8);
  - one request for the scheme list (task 0108 D3);
  - sign-in through one door, access codes and slips (task 0094), and the rest of task 0101. Those come in batch 2.
- "we need to be fast ... implement and test in batches".

## 2. Decisions

These were made by the secure-and-best rule (the maintainer: build the best and secure option; do not park it).

### D1. Invite staff from their records (task 0101 D6)

**Where you start:**
- Every staff card has **Invite to sign in** in its menu, when it can be invited. That means a live, active record with an e-mail address, no sign-in yet, and no link still waiting.
- The Manage dialog has the same button.
- The staff list has a tick box on each such card, a **Select everyone who can be invited (N)** button, and a bar: "N selected · Clear · Invite to sign in".
- The **Invite someone** dialog starts with "Inviting your staff? … **Choose from staff records**", which opens the new Users › Staff tab.

**What it sends** (`POST /api/v1/staff/invite { branchId, staffIds }`):
- One invitation per record, at the address on the record.
- The role comes from the kind: Teaching → Teaching staff, Non-teaching → Non-teaching staff. An administrator is only ever invited by hand.

**Rules:**
- Every rule of an ordinary invitation applies (`createInvitationIn`). Only a branch the caller administers. One open link per address and branch. A deactivated person is reactivated, not invited.
- Each record is its own transaction, so one that cannot be invited never stops the others. The answer lists each one as invited, linked or skipped, with why (no e-mail, already invited, signs in with another role, two selected records share an address, and so on).

**Linking the account:**
- The invitation carries the record (`Invitation.staffRecordId`).
- Accepting it links the new account to the record in the same transaction. That happens only when the record is live, in that branch, has no account yet, its kind matches the role, and the account is not already another record's.
- An address that is already an active member of the branch with the matching role, and free, is linked at once instead of invited. This is the same check as Manage › Link to a member, and it is audited `STAFF_ACCOUNT_LINKED`.

**Limits:** 200 records per request and per administrator per 5 minutes. Each address keeps its own mail limit.

**The card says:** "Invited, waiting", or "Invitation ran out" (which can be invited again).

### D2. Users › Staff tab

The same staff list as Academics › Staff, for the branches the person administers: tick boxes, invite, transfer, edit, manage. It is in the address (`?tab=staff`) and in the search index ("Staff sign-in").

### D3. Transfer or add to another branch (task 0101 R1)

The staff card's menu has **Transfer or add to another branch**, on Academics › Staff and Users › Staff. It shows only when the person administers another branch.

**Who:** a superadmin, or an administrator of BOTH branches.
- The record's own branch decides "not found" (404). The other branch decides "not yours" (403).

**Both choices** make a record in the other branch with the person's own details. Those are names, title, gender, contacts, qualification, corps member, job title, role and next of kin. Nothing is typed again.
- The two records share one `personId` (new column), so each card says **Also in: …**.
- What belongs to a branch is never copied: subjects taught, class-teacher roles, attendance grants, standing and program places.

**The two choices:**
- **Also works in X:** the record here stays.
- **Move to X:**
  - The record here is archived.
  - Its subject assignments and attendance grants are removed, and its class-teacher roles cleared. The dialog says how many first (`GET …/transfer`), and the audit entry keeps the counts.

**The sign-in follows the person:**
- The account becomes a member of the other branch with the role the kind gives (never an administrator) and is linked to the new record.
- On a move, the membership here is deactivated.
- A deactivated membership in the other branch is left alone and reported.

**Refused:**
- An archived or suspended record.
- The same branch.
- A branch that already has this person, or a live record with the same e-mail.

**Safety:** everything runs in one transaction, with an advisory lock per record. Audited `STAFF_TRANSFERRED` / `STAFF_ADDED_TO_BRANCH`.

### D4. Class teachers on the Classes tab

**Before:** an arm's class teacher (`ClassArm.classTeacherId`, the person who may take its register) could only be set under Attendance › Manage Permissions.

**Now:**
- Each arm on Academics › Classes shows its class teacher under the arm, or "Set class teacher" for an administrator.
- That opens a dialog: live, active staff of the branch, teaching staff first, or "No class teacher".
- It uses the existing route and rules (`PATCH /api/v1/academics/arms/[id]/class-teacher`).
- The staff card says "Class teacher: JSS 1 A".

### D5. Pupil filters (task 0103 D1)

**The filters:** Class (or "No class yet"), Arm (when the class has several), Gender, and Age from and to.
- They are applied by `GET /api/v1/students`, so counts and pages follow them.
- A class is the class of the pupil's enrolment in the branch's ACTIVE session (with no active session, any enrolment).

**Age:**
- Worked out on the school's day in `SCHOOL_TIME_ZONE`, by the pure `birthDateRange`. A child born on 29 February turns a year older on 1 March.
- A pupil with no date of birth is left out when an age is asked for, and the list says how many were.

**Errors:**
- A class or arm of another branch is a 404, like an unknown id.
- A class without a branch, an arm without a class, or a lowest age above the highest is a 400.

### D6. Export (task 0103 D3, D4, D5)

**Where:** an **Export** button on Pupils, Staff, Classes and Subjects, for an administrator of the branch.

**The choices:**
- **What:** "The N shown now, with the search and filters on", or "Everything in <branch>" (with "Include the archived").
- **Format:** Excel or CSV.

**Columns:** exactly the import template's, in the same order and words, so a file can be corrected and imported again.

**Security:**
- The server picks the rows (`POST /api/v1/exports`). Pupils use the list's own `studentListWhere`. Staff, classes and subjects use the ids on screen, intersected with the branch.
- Administrator of that branch or superadmin; a teacher is refused.
- Audited `EXPORT_CREATED`: the list, the choice, the filters (a search is recorded as used, not its words) and the row count, never the data.
- 5 exports per person per 5 minutes, and 20,000 rows at most.
- `no-store`.

**Writing the file:** the browser writes it with the template writers. CSV has a byte-order mark, and a cell that would run as a formula gets an apostrophe. In the Excel file every cell is text.

**File name:** `pupils-primary-english-filtered-2026-11-19.xlsx`.

### D7. Records in the top-bar search (task 0107 D8)

**What it finds** (`GET /api/v1/search?q=`):
- pupils (name or admission number)
- staff (name or e-mail)
- classes
- subjects (name or code)
- invoices (number)
- for a superadmin, people with an account

**Rules:**
- Staff only.
- Only from the branches the viewer may read. Invoices only from branches they administer.
- 5 of each kind at most, current records only.
- Each result is a title, the one line that tells namesakes apart, and the address of its own list, already filtered (`?branch=&q=`, which the Students, Academics, Finance and Users pages now read).
- Rate limited to 150 per person per 5 minutes.

**On screen:**
- The field asks after a 250 ms pause. Records are shown AFTER pages and settings, so a late answer never moves the highlighted result.
- A record is never stored on the device (the recent list keeps destination ids only).

### D8. The scheme list in one request (task 0108 D3)

- `GET /api/v1/academics/schemes/class-group?branchId=` answers every live class with its scheme, or null.
- It uses the same helper (`schemesForClassGroups`) as the one-class read, so the two always agree. Ten classes were ten requests; now they are one.

## 3. Migration (the maintainer's to run on production after the prod merge)

`20261119130000_staff_invite_and_person`: `Invitation.staffRecordId` (nullable, set null on delete) and `StaffRecord.personId` (nullable), with their indexes. Additive.

## 4. Work

- [x] D8: `lib/academics/class-group-schemes.ts`, the list route, `SchemeLevelsPanel`.
- [x] D5, D6: `lib/students/list-filters.ts` (+ `-server.ts`), `studentListWhere`, `lib/bulk/list-export.ts`, `api/v1/exports`, `components/bulk/ExportButton.tsx`, the four panels.
- [x] D7: `lib/search/records.ts`, `api/v1/search`, `GlobalSearch` records, the deep links (students, academics, finance, users).
- [x] D1 to D4: the migration; `lib/academics/staff-invite.ts`, `api/v1/staff/invite`, the accept link; `lib/academics/staff-transfer.ts`, `api/v1/staff/[id]/transfer`; `components/academics/StaffAccess.tsx`; `StaffPanel`, `UsersPanel`, `InviteDialog`, `ClassesPanel`, `listClassGroups`; menu icons; the search index.
- [ ] Tests (section 5) and the record (section 6).

## 5. Tests

**Unit:**
- `birthDateRange`: birthdays, 29 February, the year end, min above max.
- The export columns equal the import templates.
- The export file name.
- The search query words.
- `invitable`.

**API:**
- The scheme list.
- Exports: who may export, the rows equal the list, the audit row has no data, the cap and the limit.
- Pupil filters.
- Staff invite: each outcome, and accepting links the record.
- Transfer: also, move, the account follows, who may.
- Search scoping: another branch, invoices, accounts.
- The class teacher on the class list.

**Browser:** Users › Staff tab, select and invite; transfer from the menu; class teacher on Classes; the export dialog; the pupil filters; a record in the top-bar search.

## 6. Build record

Filled from the run logs before merge.
