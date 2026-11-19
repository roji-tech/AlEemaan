# 0116: Result templates, assigned class by class (look + marks structure + grades), per branch

- **Period / Focus:** 2026-11-19 to 2026-11-20 (the maintainer: "in the results section, say I have 3 result templates used for different classes, or 4 ... template A for Prep A, Prep B and Nur 1; template B for Nur 2 and Basic 1 to 5; template C for Basic 6 and JSS 1 to 3; template D for SSS 1 and 2; template E for SSS 3 - or a more scattered, complicated assignment. I want to implement something that caters for my scenario and better." Then: "more templates can be added any time".)
- **Status:** Built; the unit tests pass; the API and browser tests are written and not yet run (section 8)
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

## 3. Data (migration `20261119210000_result_templates`, additive)

- `ResultTemplate`: `id`, `branchId` (cascade), `name` (unique among live per branch, ignoring case, partial index), `description`, `layoutCode` (nullable text; no foreign key, the layouts are created lazily), `layoutOptions` (nullable json), `schemeId` and `gradeScaleId` (nullable, composite foreign keys with the branch, `NO ACTION`), `isDefault` (exactly one live default per branch, partial unique index), `archivedAt`, timestamps.
- `ResultTemplateClass`: `id`, `branchId`, `templateId`, `classGroupId`, `createdAt`; unique on (`branchId`, `classGroupId`); composite keys to the template and the class group.
- Backfill: one "Default" template (`isDefault`, everything null) for every existing branch. No class assignments are created.

## 4. API (`/api/v1/results/templates`, all strict zod, audited, 404 for other branches)

- `GET ?branchId=` templates with their classes, the coverage (every class in level order with its template, whether it is explicit and whether it has its own scheme), and the choices (layouts, live schemes, live scales).
- `POST` create `{ branchId, name, description?, layoutCode?, layoutOptions?, schemeId?, gradeScaleId?, copyFrom?, classGroupIds? }` (`copyFrom` = duplicate: copies look, scheme and scale, never classes).
- `PATCH [id]` rename / describe / layout / scheme / scale; `POST [id]/archive`, `POST [id]/restore`, `POST [id]/default`; `PUT [id]/classes { classGroupIds, confirmMoves? }` replaces the template's set (classes dropped go back to "uses the default"); `POST schemes` creates a template scheme (D13).
- Audit: `RESULT_TEMPLATE_CREATED`, `_UPDATED`, `_ARCHIVED`, `_RESTORED`, `_DEFAULT_SET`, `_CLASSES_ASSIGNED` (before and after class ids), `ASSESSMENT_SCHEME_CREATED` for a template scheme.

## 5. Screens

- **Results > Templates** (administrators): template cards (name, look, scheme, scale, the classes as chips, Default badge, Edit / Duplicate / Add classes / Archive in the Actions menu); a **coverage table** of every class in level order with its template, "Uses the default" in muted text and a count of classes nobody has placed; **Add classes** is a checklist with "select a range" (from, to, by class order) and "select all in a level"; moving shows who leaves where before confirming. **New template** takes a few seconds, so the maintainer's A to E is five short dialogs and five checklists.
- **Academics > Classes:** a small "Result template" chip on each class that opens the same assignment in one step.
- **Approvals > Report cards:** its text now says it is the standard layout, and links to Templates.

## 6. Tests (written with the code)

Unit: precedence (no class, unassigned, explicit, default), coverage, range and level selection, the move preview, name rules, the layout merge. API: create, duplicate, one class one template, moves need confirmation, archive refused while assigned, default switching, the backfilled default, who may (another branch's administrator 404, a teacher read-only), the report card uses the class's layout, results unchanged after a move, the scheme precedence at sheet time, the approval hold. Browser: the A to E scenario on a desktop and a phone, a move with its confirmation, axe.

## 7. Work

- [x] Schema, migration and backfill
- [x] Rules (`lib/results/templates-rules.ts`, pure) and service (`lib/results/templates.ts`)
- [x] `loadContext` (scheme and scale) and `getReportCard` (look) use the template
- [x] API routes
- [x] Results > Templates, the Classes chip, the Report cards text
- [x] Tests written; docs

## 8. Build record

Written from the real runs of 2026-11-20 (no API or browser spec has been run; the integrating session runs them).

- **Migration** `20261119210000_result_templates`: `prisma migrate diff` from the migrations to the schema on a throwaway database reports "No difference detected". The backfill and the constraints were tried on two sample branches: each gets one "Default" template with no layout, scheme or scale; running the backfill again adds nothing; a second live default and a second live template named "default" (any case) are refused by the partial indexes; archiving frees the name; a class cannot be in two templates; a template of another branch cannot hold this branch's class (composite key). The throwaway databases were dropped.
- **Unit:** `tests/unit/result-templates.spec.ts`, 15 passed (the maintainer's A to E scenario, a scattered assignment, an unplaced class, the range, the section, the move preview, the set difference, the layout merge, the placement calls). The whole unit project on a server-less configuration with an unreachable database address: 1469 passed, 5 failed, 6 did not run. The 5 failures are `rate-limit.spec.ts` (3 tests of the database store), `communication-gateways.spec.ts:183` and `communication-templates.spec.ts:23`; all need a database and met the deliberately unreachable one. `route-role-guard`, `source-hygiene`, `search` and `shell-nav` passed with the new routes, files and the Results tab.
- **tsc, eslint, prettier, `prisma validate`:** clean.
- **Written, not run:** `tests/api/result-templates.spec.ts` (22 tests: the default, create/copy/change, one class one template and the confirmation, the A to E scenario over 16 classes, archive/restore/default, who may, the report card's look, the marks sheet's precedence, results unchanged after a move, the acknowledgement, a superseded and an archived scheme, the approval hold) and `tests/e2e/result-templates.spec.ts` (desktop and phone: the A to E scenario with ranges and ticks, a confirmed move, the form with a scheme made inside it, the Classes tab, a teacher without the tab; axe on each screen).
- **Existing specs that may need a touch-up when the suites run:** any spec that counts the Results tabs for an administrator (`tests/e2e/results-screens.spec.ts` asserts a teacher's tabs only, which are unchanged), the walkthrough chapter `c14-results.ts`, and any spec that creates a second `hosted: false` default scheme.

### Known limits (said here so they are not forgotten)

- The look is read when a card is drawn, so moving a class or editing a template's layout also changes how that class's EARLIER terms print. The marks never change. A snapshot per publication was left out (D10).
- `GET /api/v1/results/templates` and the first marks sheet of a branch that has no default template make one (idempotent): a read that writes once per branch.
- A per-arm override, a school-wide template shared across branches, and a preview of the card with a sample pupil are not built.
- Changing the template of a class does not move its pupils' already-entered marks, by design (D8).
