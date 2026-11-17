# 0084: One bulk-entry engine (file or grid, checked in the browser and again on the server), used for staff, invitations and pupils

- **Period / Focus:** 2026-11-17 (the maintainer: bulk add for staff first, then bulk inviting, then the pupil import brought up to the same standard; "make it a template for general use")
- **Status:** Done, all four slices (the record is section 8, with a correction to its first version)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** slice 1 `claude/bulk-staff` (PR #235, merged); slices 2 to 4 `claude/bulk-invitations` (one PR, one commit per slice) / PRs into `dev`
- **Started:** 2026-11-17

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

An administrator can add many people at once, three ways, and the three share one engine so a new kind of import is a definition, not a new screen:

1. **Single**: the form that exists today (unchanged).
2. **File**: a CSV or Excel (.xlsx) file, read in the browser, checked, **shown row by row**, dry-run on the server, then saved.
3. **Grid**: a spreadsheet-like editor of at most **50 rows**: add, delete, edit cells, paste from Excel, download what is on screen.

Kinds in this task: **staff** (first), **invitations**, **pupils** (the existing import moved onto the engine), **fees**. Nothing is saved that either side has not checked.

## 2. What is there today (read from the code, 2026-11-17)

- **Pupil import** (`students/import`): the browser parses CSV (`lib/students/csv.ts`); the API takes up to 1,000 rows and saves **every good row and skips the bad ones in one transaction** (partial success); there is no dry run; a duplicate (same name and birth date in the branch) is skipped unless `allowDuplicates`.
- **Gaps in it** (each is a gap this task closes): the browser requires first and last names of at least 2 letters, the server only 1; the server checks the date of birth with a pattern (`YYYY-MM-DD`), not as a calendar date, and not against the future; `guardianEmail` and `guardianPhone` are not checked by the server at all (the browser checks the email only); no maximum lengths on any text; an unknown class or arm still creates the enrolment, with the class as text and no link to a real class; with no active session the enrolment is skipped **without a word**; rows that the browser finds wrong are left out of what it sends, so the screen can say "imported 40 of 40" about a file of 50.
- **Staff** (`POST /staff`): one record per call, strict schema (`staffInput`: name 1 to 80, phone `7 to 20 digits`, email pattern, category), a unique email per record (the database answers a clash). A record is never a sign-in.
- **Invitations** (`POST /invitations`): one per call; it **revokes any earlier open invitation of the same address in the same branch** and issues a new link; refused for an existing or deactivated member, a branch the caller does not administer, an `ADMIN` role unless a superadmin; limits of 30 per administrator and 3 per address per 5 minutes; the e-mail is sent after the response and a failure is only logged.

## 3. Decisions

- **D1. One definition per kind** (`BulkEntity`): columns (key, label, accepted spellings, required, help), a **row schema** (zod), unique keys inside the file, a **database check** (the rules only the database can answer: already a member, name taken, class not found) and a **save** step. The browser and the server run the **same row schema** from the same file in `lib/bulk/`, which holds no database client, so the two cannot drift apart. The server never trusts what the browser says it checked.
- **D2. Layers, in order, none optional.** (a) File: type, size, empty, header has the required columns, row count. (b) Row, in the browser, with the shared schema: every column, with the sentence beside its cell. (c) Within the file: repeated keys (two rows with one e-mail). (d) **Server, dry run**: the shared schema again, then the database check, for every row; nothing is written. (e) **Server, real run**: all of it again inside the transaction (the data may have changed since the dry run), then the save. A row that passes (b) and fails (d) is shown the same way as one that fails (b).
- **D3. A save is all-or-nothing per request.** One request saves every row it contains or none. After a dry run with problems, the screen offers **"Save the N good rows now"** (a second request, all-or-nothing over those N, which the dry run checked) **or** fix the problems first. Choosing to save the good rows is the administrator's decision, stated on the button and in the result; nothing is half-saved by accident. (The old behaviour, a silent skip, is gone.)
- **D4. Edit only the problem rows.** After a dry run, **"Edit the M problem rows"** opens the grid with those rows, when M is 50 or fewer; **"Edit all the rows"** needs the whole file to be 50 or fewer. Otherwise the button is disabled and says why ("Fix the 120 problem rows in the file: download them below"). **"Download the problem rows"** gives a CSV (or .xlsx) of just those rows, with their original row numbers and a "problem" column that the importer ignores, ready to fix in a spreadsheet. **While the review is still open, "Upload the corrections" takes that file back:** each row of it replaces the problem row with the same original row number (a `row` column, which the importer recognises and an ordinary file does not need), and the whole file is checked again, in the browser and on the server, before anything is shown as fixed. A row of the corrections file with no row number, or a number that was not a problem row, is refused with its own sentence (it is never added silently, and it never overwrites a row that was fine). The good rows stay in the review until they are saved.
- **D5. File limits.** CSV or .xlsx only (legacy .xls is not read: save as .xlsx or CSV, said on the screen); first sheet only; at most **1,000 rows** and a byte cap (1 MiB for CSV, 2 MiB for .xlsx); the grid holds **50**. Row numbers in every message are the **spreadsheet's own** (the header is row 1), so a person can find them.
- **D6. The grid is real inputs in a table**, not a canvas library: labelled inputs, a dropdown where the values are fixed (category, gender, role, class), paste of a copied block (tab and line breaks fill cells, rows are added up to 50), add and delete row, a visible "23 of 50", the problem under its cell (`aria-describedby`), keyboard: Tab and Shift+Tab move between cells, Enter moves down. This keeps WCAG 2.2 AA (the repo's axe checks) and phone keyboards working.
- **D7. Responsive.** Desktop: the table. Tablet: the table, scrolling sideways inside its own region with the first column fixed (and that region keyboard-focusable). Phone: **each row is a card** of labelled fields with the row number, Delete and its problems; "Add row" below. The preview of a file is the same: a table, cards on a phone. A long file (up to 1,000 rows) is shown in pages of 50 so a phone does not draw 1,000 cards.
- **D8. Leaving.** While the grid holds edits that are not saved, closing the dialog, Cancel, or a link inside the app opens our own dialog: **Download first / Leave / Stay**. A closed tab or a refresh gets the browser's own generic prompt (a page cannot put a button in it). Nothing is stored in the browser (a draft would hold names and phones on a possibly shared computer).
- **D9. Download is safe.** Cells that start with `=`, `+`, `-` or `@` are written with a leading apostrophe so that Excel does not run them as a formula. CSV is UTF-8 with a byte-order mark so Excel reads accents; .xlsx is written with a small maintained writer.
- **D10. Excel library.** A small maintained reader and writer for .xlsx, loaded only when a file or a download needs it (a dynamic import), picked after checking its advisories and size at install time and recorded in section 8. Parsing is in the browser, as the CSV is today.
- **D11. Who.** Staff and pupils: an administrator of that branch (the existing `withBranch` rule: a branch not theirs is 403). Invitations: administrators as today, with the same scope rules per row (an `ADMIN` role is refused unless a superadmin). One branch per file for staff, pupils and invitations (chosen on the screen, as the pupil import does), so a file never decides authority by itself.
- **D12. Invitations are special in three ways**, and the engine has a hook for each: (1) the dry run says per row **"Will replace the open invitation."** (the real run revokes it and audits that), so a re-import does not silently re-issue everyone's link (`notes`, a verdict with status `note`, which still saves); (2) e-mails are sent **after the commit** (`save` returns the work to do afterwards), so a send that fails can never undo an invitation. As with one invitation, a failed send is logged by the transport and the administrator resends from the open invitations list; the result does not list a per-row mail outcome, because the send happens after the response (an earlier draft of this file promised that; it was not built); (3) a bulk has **its own limits**, counted apart from the 30 single invitations per 5 minutes: at most **200 rows** a request (`maxRows`), 30 dry runs and **2 saves** per administrator per 5 minutes (the rate limiter's window is fixed at five minutes), and the e-mail send still obeys the per-address mail limit of 5 per 5 minutes.
- **D13. Audit.** One audit entry per row saved, as the single routes write them, plus one entry for the bulk itself (kind, branch, row count, who). Nothing in an audit entry holds a token.
- **D13a. Fees** (`FeeStructure`: branch, period, optional class group, name, amount `Decimal(12,2)`). One row is one fee line of one class for one period. Money gets the strictest column rules: an amount is accepted as `150000`, `150,000` or `150000.50` (a leading naira sign is accepted and dropped), must be above zero, at most two decimals, below a stated ceiling, and is stored from the text, never from a floating point number; the **period and the class group are chosen by name** and looked up on the server (not found is a problem on that row; an empty class group means the whole branch, as the single form does); the database has no unique index on (period, class group, name), so the engine's unique key and its database check refuse a **repeated line** both inside the file and against what is already saved. The review shows **the total per class group** before saving, so a misplaced decimal point is seen. Saving a fee line does not change an invoice already issued (an invoice keeps its own line-item snapshot); that is said on the screen.
- **D14. Errors say what and where, never why the system failed.** An unexpected failure answers "Nothing was saved" and is logged; the exception's text is never sent (ISS-0006).

## 4. Interface (the template)

```ts
type BulkColumn = { key: string; label: string; aliases: string[]; required: boolean; help: string; options?: { value: string; label: string }[] };
type BulkEntity<Row, Ctx> = {
  id: "staff" | "invitations" | "pupils" | "fees";
  columns: BulkColumn[];
  rowSchema: z.ZodType<Row>;               // shared by browser and server (lib/bulk, no database client)
  uniqueKeys: (keyof Row)[];               // repeated inside one file
  check: (rows: Row[], ctx: Ctx) => Promise<RowNote[]>;   // server only: what only the database knows
  save: (tx, rows: Row[], ctx: Ctx) => Promise<void>;     // server only, inside one transaction
};
type RowVerdict = { line: number; status: "ready" | "error" | "note"; problems: { column?: string; message: string }[]; note?: string };
```

Routes: `POST /api/v1/{staff|invitations|students|finance/fee-structures}/import { branchId, dryRun, rows }` answer `{ verdicts }` for a dry run and `{ saved, verdicts }` for a real one. The browser side is one `BulkImportDialog` taking the entity's columns.

## 5. Not in this task

Legacy `.xls`; more than one sheet; importing guardians on their own (a guardian is three text fields on the pupil, not a record); copying one period's fees into the next (a different and probably better feature for the same job, noted for later); the people of a program; marks; Octalve Edu (the maintainer's order: AlEemaan first, the same engine ported afterwards); background jobs and polling (1,000 rows is one request).

## 6. Slices (tests written before the code; slice 1 had its own PR, slices 2 to 4 shared one, a deviation made to save waiting for three deployments)

1. **Engine + staff**: `lib/bulk/` (parse, table mapping, shared validate, export), the staff entity and `POST /staff/import`, the `BulkImportDialog` (file, preview, errors, grid, download, leave guard), on the Staff screen.
2. **Invitations**: the invitation entity, its hooks (D12) and the dialog on the Users screen.
3. **Pupils**: the pupil import moved onto the engine; `students/import` becomes all-or-nothing with a dry run; the gaps in section 2 closed; `students.spec.ts` updated on purpose.
4. **Fees**: the fee entity (D13a) and its dialog on the Finance screen; small once the engine exists.

## 7. How it is tested

Failing first, every slice. **Unit:** the parser (quotes, line breaks, BOM, aliases, row cap, the spreadsheet row numbers), the shared schema per kind (every column has a passing and a failing example, so a column cannot be added without its rule), the formula neutralising, the unique-key check, the 50-row rule, the corrections upload (a corrected row replaces its problem row; an unknown or missing row number is refused; a good row is never overwritten), fee amounts (`150,000`, `₦1,500.50`, `0`, `-5`, `10.999`, text). **API:** dry run writes nothing; real run saves all or none (one bad row among many saves nothing); a clash created between dry run and real run is caught; scope (a branch not yours is 403; a branch administrator cannot invite an `ADMIN`); the rate limits; invitations replaced; audit rows. **Browser, on desktop, tablet and phone viewports, with axe:** upload a CSV and an .xlsx, see every row, see the problems, download the problem rows, edit them in the grid, paste a block, 51st row refused, the leave dialog, cards on a phone, no horizontal page scroll.

## 8. Build record and tests

### Slice 1: the engine and staff (branch `claude/bulk-staff`, worktree `AlEemaan-bulk`, 2026-11-17)

**Failing first** (against signature-only stubs, and without the route and the screen):
- unit: `bulk-table`, `bulk-validate`, `bulk-export`, `bulk-corrections` against stubs: **22 failed, 1 passed** (the empty-file case, where `[]` is already right); `bulk-xlsx`: **4 failed**.
- API `staff-bulk.spec.ts` without the route: **6 failed** (the setup step passed).
- browser `staff-bulk.spec.ts`, desktop, without the screen: **8 failed, 2 passed**: "a teacher does not get the button" passes trivially before the screen exists; it guards after.

**With the code:** unit 23 + 4 passed; API 7 passed (6 and setup); browser, desktop and phone, `staff-bulk.spec.ts` (10) with `academics-grading-staff.spec.ts` (the existing Staff screen spec): 27 passed and 2 failed, both the leave test (my locator matched "Download as CSV" in the grid and in the leave dialog: the test, not the screen); fixed and re-run on setup, desktop and phone: 3 passed.

**Found and fixed while building:**
- **A CSP violation from zod.** Every browser test failed on "the browser reported Content-Security-Policy violations: eval": zod 4 probes `new Function` when the first object schema is built, and the pages' CSP reports it. These are the first schemas the browser runs. `src/lib/zod-csp.ts` sets `jitless` in the browser; the files that build schemas import it first. The test fixture that fails on any CSP violation is the guard.
- **Escape closed the dialog under the "leave?" question.** `Dialog` is controlled, but the platform closes a `<dialog>` on Escape before the owner can object. `Dialog` got an opt-in `confirmClose` (Escape is reported through `onClose`; the owner decides). Existing dialogs are unchanged.
- **Literal byte-order marks in four files** (the `\ufeff` escape had become the character): found by the repo's own `source-hygiene.spec.ts` in the full unit run, replaced by the escape.

**Gates, in order, on the final tree:** `tsc --noEmit` exit 0; `eslint` 0 errors (2 warnings in files this task did not touch); `pnpm build` exit 0; Prettier `--check` clean on the changed files (`staff.ts`, `StaffPanel.tsx` and `Dialog.tsx` were clean at `dev` before they were formatted). The whole `unit` project: **1185 passed, 1 failed** (the BOM above); after the fix the guard and the five bulk specs: **29 passed**. API: `staff-assignments`, `staff-bulk`, `hardening-input`: passed in the same run.

**Not run, and not claimed:** the rest of the browser suite, `integration`, `https`, the rest of the `api` project, the walkthrough support project (no page, navigation entry or matrix file was removed), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.** Two new dependencies' advisories were checked first (`npm audit`: 0 for `read-excel-file`, `write-excel-file` and the data-validation plugin; `exceljs` had 2 moderate and was not used).

### Slices 2 to 4: invitations, pupils, fees (branch `claude/bulk-invitations`, worktree `AlEemaan-bulk2`, 2026-11-17)

**What was built.** The engine gained `notes` (what a save changes without refusing it), `prepare` (a lock taken first inside the real run's transaction), `save` returning post-commit work, `maxRows` per kind, `repeats` (a repeat that is a combination of columns), a `reviewExtra` slot, a branch control (`contextControl`, `canStart`), and the 255-character rule for an Excel dropdown (`fitsInlineList`). Invitations: `POST /api/v1/invitations/import` and "Invite many" on the Users page (`createInvitationIn` is `createInvitation` inside a caller's transaction; `mailInvitation` is shared with the single route). Pupils: `POST /api/v1/students/import` is replaced (new body, all or nothing, a dry run) and "Add many" replaces "Import from spreadsheet"; `lib/students/import.ts`, `lib/students/csv.ts` and `student-csv.spec.ts` are deleted. Fees: `POST /api/v1/finance/fee-structures/import` and "Add many" on the Fee schedule tab, with the review's total per period and class.

**Gaps in the old pupil import that this closed** (each is a row of `students-bulk.spec.ts`): names and the date were checked more loosely on the server (1 character, a pattern only) than in the browser; guardian phone and email were not checked on the server; an unknown class or arm enrolled the pupil in nothing and said nothing; no active session skipped the enrolment without a word; a date such as 2014-02-31 and a date in the future were not refused by the server; rows the browser found wrong were left out of what it sent, so the screen could report "imported 40 of 40" about a file of 50.

**Failing first.**
- Slice 2 (invitations): unit and API without the code or the route: **12 failed, 1 passed** (setup); browser without the screen: **4 failed, 1 passed** (setup). Run against the slice 1 build, with the unit module stubbed.
- Slices 3 and 4: unit against signature-only stubs and the old Excel module, with a build present: **16 failed, 4 passed** (the four older Excel tests). (A first attempt of this step ran with no build, the web server could not start, and it is not counted: a fixture error is not a failing-first result.) API and browser against the slice 1 build: **19 failed, 10 passed** (15 API, 4 browser; the passes are the setup step and tests of behaviour that did not change).

**A correction (2026-11-17, after the merge of PR #236).** The paragraph that stood here said every suite passed. **That was wrong.** My run script's summary matched only lines that start with a space, and Playwright prints "N failed" after a terminal escape, so the failed counts were never read. The real result of that run was: API 96 passed; browser (desktop and phone) **8 failed**, 89 passed; the whole `unit` project **1 failed**, 1186 passed; walkthrough support **2 failed**, 56 passed. CI on #236 ("Build and unit tests") failed for the unit one, and the merge script gates only on the deployment, so it merged. The causes, each fixed in the fix-forward PR (`claude/bulk-fix-forward`):

- **A real bug (1 unit, 4 browser):** the pupil date rule let a date that only looks right through. `toIsoDate("2014-02-31")` is `null`, the rule then kept the raw text, and the pattern `\d{4}-\d{2}-\d{2}` alone accepted it, in the browser and, because the rule is shared, on the server. The rule now also refuses a text that is not on the calendar. (`bulk-pupils.spec.ts` had `2014-02-31` among its failing samples and caught it; `students-screen.spec.ts` sends `2013-02-31`.)
- **A test that used the wrong id (2 browser):** `users-bulk.spec.ts` created an invitation with the membership's `id` as the `branchId`; it is now `branchId`.
- **A decision the test contradicted (2 browser):** when a row's dropdown holds a value the list does not offer (Administrator, for a branch administrator), the grid keeps it as the cell's value so the row reads true. It is now a **disabled** option, and the test asserts that Administrator is not among the options that can be chosen.
- **A stale walkthrough matrix (2 support tests; not caused by this task):** task 0080 moved `/` out of `src/app/page.tsx`, so the matrix named a file that no longer exists and eight school-site pages and `/product` had no row. Three rows now name the right file and `SIT-01` to `SIT-09` are added as planned. (The walkthrough chapters that walk those pages are not updated here; the maintainer put the walkthrough last.)

**With the code, one suite at a time, after the fixes (every "failed" line read, exit codes recorded):** build exit 0; API, 10 specs (`staff-bulk`, `invitations-bulk`, `students-bulk`, `fees-bulk`, `invitations`, `members`, `students`, `hardening-input`, `branch-admin-scope`, `staff-assignments`): **96 passed, 0 failed**; browser, desktop and phone, 7 specs (`staff-bulk`, `users-bulk`, `students-screen`, `fees-bulk`, `users`, `finance-fee-edit`, `academics-grading-staff`): **97 passed, 0 failed**; the whole `unit` project: **1187 passed, 0 failed**; the walkthrough support project: **58 passed, 0 failed**. Failing first for the fixes is the run above: the same tests failed on the same tree before the change.

**Tests changed on purpose** (the contract changed): `students.spec.ts` (the old import test is replaced by `students-bulk.spec.ts`), `hardening-input.spec.ts` and `branch-admin-scope.spec.ts` (the new body and the 201), `students-screen.spec.ts` (Add many instead of the pasted CSV), walkthrough chapter C06 (the hidden button's name).

**Gates:** `tsc --noEmit` exit 0; `eslint` 0 errors (one unused import found and fixed); Prettier `--check` clean on the changed files (each existing file was clean at `dev` before it was formatted).

**Not run, and not claimed:** the rest of the browser suite, `integration`, `https`, the rest of the `api` project, the walkthrough run itself (only its support project), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.** The e-mails of a bulk invitation were not sent to a real inbox (the tests read the development outbox).
