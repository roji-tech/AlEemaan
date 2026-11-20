# 0118: Sweep 2: drafts-aware accept rule, staff with no branch yet, draft invitations, departments in bulk staff and the selection bar, remembered branch in the last pickers, head-of-department review (design)

- **Period / Focus:** 2026-11-20 (the maintainer: "start in sweep", for the remaining task 0101 items: staff with no branch, draft invitations, the Department column in bulk staff and "Add to department", head of department approving results, the pickers that still reset, and making the accept rule and the unlisted list skip drafts)
- **Status:** Built; the API and browser specs are written and not yet run (section 7)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/sweep-2` (built on the combined batch and `claude/staff-ux`) / to be opened into `dev`
- **Started:** 2026-11-20

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What exists (read from the code, 2026-11-20)

- Drafts (task 0101 D1) and the shared predicates `LIVE_STAFF` / `LIVE_PUPIL` (`lib/drafts/live.ts`) are built. The staff invite already skips drafts (`staff-invite.ts`, why "Draft: complete the record first.").
- `ensureStaffRecord` (the accept rule, task 0112 D9) and `unlistedMembers` did not know about drafts.
- `StaffRecord.branchId` is required. Every branch-scoped table that points at a staff record does so through the pair (`branchId`, `id`), so a record with no branch cannot be pointed at by any of them (assignments, class teacher, attendance grants, timetable, programs, coursework): the schema already enforces "a record with no branch has none of these".
- An invitation row is made and e-mailed in one step: `tokenHash`, `expiresAt` required, no `sentAt`.
- Departments (D7) exist: `Department`, `DepartmentMember`, `canManageDepartment`, the members route. The bulk staff kind has no Department column; the selection bar has Invite only.
- `useBranchSelection` (task 0117) remembers the branch for the pickers it was adopted in; Results, Settings, Forms and the Question bank still start on the first branch.
- Results review (`results-workflow.ts`): the states and who moves them are read in section 6 (item F).

## 2. Decisions (defaults are mine; the maintainer may change them)

### A. The accept rule and the unlisted list skip drafts
- `ensureStaffRecord` links only a LIVE record (`LIVE_STAFF`: not archived, not a draft). A draft that holds the person's address is left alone and `ensureStaffRecord` answers `"draft"`: no second record is made (the address is taken), nothing is linked, and the person stays under "not on the staff list yet" until the draft is completed. `POST /api/v1/staff/from-member` answers 409 with "A draft staff record holds their e-mail address. Complete the draft, then link their account from Manage."
- The invitation accept links a record named by the invitation only if it is still live (a record made a draft since is left for the unlisted list).
- `unlistedMembers` lists a member only when the branch has NO record linked to them (it already checks `staffRecords: { none: {} }`, drafts included); a draft cannot hold a sign-in, so this stays true.

### B. Staff with no branch yet (task 0101 D3)
- `StaffRecord.branchId` becomes nullable (migration `20261120090000_staff_no_branch`: `DROP NOT NULL`). The foreign keys and the composite keys stay as they are; a composite key with a null column is not checked, and the tables that point at a record need a non-null branch, so an unplaced record has no assignments, class-teacher role, grants, timetable slots, program places or coursework by construction.
- Unique e-mail: the live-address index is per branch and a null branch never collides, so a second partial unique index keeps unplaced addresses unique among themselves: `StaffRecord_email_unplaced` on `lower(email)` where the branch is null, the address is set and the record is not archived. Placing a record into a branch that already has a live record with that address is a 409.
- **Who:** only a superadmin sees or changes an unplaced record. Everything that resolves a record's branch treats null as "superadmin only": for anyone else the record is a 404 (never a 403, so its existence is not shown).
- **Where it shows:** the staff panel's picker (a superadmin) has "Not placed in a branch" next to "All branches". The list is the same cards. "New staff record" there makes an unplaced record (no branch asked). "Place in a branch" asks for the branch, writes `STAFF_PLACED` (from null to the branch), and 409s on a live address clash in that branch. After that the branch's administrators manage it.
- **Left out by construction:** every branch list, count, class-teacher choice, export, search, invitation and transfer filters by a branch id, and `null` never matches. The All-branches list for a superadmin used to carry no branch filter at all, so it now says `branchId: { not: null }` on purpose (and so does the superadmin's record search). Until placed, an unplaced record cannot be invited, assigned, made a class teacher or given attendance rights. **How that answers:** every route that acts on a record through its branch (`withBranch` with the record's branch) finds no branch to check and answers the same 404 as an unknown id, for a superadmin too; the services behind them also refuse a record with no branch (`PLACE_FIRST`, "Place this record in a branch first.") as a second line. The dedicated unplaced routes (below) are the only way to touch one. (An earlier draft of this doc said 409; 404 is what the shared guard gives and it shows nothing, so it is kept.)
- **Routes:** `GET, POST /api/v1/staff/unplaced` (superadmin; 403 for anyone else), `PATCH, DELETE /api/v1/staff/unplaced/[id]` and `POST /api/v1/staff/unplaced/[id]/place` (superadmin; 404 for anyone else and for a record that is already placed). Every write is audited (`STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_PLACED`, `STAFF_DELETED`).
- Bulk staff import and the export keep requiring a branch (an unplaced record is made one at a time, or placed). Transfer does not apply to an unplaced record.

### C. Draft invitations (task 0101 D2)
- Migration `20261120100000_invitation_drafts`: `Invitation.sentAt` (nullable, set when the e-mail is sent), `Invitation.tokenHash` and `expiresAt` nullable. The unique index on the token already ignores nulls (PostgreSQL). One open invitation per (address, branch): a DRAFT counts as the open one too (so a second draft for the same address and branch replaces the first, audited), and sending a draft revokes any other open invitation for it, as sending a new one does today.
- Saving or editing a draft is limited (60 per administrator per 5 minutes, `invite:draft:`, apart from the sending limit of 30), because it writes rows without sending anything. A draft has no token, no expiry and no e-mail until it is sent. **No token or hash ever appears for a draft**: not in the answer (an invitation view never carries one), not in an audit row, not in a log. "Save as draft" next to Send in Invite someone; "Save as drafts, send later" in Invite many and in the staff invite dialog; staff-record invitations can be drafts too. The Pending invitations tab lists drafts with a Draft badge, **Send**, **Edit** (e-mail, role, branches) and **Delete**, and a **Send all drafts** button, batched like the other bulk invitations, with the existing rate limits.
- A draft is never "accepted", never "expired", and an accept link can never match one (no token). The invitation history (task 0117) shows it as Draft. Audit: `INVITATION_DRAFT_SAVED`, `INVITATION_DRAFT_SENT`, `INVITATION_DRAFT_DELETED`.
- Every reader of `tokenHash` or `expiresAt` handles null on purpose.

### D. Departments in bulk staff, and "Add to department"
- The bulk staff file gets an optional **Department** column matched by name (any capitals) to the branch's live departments; an unknown name is a problem on that row. It only counts when the branch uses departments (otherwise the column is ignored and the review says so). The importer adds the membership (never the head). The export has a Department column (names joined with a semicolon).
- The staff selection bar gets **Add to department** (shown only when the branch uses departments and the person may manage at least one: an administrator of the branch, or a head for their own department). A small dialog picks the department and adds every selected record through the existing members route.

### E. The remembered branch in the last pickers
- `useBranchSelection` is adopted in Results, Settings (the branch profile chooser and every other branch select there), Forms, the Question bank and any other picker found by grep that still starts on the first branch. Deep-link props keep winning over the memory.

### F. Head of department review of results
- See section 6.

## 3. Migrations (the maintainer's to run on production after the prod merge, in this order, after the earlier ones)

1. `20261120090000_staff_no_branch`: `StaffRecord.branchId` drops NOT NULL and a partial unique index keeps live unplaced e-mail addresses unique among themselves. Additive.
2. `20261120100000_invitation_drafts`: `Invitation.sentAt` (new, nullable; existing rows are set to when they were created), `tokenHash` and `expiresAt` allow null, and a CHECK says a draft has none of the three and a sent invitation has all three. Additive.
3. `20261120110000_department_head_review`: the new table `ResultDepartmentReview`. Additive.

None drops data. (Result templates, on another branch, has its own migration `20261119210000`, which sorts before these: they are independent.)

## 4. Work

- [x] A: `ensureStaffRecord` links only live records and answers `"draft"` when a draft holds the address; `from-member` says so (409); the accept rule leaves a record that became a draft alone; `LIVE_STAFF` in `lib/drafts/live.ts` is the one predicate.
- [x] B: migration `20261120090000_staff_no_branch`; `StaffRecord.branchId` nullable; `listUnplaced`, `createUnplacedStaff`, `placeStaff`, `isUnplaced` in `lib/academics/staff.ts`; the four unplaced routes; the compiler's 28 findings fixed one by one (transfer, programs, search, standing, the staff view); `UNPLACED` in the branch picker, `StaffPlaceDialog`, delete through the unplaced route.
- [x] C: migration `20261120100000_invitation_drafts`; `saveDraftIn`, `saveDrafts`, `sendDraftInvitation`, `updateDraftInvitation`, `listDraftIds` in `lib/invitations/service.ts`; `POST /invitations` with `draft`, `POST /invitations/[id]/send`, `PATCH /invitations/[id]`, `POST /invitations/drafts/send`; `asDraft` on the bulk invitation import; `draft` on the staff invite; the Invite someone, Invite many and staff invite dialogs; the Pending invitations list (Draft badge, Send, Edit, Delete, Send all drafts); the history reads a deleted draft.
- [x] D: the Department column (last, optional) in the bulk staff entity with the branch's departments as a dropdown, the server check and note, the membership on save (never the head, not for drafts), the export column, "Add to department" in the selection bar.
- [x] E: `useBranchSelection` in Settings (sign-in access, branch details, results approval), the scheme levels, promotion, Approvals (layout, self-approval), Forms, the Question bank print log and Results.
- [x] F: migration `20261120110000_department_head_review`; `ResultDepartmentReview`; `lib/academics/head-review-setting.ts`, `department-review.ts`; the hook in `transitionResults` (approve asks, return clears); `GET, POST /api/v1/academics/results/department-review`; `GET, PUT /api/v1/settings/results-head-review`; the switch on the Departments tab; the Department review tab on Results.
- [x] Extra (the maintainer, 2026-11-20): a record that is already a draft is edited with **Save draft** and **Complete**, not Save and Save as draft (staff and pupil forms; a record with no branch has no Complete yet).

## 5. Tests (written, not run except the unit ones)

Unit (`tests/unit/sweep2.spec.ts`, 9 passed alone; the whole unit project: see section 7): the picker's reserved value, a draft invitation's status and body and how history reads a deleted one, the Department column and its export. Existing specs brought in line with the new column: `bulk-export`, `bulk-validate`, `staff-details`, `sweep-batch1`.
API: `tests/api/sweep2-staff.spec.ts` (A and B), `tests/api/draft-invitations.spec.ts` (C), `tests/api/staff-department-bulk.spec.ts` (D), `tests/api/department-head-review.spec.ts` (F). Every new route has its refusals asserted (another branch, a teacher, a parent where it applies, superadmin-only where stated) and its audit rows.
Browser: `tests/e2e/sweep2.spec.ts` (unplaced add, place; draft invitation save, send, send all; Add to department; the remembered branch; Save draft and Complete for a staff record and for a pupil).

## 6. Item F: head of department review (design as built)

I read `results-workflow.ts`, the `Result` model and the migrations that guard it. The status machine (DRAFT, SUBMITTED, APPROVED, PUBLISHED, LOCKED) is enforced by CHECKs and triggers in the database, and an approver may already approve, publish and lock inside their scope. A new STATUS would mean changing those rules, so **none was added**. That choice also answers the maintainer's condition: nothing changes who can publish.

- **A review, not a status.** `ResultDepartmentReview` (one per result, composite key to the result and to its department; plain `reviewedByUserId`). With the branch switch ON, `approve` refuses (409) any SUBMITTED result whose subject is in a department and has no review. Publishing, locking, reverting, unlocking and who may do them are untouched.
- **Switch:** `results.departmentHeadReview`, per branch, OFF by default, audited in `SettingAudit`; anything but exactly `true` is off, so a damaged value can only switch the extra step OFF. **Off = unchanged:** `awaitingReview` answers 0 and `approve` does what it did; the only code that runs either way is `clearReviews` on `return`, which deletes nothing when no review exists.
- **Who reviews:** the head of the subject's department (a live, active-standing record linked to their account), or an administrator of the branch or a superadmin. **Nobody reviews marks they entered or submitted:** a head never; an administrator follows the self-approval rule. A head can pass or return their own department's SUBMITTED results and nothing else: the status routes still refuse them (they are not an approver). If a head also happens to be an approver by the existing scope rules, they keep exactly those powers on other people's marks and no more.
- **Return by a head** sends SUBMITTED results to DRAFT with a reason of 5+ characters (the same fields and audit as `return`, text says "returned by the head of department") and deletes the review: the marks can change again. A plain `return` (administrator or approver) deletes it too.
- **Audit:** `DEPARTMENT_REVIEWED` (SUBMITTED to SUBMITTED) and `RETURN` in `ResultAudit`, in the same transaction as the change, with the rows locked first.
- **Decisions:** the department is the subject's today; a subject moved to another department after a review keeps the review it has (the review row names the department it was made for). A department with no head can only be reviewed by an administrator. A subject in no department needs no review. Drafts: not applicable (results are not staff).

## 7. Not verified

- **No API or browser spec has been run** (the brief: do not touch the shared test DB). Everything in sections 5 and 6 was checked by reading the code against the test, not by running it. The most likely place for a first-run failure is a locator or an exact message in `tests/e2e/sweep2.spec.ts` and the status codes in `department-head-review.spec.ts` (a 403 versus a 404 where the role gate and the branch lookup meet).
- **No `next build`**, no browser look at any new screen (the picker with "Not placed in a branch", the Pending invitations drafts, the Department review tab, the Save draft and Complete forms), and no phone layout check. `useBranchSelection` reads the address in ten more pages: each page must render without a Suspense boundary (the earlier adopters did).
- **Migrations:** each was applied to a throwaway database with all earlier ones and compared with the schema (no difference), and the constraints were tried on sample rows (unplaced address unique among unplaced and clear of a branch's own; a draft invitation's CHECK and the one-open-per-address index). The `sentAt` backfill of existing invitations is one `UPDATE` that the throwaway database could not exercise (it had no old rows).
- The whole unit project ran on a server-less configuration against an unreachable database: the failures that remain are the five that need a database (three rate-limit store tests, `communication-gateways:183`, `communication-templates:23`), the same five as on the other branches.
- Not done, listed as follow-ups: the bulk **invitation** and **pupil** files have no Department column (staff only); a head cannot reach "Add to department" from the selection bar (they add from their department's own dialog, as built in D7); an unplaced record cannot be imported or exported in bulk; no "Complete" for an unplaced draft until it is placed; the Review tab does not show which groups are waiting for a department review (the 409 says so); the Department review tab has no e2e (covered over HTTP); remembered branch is per browser, not per user.

## 8. Build record

Built on `claude/combined-batch` (bb8bd11) after merging `claude/staff-ux` (3af6c63). Gates run on this worktree: `prisma generate`, `next typegen`, `tsc --noEmit` (0 errors), ESLint (0 errors; one warning on a line neither branch touched, `staff-transfer.ts`), Prettier `--check` on the changed files, `prisma validate`, and the migration-versus-schema comparison. Numbers (unit, counts) are in the final report and were read from the run logs, not from memory.
