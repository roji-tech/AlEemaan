# 0116: Result templates, assigned class by class (look + marks structure + grades), per branch

- **Period / Focus:** 2026-11-19 to 2026-11-20 (the maintainer: "in the results section, say I have 3 result templates used for different classes, or 4 ... template A for Prep A, Prep B and Nur 1; template B for Nur 2 and Basic 1 to 5; template C for Basic 6 and JSS 1 to 3; template D for SSS 1 and 2; template E for SSS 3 - or a more scattered, complicated assignment. I want to implement something that caters for my scenario and better." Then: "more templates can be added any time".)
- **Status:** Built, including the four seeded report-card sets (D14 to D19); the unit tests pass; the API and browser tests are written and not yet run (section 8)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/result-templates` / to be opened into `dev`
- **Started:** 2026-11-19

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What exists (read from the code, 2026-11-19)

- **Look:** one report-card layout per branch (`SettingValue` key `report_card_layout`: `DEFAULT` or `LEGACY` plus three on/off options), read by `getBranchReportCardLayout`, changed in Approvals > Report cards. An administrator's change can be held for a superadmin (`needsApproval`, `fileRequest`). Every class prints the same card.
- **Marks structure:** an `AssessmentScheme` (continuous-assessment parts plus an exam). `results.ts` `loadContext` picks a class's own live scheme, else the branch's default live scheme. The database allows ONE live non-hosted scheme per class and one default per branch, so two classes cannot share a scheme that is not the branch default.
- **Grades:** one default `GradeScale` per branch. A result stores its own `schemeId` and `scaleId` (the first result locks both).
- So the maintainer's A to E exists only in pieces; there is no one place that says "these classes use this look, this marks structure and this grade scale".

## 2. Decisions (the maintainer accepted these defaults on 2026-11-19; each may change)

- **D1. A result template is a named bundle of three things:** a look (a layout code and its options), a marks structure (a scheme) and a grade scale. Per branch only.
- **D2. A class group is in at most ONE template; a template holds any set of classes** (a database rule: unique on branch + class). So any pattern works, scattered or in runs: nothing is a range in the data. A class in no template uses the branch's **default template** (exactly one live default per branch). Choosing a template for a class explicitly, even the default one, records the class as covered; "uses the default" is the state of a class nobody has placed.
- **D3. By class, not by arm.** A per-arm override is a later addition (not built).
- **D4. Unrestricted:** a branch may have any number of templates; create, rename, duplicate, archive and restore are free. The only refusals protect results (D8) and classes (D9).
- **D5. Nothing changes until someone uses it.** The migration gives every existing branch a template named "Default" with no look, scheme or scale set of its own, which means "as before". A branch created later gets its default template the first time anyone asks (`ensureDefaultTemplate`, idempotent).
- **D6. Layout.** A template's layout is optional. Not set (null) means "the branch's standard layout", exactly what Approvals > Report cards edits today, so that panel keeps working untouched and is now described as the standard layout. Set means the template's own layout code and options. A new template starts as "standard" unless a layout is chosen.
- **D7. Precedence, in one place (`lib/results/templates.ts`):**

| What | 1st | 2nd | 3rd |
|---|---|---|---|
| Marks structure (scheme) when a sheet is made | the class's OWN scheme (set in Academics > Assessment and grading, unchanged) | the class's template's scheme | the branch's default scheme |
| Grade scale | the class's template's scale | the branch's default scale | none: refused with the usual words |
| Look | the class's template's layout | the branch's standard layout | built-in default |

  A teacher's own scheme (task 0039) is unchanged and not part of `loadContext`. When a class has its own scheme AND its template names one, the class's own wins, and the coverage table says so ("has its own scheme, which is used instead") so nobody is surprised.
- **D8. Results are never rewritten.** A result keeps the scheme and scale it was entered under (existing rule). Changing a template's scheme or scale, or moving a class, affects only sheets made afterwards. If results already exist for the template's classes in the open session, changing the scheme or scale needs `acknowledge: true` (409 with the count otherwise), and the screen says: "Marks already entered keep the structure they were entered under."
  - A scheme or scale that is versioned (locked, so a new version replaces it) is followed to its live successor; one that is archived with no successor is refused at sheet time with the template's name, never silently replaced by a different grade scale.
- **D9. Safety.** Moving classes between templates shows exactly which classes leave which template and needs `confirmMoves`; archiving a template that still holds classes is 409 with the class list (archiving moves nothing); the default template cannot be archived (make another the default first, with a confirmation); a template's scheme and scale must be live ones of the same branch.
- **D10. Layout and old terms (known limit).** The layout is read when a card is drawn, as it was before. Moving a class or editing a template's layout therefore changes how that class's earlier terms print; the marks never change. A per-publication snapshot of the layout was considered and left out: it needs a column on every result or a new record per card, and the card is a computed view by design. The screen says so next to the layout choice.
- **D11. Approval hold reused.** Where a superadmin has put the layout behind approval, an administrator's change to a template's LAYOUT is filed as the same request (with the template's id in the proposed value) and applied on approval by the same code; the other fields of the same save apply at once. A superadmin's change is immediate.
- **D12. Who.** Administrators of the branch and superadmins manage templates and assign classes; every other staff role reads; nobody else. Another branch's template or class is a 404.
- **D13. Marks structure for a template.** A template can pick any live scheme of its branch, or create one for itself. A template's own scheme is stored like the school-wide ones (`hosted = true`, no class): the one-live-scheme-per-class rule ignores it, and its name is unique among the branch's live schemes. Versioning a hosted scheme now keeps it hosted (a one-line fix in `newSchemeVersion`, which would otherwise have made the new version collide with the branch default).

### D14. The school's four printed report cards as templates (the maintainer, 2026-11-20: photos of Al-Eeman's four cards)

Seeded per branch, editable afterwards, class assignment left to the maintainer (Results > Templates or the Classes tab). The data is `lib/results/seed-templates.ts`; the migration's backfill is generated from it (`scripts/gen-report-template-sql.mjs`) and the application seeds a branch made later with the same ids (`lib/results/seed-branch.ts`: branch create, the setup wizard, and the first Templates read), so a branch is never seeded twice. A test reads the migration text and checks it carries exactly the seed data.

| Template | Look (layout code) | Trait groups | Grade scale |
|---|---|---|---|
| Pre-school (Nursery and Primary School) | `PRESCHOOL` | Psychomotor skill (6), Affective domain (13) | marks only (a plain scale, letters not printed) |
| Basic class (Grade 1-6) | `BASIC` | Psychomotor skill (6), Affective domain (13) | marks only |
| Junior Secondary (Year 7-9) | `JUNIOR` | Character development (5), Practical skills (5), each with RATING and SIGN | A Excellent, B Good, C Average, E Fair (**cut-offs are a default, see D15**) |
| Senior Secondary (Year 10-12) | `SENIOR` | Character development (5), Practical skills (5), each with RATING and SIGN | A1 75-100, B2 70-74, B3 65-69, C4 60-64, C5 55-59, C6 50-54, D7 45-49, E8 40-44, F9 0-39 |

- **The subjects of a card are never listed here.** They are the pupil's own results, which come from the class's subject offerings (loaded from `out/aleemaan-subjects.csv`). A senior pupil who takes "Chemistry / Government" in one slot simply has the one subject listed.
- **The marks structure** is one hosted scheme shared by the four, "Report card marks (CA 40 + exam 60)". The printed cards say "Mark obtainable"; the school's own maximums can differ, so it is a default to confirm and edit.
- **Skipped, never an error:** a name already taken by a live row of the branch (the scheme, a scale, a template) is left alone; the template then simply has no scheme or no scale of its own (falls back to the branch's). No seeded scale is the branch's default scale. No class is placed.

### D15. Grade cut-offs the maintainer must confirm

The junior card prints A Excellent, B Good, C Average, E Fair and no D; no cut-offs were printed. The seeded default is A 70-100, B 60-69, C 50-59, E 0-49. **This is a default, not the school's rule: confirm or change it in Academics > Assessment and grading (the scale "Junior secondary report card scale").** The pre-school and basic cards print no letter at all; their scale exists only so marks can be entered and is never shown on the card.

### D16. Trait ratings

- A **trait group** (title, order, whether it has a SIGN column) and its **traits** (name, order, archived never deleted) belong to a template. A pupil's **rating** of a trait for a term is 1 to 5 (5 Excellent, 4 V. Good, 3 Good, 2 Fair, 1 Poor; the printed scale stops at 2, 1 = Poor is added). A database CHECK enforces 1 to 5; a repeated pupil + term + trait is one row.
- **Who may enter:** an administrator of the branch, or the teacher who is the **class teacher of the arm the pupil is enrolled in for the term's session**. Any other teacher, non-teaching staff and other branches: refused (403, or 404 for a pupil of another branch). Staff may read.
- **Locked like the remarks:** editable until any of the pupil's results for the term is PUBLISHED or LOCKED, then 409.
- **No IDOR:** the traits must be live traits of the pupil's OWN template (the one their class uses); a trait of another template or branch, a repeated trait, or a rating outside 1 to 5 is refused and nothing is written (all or nothing). Composite keys keep the pupil, term and trait in one branch.
- **Audited:** `TRAIT_RATINGS_SAVED` with what changed (from, to), per save; a no-op writes none.

### D17. Attendance on the card

Nothing is invented. Each of the three numbers comes from: a number someone ENTERED for that pupil and term (`ReportAttendance`, entered by an administrator or the class teacher, same lock), else the REGISTER, else a dash. The register's numbers: times the school opened = the distinct dates on which the branch took a register within the term (less the dates inside a break); times present = the pupil's PRESENT and LATE days; times absent = their ABSENT days; EXCUSED counts as neither. Entered numbers win field by field and the card data says which is which. Present and absent cannot exceed times open when both are known (409). The dates on the card come from the term: this term starts on = the term's start; school closed on = its end; next term starts on = the first term that begins after this one (this or the next session). Audited `REPORT_ATTENDANCE_SAVED`.

### D18. The printed card

- `TemplateReportCard` draws the four from the card's data; it is chosen when the look's code is one of the four layout codes. Header band in the logo's green (#1a6b5a, taken from `public/school-site/aleeman-logo.png`, the real colour logo drawn on a white tile on the band), light tinted table heads and trait bands, school name, address, motto "Second to none" as set in the school's profile, REPORT CARD, term and session. Sections: the pupil block (name, date of birth, sex, class, number in class, position in class, number of times absent), attendance, the marks table (mark obtainable, continuous assessment, exam, total with the term's name, the earlier terms, annual score, annual average %, position, teacher's remark, signature) with a TOTAL row and the total average in percentage, the trait groups, the scale, the grading legend (secondary), the comments with signature and date lines (and the parent's/guardian's on pre-school and basic) and, on the secondary cards, next term begins.
- It is drawn as paper (white, dark text) in both themes so the colours are the printed ones. Print: `print-color-adjust: exact`, compact type and the existing A4 portrait page rule, so a card with a normal number of subjects fits one page; text on the band is white on dark green and every figure is black on white or a light tint, so a black-and-white print stays legible.
- Subject columns for earlier terms come from the pupil's results in the same session (the same statuses as the card itself); a pupil's position in a subject is among the pupils of their arm.

### D19. Known limits of this build

- "Layout read at render time" is unchanged (D10): changing a class's template changes how its earlier terms print.
- The downloadable HTML card (`Download report card`) still uses the standard card; printing from the screen prints the coloured card. The HTML export of the four designs is a later step.
- Fitting one A4 page is by compact type, not measured; a card with many subjects and many earlier terms may need two pages.
- Pre-school and basic show the term's dates and the secondary cards only "next term begins"; a "Head's comment" and "Parent's comment" are printed lines (the parent's is for handwriting).
- Archiving a grade scale that a class or template uses is still allowed (the existing rule); the marks sheet then refuses with a 409 naming whose it is, which is how "never a different scale silently" is kept.
- The four layout codes can also be chosen as a branch's STANDARD layout in Approvals > Report cards (they render as a card with no trait sections for a class that has no traits).

### D20. A class's own grade scale (the maintainer, 2026-11-20: "make the scale editable per class per branch, and always superadmin editable")

- **Order:** the class's OWN scale, then its result template's scale, then the branch's default scale. Used by the marks sheet (the scale a new result is graded on), so everything downstream (the report card's legend, the results workflow) follows because a result carries its own scale. Marks already entered keep the scale and the letters they were given; changing a scale or a class's choice reaches only marks entered afterwards.
- **Where it lives:** a table of its own, `ClassGradeScale` (one row per class, unique on branch + class, same branch by composite keys, the scale never deleted so no cascade from it), not a column of `ResultTemplateClass`: a class that is in no template (it uses the default one) can have its own scale too. A row means "this class grades on this scale"; no row means "follow the template, then the branch default".
- **A scale that is named but archived** with no live successor is a 409 naming the class (or the template), never a different scale applied silently. A scale replaced by a new version is followed to its live successor (the existing versioning rule); entered marks keep the version they were entered under.
- **Who:** `PUT /api/v1/results/templates/class-scale` is for a branch ADMINISTRATOR of that branch and a SUPERADMIN everywhere (`administer`); anyone else is 403 (a branch named in the body is a 403), and the role gate runs before the branch lookup. Editing scales stays on the existing grade-scale routes, which have the same authority. The route-role-guard unit test asserts this for the new routes.
- **Screens:** Results > Templates: each class has a "Grade scale" select beside its template (own scale, or "template's, else the branch default") and a line saying which scale it grades on and from where; a "Grade scales" section lists every live scale with the classes that grade on it, Edit bands (a new version once marks used it), Duplicate and New scale, all in the SAME editor as Academics > Assessment and grading (`ScaleDialog`, exported and reused, with a duplicate starting point and a "classes grading on this scale" note). The Classes tab's "Result template" dialog also chooses the class's grade scale.
- **Audit:** `RESULT_CLASS_SCALE_SET` and `RESULT_CLASS_SCALE_CLEARED` with before and after; scale edits keep their own audit rows.

### D21. The unconfirmed junior scale (the maintainer asked whether the junior cut-offs are a default or fixed)

- **They are a seeded default, editable, and the risk is now visible.** `GradeScale.unconfirmed` (migration `20261119240000_grade_scale_unconfirmed`) is true for the seeded JUNIOR scale of every branch and false for everything else (the senior ranges are printed on the card, so it is confirmed; the plain scale is never printed).
- **While it is unconfirmed:** the scale carries "Please confirm these grade bands: they were set from the card, which prints no ranges" in Results > Templates (Grade scales and the class's line) and in Academics > Assessment and grading, with a **Confirm these bands** button. Entering and approving marks work; **publishing results graded on it is a 409** that names the scale and says where to confirm. The check is in the results workflow's publish transaction (`transitionResults`), over the scales of the results being published, all or nothing; no screen can bypass it.
- **It clears when** a branch administrator of that branch or a superadmin presses Confirm (`POST /api/v1/academics/grade-scales/[id]/confirm`, idempotent, audited `GRADE_SCALE_CONFIRMED` with who and when), or when the bands are edited and saved. Editing in place clears it; once marks have used the scale, the edit is a new version whose bands are the administrator's, so the NEW version is confirmed. The EARLIER version stays unconfirmed (marks graded on it keep its letters and cannot be published until it is confirmed too); it is listed under "Earlier versions never confirmed" with its own Confirm button. A rename alone never confirms.
- **A branch seeded later** gets the junior scale unconfirmed (`ensureReportTemplates`).

## 3. Data (migration `20261119210000_result_templates`, additive)

- `ResultTemplate`: `id`, `branchId` (cascade), `name` (unique among live per branch, ignoring case, partial index), `description`, `layoutCode` (nullable text; no foreign key, the layouts are created lazily), `layoutOptions` (nullable json), `schemeId` and `gradeScaleId` (nullable, composite foreign keys with the branch, `NO ACTION`), `isDefault` (exactly one live default per branch, partial unique index), `archivedAt`, timestamps.
- `ResultTemplateClass`: `id`, `branchId`, `templateId`, `classGroupId`, `createdAt`; unique on (`branchId`, `classGroupId`); composite keys to the template and the class group.
- Backfill: one "Default" template (`isDefault`, everything null) for every existing branch. No class assignments are created.

### Report-card sets (D14 to D18): migration `20261119220000_report_card_templates`, additive

- `ResultTemplateTraitGroup` (title, order, `showSign`), `ResultTemplateTrait` (name, order, archived), `TraitRating` (pupil, term, trait, rating 1 to 5 with a CHECK; one row per pupil + term + trait) and `ReportAttendance` (entered times open, present, absent; never negative). All keyed with the branch so a row cannot point across branches.
- The backfill gives every existing branch the four templates, their scheme, scales, trait groups and traits (idempotent; ids `rts_` + md5 of branch and what).
- Four new layout codes (`PRESCHOOL`, `BASIC`, `JUNIOR`, `SENIOR`), created like the first two the first time layouts are read.

## 4. API (`/api/v1/results/templates`, all strict zod, audited, 404 for other branches)

- `GET ?branchId=` templates with their classes, the coverage (every class in level order with its template, whether it is explicit and whether it has its own scheme), and the choices (layouts, live schemes, live scales).
- `POST` create `{ branchId, name, description?, layoutCode?, layoutOptions?, schemeId?, gradeScaleId?, copyFrom?, classGroupIds? }` (`copyFrom` = duplicate: copies look, scheme and scale, never classes).
- `PATCH [id]` rename / describe / layout / scheme / scale; `POST [id]/archive`, `POST [id]/restore`, `POST [id]/default`; `PUT [id]/classes { classGroupIds, confirmMoves? }` replaces the template's set (classes dropped go back to "uses the default"); `POST schemes` creates a template scheme (D13).
- Audit: `RESULT_TEMPLATE_CREATED`, `_UPDATED`, `_ARCHIVED`, `_RESTORED`, `_DEFAULT_SET`, `_CLASSES_ASSIGNED` (before and after class ids), `ASSESSMENT_SCHEME_CREATED` for a template scheme.

### Class grade scale and confirmation: migrations `20261119230000_class_grade_scale` and `20261119240000_grade_scale_unconfirmed`, additive

- `ClassGradeScale` (D20): one table, no rows. `GradeScale.unconfirmed` boolean default false, set true for the seeded junior scale of each branch by the second migration (D21).

### Report-card sets API

- `GET /api/v1/students/[id]/report-traits?periodId=`: the pupil's template, its trait groups with ratings, the attendance (entered, from the register, and the one the card prints), the term's dates, `locked` and `canEdit`. Any staff role of the pupil's branch.
- `PUT /api/v1/students/[id]/report-traits { periodId, ratings: [{ traitId, rating | null }] }`: administrators and the pupil's class teacher (staff-write; another teacher 403); all or nothing; 409 once published or for a trait not on the pupil's template; 400 for a rating outside 1 to 5.
- `PUT /api/v1/students/[id]/report-attendance { periodId, timesOpen?, timesPresent?, timesAbsent? }`: the same people and lock; a number sets, null clears back to the register, a field left out is unchanged.
- `PUT /api/v1/results/templates/class-scale { branchId, classGroupId, gradeScaleId | null }`: sets or clears a class's own grade scale (administrators of the branch, superadmin everywhere; 409 for a class or scale that is not a live one of the branch). `GET /api/v1/results/templates` now also answers, per class, `classScaleId` and `scale { id, name, source, archived, unconfirmed }`, the scales with `unconfirmed`, and `earlierUnconfirmed`.
- `POST /api/v1/academics/grade-scales/[id]/confirm`: "Confirm these bands" (administrator of the scale's branch or a superadmin; idempotent; audited). Publishing results graded on an unconfirmed scale is a 409 from `POST /api/v1/academics/results/transition`.
- `GET /api/v1/students/[id]/report-card` now also carries the date of birth, each subject's earlier-term scores, annual score and average and position, the trait groups with ratings, the attendance block and the dates.

## 5. Screens

- **Results > Templates** (administrators): template cards (name, look, scheme, scale, the classes as chips, Default badge, Edit / Duplicate / Add classes / Archive in the Actions menu); a **coverage table** of every class in level order with its template, "Uses the default" in muted text and a count of classes nobody has placed; **Add classes** is a checklist with "select a range" (from, to, by class order) and "select all in a level"; moving shows who leaves where before confirming. **New template** takes a few seconds, so the maintainer's A to E is five short dialogs and five checklists.
- **Academics > Classes:** a small "Result template" chip on each class that opens the same assignment in one step.
- **Approvals > Report cards:** its text now says it is the standard layout, and links to Templates.

- **Report cards > Traits and attendance** (administrators and the class teacher): the 1 to 5 ratings of each trait and the term's attendance numbers (a blank number uses the register's), read-only once published. The card itself is drawn in colour for the four layouts (D18).

## 6. Tests (written with the code)

Unit: precedence (no class, unassigned, explicit, default), coverage, range and level selection, the move preview, name rules, the layout merge. API: create, duplicate, one class one template, moves need confirmation, archive refused while assigned, default switching, the backfilled default, who may (another branch's administrator 404, a teacher read-only), the report card uses the class's layout, results unchanged after a move, the scheme precedence at sheet time, the approval hold. Browser: the A to E scenario on a desktop and a phone, a move with its confirmation, axe.

Class scale and confirmation: unit (`tests/unit/scale-confirmation.spec.ts`: the resolution order, the refusal text, when saving confirms, only the junior scale seeded unconfirmed, the two migrations' text; `route-role-guard.spec.ts`: the two new routes are administrators only with the branch checked); API (`tests/api/class-grade-scale.spec.ts`: who may incl. superadmin in any branch, same-branch and live checks, the resolution order on the marks sheet, entered marks keep theirs, a superseded scale is followed and an archived one is a 409 naming the class, the coverage, the publish 409 and Confirm, edit confirms, a new version, the earlier version); browser (`tests/e2e/result-templates.spec.ts`: the coverage select, the unconfirmed notice and Confirm, duplicate and edit in the shared editor, the Classes-tab dialog).

Report-card sets: unit (`tests/unit/report-traits.spec.ts`: the scale, rating and attendance checks, the register's numbers, annual figures, the four seeded cards against the printed ones, the migration text against the seed data); API (`tests/api/report-traits.spec.ts`: seeding, who may, bounds, no IDOR across templates and branches, the lock, entered against register attendance, the card's data, a branch made later); browser (`tests/e2e/report-card-traits.spec.ts`: entering ratings and attendance and seeing them on the coloured senior card, the pre-school card and its print colours, read-only after publication).

## 7. Work

- [x] Schema, migration and backfill
- [x] Rules (`lib/results/templates-rules.ts`, pure) and service (`lib/results/templates.ts`)
- [x] `loadContext` (scheme and scale) and `getReportCard` (look) use the template
- [x] API routes
- [x] Results > Templates, the Classes chip, the Report cards text
- [x] Tests written; docs
- [x] Report-card sets (D14 to D19): migration and seeding, trait and attendance services and routes, the four coloured cards, the entry dialog, tests, docs

## 8. Build record

Written from the real runs of 2026-11-20 (no API or browser spec has been run; the integrating session runs them).

- **Migration** `20261119210000_result_templates`: `prisma migrate diff` from the migrations to the schema on a throwaway database reports "No difference detected". The backfill and the constraints were tried on two sample branches: each gets one "Default" template with no layout, scheme or scale; running the backfill again adds nothing; a second live default and a second live template named "default" (any case) are refused by the partial indexes; archiving frees the name; a class cannot be in two templates; a template of another branch cannot hold this branch's class (composite key). The throwaway databases were dropped.
- **Unit:** `tests/unit/result-templates.spec.ts`, 15 passed (the maintainer's A to E scenario, a scattered assignment, an unplaced class, the range, the section, the move preview, the set difference, the layout merge, the placement calls). The whole unit project on a server-less configuration with an unreachable database address: 1469 passed, 5 failed, 6 did not run. The 5 failures are `rate-limit.spec.ts` (3 tests of the database store), `communication-gateways.spec.ts:183` and `communication-templates.spec.ts:23`; all need a database and met the deliberately unreachable one. `route-role-guard`, `source-hygiene`, `search` and `shell-nav` passed with the new routes, files and the Results tab.
- **tsc, eslint, prettier, `prisma validate`:** clean.
- **Written, not run:** `tests/api/result-templates.spec.ts` (22 tests: the default, create/copy/change, one class one template and the confirmation, the A to E scenario over 16 classes, archive/restore/default, who may, the report card's look, the marks sheet's precedence, results unchanged after a move, the acknowledgement, a superseded and an archived scheme, the approval hold) and `tests/e2e/result-templates.spec.ts` (desktop and phone: the A to E scenario with ranges and ticks, a confirmed move, the form with a scheme made inside it, the Classes tab, a teacher without the tab; axe on each screen).
- **Existing specs that may need a touch-up when the suites run:** any spec that counts the Results tabs for an administrator (`tests/e2e/results-screens.spec.ts` asserts a teacher's tabs only, which are unchanged), the walkthrough chapter `c14-results.ts`, and any spec that creates a second `hosted: false` default scheme.

### Report-card sets (2026-11-20)

- **Migration** `20261119220000_report_card_templates`: migration-vs-schema "No difference detected" on a throwaway database. The backfill was tried on three sample branches (one with a name clash on a scheme and a template): each gets four templates with the right scheme, scale, trait groups and traits (6 + 13 + 6 + 13 + 5 + 5 + 5 + 5 = 58 traits), the clashing names are skipped without error, a second run adds nothing (223 rows before and after), no seeded scale is a default, and a rating of 6 is refused by the CHECK. The throwaway databases were dropped.
- **Unit:** `tests/unit/report-traits.spec.ts` and `result-templates.spec.ts`: 33 passed together on a server-less configuration.
- **Written, not run:** `tests/api/report-traits.spec.ts` (ratings, attendance, seeding and the card) and `tests/e2e/report-card-traits.spec.ts` (desktop and phone, axe). The result-templates specs were updated for the four extra seeded templates (a branch now lists five).
- **Class scale and unconfirmed (written, not run):** migrations checked against the schema on a throwaway database; `20261119240000` applied after the report-card backfill on two sample branches flags exactly the junior scale (`Junior secondary report card scale | t`, everything else `f`); `ClassGradeScale` accepts one row per class, refuses a second row, a class of another branch and deleting a scale in use, and loses its row with the class. Unit 52 passed (this spec, the role-guard spec and the two earlier ones); the whole unit project on a server-less configuration with an unreachable database address: 1591 passed, 5 failed, 6 did not run (the same five that need a database: three `rate-limit.spec.ts` database-store tests, `communication-gateways.spec.ts:183`, `communication-templates.spec.ts:23`). The API and browser specs for D20 and D21 have not run.
- **Not verified:** how the four cards look on paper (no browser or printer was used), that a card with many subjects fits one A4 page, and the layout at phone width.

### Known limits (said here so they are not forgotten)

- The look is read when a card is drawn, so moving a class or editing a template's layout also changes how that class's EARLIER terms print. The marks never change. A snapshot per publication was left out (D10).
- `GET /api/v1/results/templates` and the first marks sheet of a branch that has no default template make one (idempotent): a read that writes once per branch.
- A per-arm override, a school-wide template shared across branches, and a preview of the card with a sample pupil are not built.
- Changing the template of a class does not move its pupils' already-entered marks, by design (D8).
