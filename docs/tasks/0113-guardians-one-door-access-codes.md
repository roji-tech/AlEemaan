# 0113: Guardians as their own records, the family sign-in's one door, and access codes

- **Period / Focus:** 2026-11-19 (maintainer requests, batch 2 of the backlog sweep)
- **Status:** Built and checked as far as the notes in section 6 say; the API and browser specs (guardians and scholarships) are written and wait to be run
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/one-door-access-codes` / PR into `dev`
- **Started:** 2026-11-19

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What the maintainer asked (2026-11-19)

- Task 0094 phase 2 (D7, D9): sign-in through one door, and access codes with printable slips.
- "what if one parent is connected to multiple children, will it be ok to generate multiple codes for login? won't that be stressful?"
- "why don't we separate the guardian info and just use foreign key to connect it, what do you think about that?" Then: "don't worry about data movement, we don't have any guardian info yet".
- "add Guardian to /users, and I wanna see all the children under a guardian when I click on it, and I want the superadmin/admin to be able to block access to some students under a guardian".
- "we have day students and burden students, we need to be able to classify" (burden: boarding): section R1 below.
- "we also have students with scholarships", then "remember that scholarship can be of different types" and "this might also affect finance, some students might be marked paid through scholarship": section S1 below (built after the rest: section S1, its own migration).

## 2. What exists (read from the code, 2026-11-19)

- A pupil's guardian is three text columns on the pupil (`guardianName`, `guardianPhone`, `guardianEmail`). Brothers and sisters are tied together only by the same phone or e-mail typed on each record (`findSiblingStudentIds`, issue ISS-0022). A typo splits a family; a shared number joins strangers. A child has at most one guardian.
- About 25 places read those columns: broadcasts (`lib/communication/service.ts`), programs, exports, finance, the lookup tool, the bulk import and the portal.
- Family sign-in: admission number + the date of birth or the guardian's phone or e-mail (the last-four-digits match is already removed in this branch, task 0094 D3).

## 3. Decisions

These were made by the secure-and-best rule (the maintainer: build the best and secure option; do not park it).

- **D1. A guardian is a record of its own.**
  - `Guardian`: name, phone (as typed, cleaned) with a `phoneKey` (the national digits, so `0803…` and `+234803…` are one number), e-mail (lower case), the guardian access code's hash and date, a session version, and an archive date.
  - `StudentGuardian` links a child to a guardian: the relationship (mother, father, guardian, other), whether this is the main contact, and whether this guardian is blocked from this child (when, by whom, why).
  - One guardian across every branch; a child may have several guardians and a guardian several children.
  - Phone and e-mail are NOT unique: two guardians may share a phone.
  - The link carries the child's branch, kept equal to it by a foreign key on (branch, pupil) that follows a change of branch.
- **D2. No data movement logic** (the maintainer: there is no guardian data yet). As cheap insurance, the migration turns any pupil's non-empty guardian columns into one guardian and one main link, with no merging.
- **D3. The old columns stay this batch as a read-only mirror.**
  - One writer, `syncGuardianMirror`, copies the pupil's first allowed guardian (main contact first) into the three columns, and empties them when every guardian is blocked.
  - Every guardian or link change calls it; a guardian's edit calls it for each of their children.
  - So the 25 readers keep working unchanged, and **a block also stops broadcasts to that guardian about that child**.
  - Moving the readers to the links and dropping the columns is a later batch (named in section 4).
- **D4. Who may do what.**
  - See a guardian: a superadmin, or an administrator of a branch where they have a child. A branch administrator sees only the children in their own branches, plus "N more in other branches" with no names.
  - Edit a guardian's details, or make their access code: a superadmin, or an administrator of EVERY branch their children are in.
    - The code opens all their children, so an administrator of one branch cannot hand out a code that opens a child in a branch they do not run.
    - A family across branches is the superadmin's to do.
  - Link or unlink a guardian, change the relationship or main contact, block or unblock: a superadmin, or an administrator of that child's branch.
  - Out of scope is the same 404 as unknown. Every change is audited.
- **D5. Blocking is per child.**
  - A blocked guardian cannot sign in with that child's admission number (the same generic failure as a wrong secret).
  - The child is not in their sign-in, and messages about that child do not go to them (the mirror, D3).
  - A reason is required.
  - Blocking, unblocking and a new code raise the guardian's session version, so open sessions end at their next request.
- **D6. The one door (task 0094 D2, D7, D9).**
  - `student.`: admission number + the pupil's code, or the date of birth while the branch allows it. That signs in that pupil, plus, when the branch lets pupils see brothers and sisters, the pupils who share an allowed guardian with them.
  - `parent.`: admission number + the code of an allowed guardian of that child, or that guardian's whole phone number or e-mail while the branch allows it. That signs in that guardian. Their children are their allowed links, in branches whose sign-in is open, re-read on every request, so a link made or blocked later shows at once.
  - A portals-off deployment (one address) tries the pupil first, then a guardian.
  - The session records the guardian's id and version. A guardian session from before this change (no guardian id) is ended.
- **D7. Access codes.**
  - The pupil code stays on the pupil.
  - The guardian code lives on the guardian (one code per parent, whatever the number of children: the maintainer's "won't that be stressful?").
  - Stored as a slow, peppered hash salted with the owner and its kind.
  - Shown once, in a printable slip. A new code stops the old one and ends open sessions.
- **D8. Class slips** ("Print access slips" on the Students screen, at most 100 pupils):
  - a new pupil code for each pupil;
  - for each pupil's main allowed guardian, one code across the sheet. Brothers and sisters on one sheet share it.
  - A guardian who already holds a code keeps it, and the slip says so.
  - A guardian whose code this administrator may not make (D4) gets "the school office will give the guardian code".
- **D9. The pupil's guardians on the Students screen.**
  - The create and edit form keep the main guardian's name, phone and e-mail. Saving finds the guardian in the administrator's reach by whole phone and the same name, or makes one, and links them as the main contact. On edit, a main guardian the administrator may edit (D4) is changed in place, for all their children.
  - A "Guardians" entry in the pupil's Actions list manages every guardian of the child:
    - find one by whole phone or e-mail, or add a new one;
    - relationship and main contact;
    - unlink, block or unblock.
  - The bulk import finds-or-makes the same way.
  - The old API fields keep working, so existing callers do not change.
- **D10. Users > Guardians.**
  - The list can be searched by name, phone or e-mail. Each card shows the phone, e-mail, number of children, code status and a "Blocked from N" chip.
  - Opening a guardian shows their details (Edit when D4 allows), their children (admission number, class, branch, relationship, main contact, Allowed/Blocked with Block or Unblock) and their access code (Make code / New code).

### R1. Day or boarding

- `StudentRecord.residence` (`DAY`, `BOARDING`), nullable and with no default: "not set" is its own answer, so no pupil is labelled wrongly. Index on (branch, residence).
- The pupil form has "Day or boarding" (Not set, Day, Boarding); the card shows a Day or Boarding chip; the list's Filters have "Day or boarding" (Any, Day, Boarding, Not set), read by the list AND its export from the same address (`residence=DAY|BOARDING|NONE`, in `list-filters.ts` and `studentListWhere`).
- The import has an optional "Day or boarding" column with a dropdown in the Excel template: Day or Boarding in any case (and "boarder", "day student", "day pupil" and similar), blank is not set, anything else is a problem on that row. The export writes the same column.
- A change is audited as part of `STUDENT_UPDATED` (the new value).

### S1. Scholarships

The maintainer, 2026-11-19: "we also have students with scholarships", "scholarship can be of different types", "some students might be marked paid through scholarship". A SEPARATE migration (`20261119190000_scholarships`), so it can be merged or held on its own.

- **Types, per branch** (`ScholarshipType`): a name (used once among the branch's live types, whatever the capitals: a partial unique index) and a default share of 1 to 100 (100 = full), a description, archived not deleted. Managed by an administrator of the branch (or a superadmin) on Finance > Scholarships; audited. A type's share is the DEFAULT for new scholarships: those already granted keep theirs.
- **A pupil's scholarships** (`StudentScholarship`): a type, the pupil's own share (copied from the type, changeable), first and last day (both optional; the first and last day count), a note, and ended (never deleted). A pupil may hold several; their shares together may not pass 100 on ANY day: the check takes the pupil's row lock and sums the overlapping scholarships at every day one starts (two halves that never overlap are fine). 409 `OVER_100` otherwise. Granted, changed and ended are audited (`STUDENT_SCHOLARSHIP_GRANTED`, `_CHANGED` with before and after, `_ENDED`): the ids, shares and days, never the note's words.
- **Who:** an administrator of the pupil's branch or a superadmin sees, grants, changes and ends them. A teacher is refused on every route, gets no scholarship field on the pupil list or detail, and cannot filter by scholarship (403: the filter would tell who holds one). The family portal receives only the yes or no that an invoice was "Paid by scholarship" (no type name, share, note or link; its discount line reads "Discount").
- **Finance:**
  1. A new invoice takes a live scholarship's share off. "Live" is the school's day on the invoice's issue day (today): not ended, started (or no start), not past its last day. One discount per scholarship (mode SCHOLARSHIP, reason "Type (50%)", amount the percent of the fees rounded half up to the kobo, never more than what is left, applied by the person who generated). It goes through the same function as a manual discount (`addDiscountTx`), so the net total and the status are worked out one way.
  2. Granting or changing a scholarship does NOT touch invoices already issued. The pupil's dialog offers "Apply to this pupil's open invoices (N)": it adds the share to each Unpaid or Part paid invoice with something still owed (capped at the balance; the invoice is locked as for a payment), once per scholarship per invoice: `InvoiceDiscount.studentScholarshipId` with a unique index on (invoice, scholarship), so a second press, or generation after it, can never double it. A raised share does not top up an invoice that already has the scholarship. Ending a scholarship does not change invoices already issued.
  3. **What the existing rule did, and what changed:** a discount that reached the whole fee left the invoice UNPAID at nothing owed (`resolveInvoiceStatus` is paid <= 0 first). For scholarships that is wrong, so an invoice whose whole fee scholarships took off (nothing left to pay, a scholarship among the discounts) is PAID (`statusAfterDiscounts`). A manual discount that reaches the total keeps the old status. "Paid by scholarship" is shown when the invoice is PAID, nothing was paid in money and scholarships took the fees off (`paidByScholarship`): on the invoice list, the invoice detail and the family's Finance tab. An invoice partly paid in money, with the scholarship covering the rest, is simply PAID, and its discount rows say what the scholarship did.
  4. **Collections are payments only** and always were: the Overview's "Collected" is the sum of `amountPaid`, which discounts never touch. Scholarships are now their own figure (`scholarshipsKobo`, "N in scholarships (not counted as collected)"), no longer inside "discounts". The manual form's "Scholarship" mode is counted the same way.
- **Pupils:** a "Scholarships" entry in the pupil's Actions list (administrators of the branch only); a chip on the card ("Scholarship: Merit 50%", "Full scholarship: Merit") shown to them only; a "Scholarship" filter (Any, Has a scholarship, None, or one type) read by the list and its export alike. The export writes the live types' names and their shares added up; the import has "Scholarship" (a type of the branch, by name; unknown or archived is a problem on the row) and "Scholarship %" (1 to 100; empty takes the type's share; a share without a type is a problem). A cell holding several names is an export only: it cannot be imported back.
- **Not covered:** program invoices (their own fees tables; they do not use `generateInvoices`).

## 4. Not in this task

- Moving the 25 readers of the guardian columns to the links, and dropping the columns (a later batch: "guardian readers move to the links").
- Merging two guardian records that turn out to be the same person (a superadmin tool, later).
- A guardian's own e-mail account (the portal's code sign-in covers families).

## 5. Tests (written with the code)

- **Unit:** the code alphabet and hashing by owner kind; `phoneKey`; the mirror choice; the scope rules (`mayEditGuardian`, `mayManageLink`); the door.
- **API (`tests/api/guardians.spec.ts`):**
  - who sees which guardians and children;
  - the edit rule across branches;
  - block and unblock: the version is raised, the mirror is emptied and refilled, and a blocked guardian cannot sign in;
  - guardian codes and class slips;
  - the old student fields still make a guardian.
- **The existing portal specs:** signed in through guardian links (a support helper turns a pupil's guardian columns into a guardian and a link).
- **Browser (`tests/e2e/guardians.spec.ts`):** Users > Guardians, open a guardian, see the children, block one with a reason, unblock; desktop and phone; axe.

## 6. Build record

Written from what was run, on 2026-11-19, in the `AlEemaan-door` worktree.

**Checked:**

- `tsc --noEmit`, `eslint` on every changed file and `prettier --check` on every changed file: clean.
- `prisma validate`, and `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --exit-code` (the CI check) on a throwaway database: no difference. The whole migration chain applied with `prisma migrate deploy` to a second throwaway database.
- The migration's backfill, run on four sample pupils in that database: a pupil with a name and phone got one guardian and one main link (the phone key `8030001111` from `+234 803 000 1111`); another with only a phone got "Guardian of Bilal Yusuf"; a pupil with a too-short phone got a guardian and no phone key; a pupil with nothing typed got nothing. Two pupils on one phone were NOT merged (by design: no merging).
- The unit project, with a server-less config, on a throwaway database: all pass after one fix (`GET /api/v1/settings/family-secrets` is listed in `NOT_WRAPPED` in `route-role-guard.spec.ts`: it lists the caller's own branches and names no single one). New unit specs: `guardians-rules.spec.ts`, `portal-door.spec.ts`, `residence.spec.ts`; changed: `portal-auth.spec.ts` (the last-digits match is gone), `bulk-pupils.spec.ts`, `sweep-batch1.spec.ts` (the export has one more column).

**Written, NOT run** (they need the shared test database and the web servers):

- `tests/api/guardians.spec.ts`: who may use the screens; the old student fields make a guardian; the list's scope; edit and code rules across branches; block and unblock; the family sign-in through the links (code, block, mother and father, the fallback switch, the pupil code, an archived guardian); class slips; no code hash in any answer; residence; the family-secrets switch.
- `tests/e2e/guardians.spec.ts` (desktop and phone, axe): Users > Guardians, a guardian's children and blocking; a guardian's code; a pupil's Guardians; a pupil's Access codes and a class's slips; day or boarding.
- Existing specs changed: `tests/api/portal.spec.ts` (the token sign-in is a 400), `tests/e2e/portals.spec.ts` (student. and parent. show the families' form first), the failure sentence in two walkthrough chapters. `tests/support/guardians.ts` turns pupils seeded with guardian columns into guardians and links just before any family sign-in (hooked into `api()` and the e2e context), so the ~28 older specs that sign in with a seeded phone or e-mail need no change.

**Decisions beyond the plan:**

- The login card on a deployment with the portals off keeps its old heading, field name and button (twelve specs and two walkthrough chapters name them); the student. and parent. pages get the new wording and carry the closed-portal line (task 0091) and the portal marker.
- The sign-in page for a family that is already signed in checks the session as every request does (not only its signature), so a replaced code or a block cannot send /portal and /login round in a loop.
- A pupil's access-code hash is stripped from every answer: the student routes, the portal's records, the overview and the invoice detail.
- Blocking also empties the pupil's contact columns when no other guardian is allowed, so broadcasts stop for that child.

**Not verified:** every API and browser behaviour above (nothing was run against the test database or in a browser); the class-sheet limit of 100 pupils (not exercised); printing (the print stylesheet is by reading only); the phone layout of the new dialogs.

### Scholarships record (S1), 2026-11-19

**Checked:** `tsc --noEmit`, `eslint`, `prettier --check` on every changed file; `prisma validate`; `prisma migrate diff --from-migrations ... --exit-code` = 0 (with the guardians migration applied first) on a throwaway database; the migration chain applied to a second throwaway database and the CHECKs and the live-name unique index exercised in SQL (a second live name in any capitals, a share of 0 and a share of 101 are refused; an archived name is free again). The unit project: `scholarships-rules.spec.ts` (new), with `bulk-pupils`, `sweep-batch1`, `residence` (the two new columns), `finance-stats` (the new figure), `search` and `route-role-guard`. The throwaway databases were dropped afterwards.

**Written, NOT run:** `tests/api/scholarships.spec.ts` (types and who; grant, change and end with audit; over 100% refused, with days that never overlap; archived and foreign types; the pupil list, filter, export and detail for an administrator and a teacher; the import columns; generation applying once and not for ended, future or past scholarships; a full scholarship settling the invoice with the label; a manual discount unchanged; Apply to open invoices once per scholarship, capped at the balance, not on paid invoices; ending changes nothing issued; collections, the scholarships figure and the family portal's view) and `tests/e2e/scholarships.spec.ts` (Finance > Scholarships; a full scholarship, Apply, "Paid by scholarship" in the list and the invoice; the card chip; the filter).

**Decisions beyond the plan:** the portal shows the yes or no "Paid by scholarship" (the maintainer asked for the label on the family's Finance tab) but nothing that names the scholarship; scholarships granted through the manual discount form (mode SCHOLARSHIP) are counted as scholarships in the figure and the label; the pupil export and import columns are two (name, share) rather than one.
