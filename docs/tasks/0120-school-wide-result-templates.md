# 0120: School-wide result templates (one report card, many branches)

- **Period / Focus:** 2026-11-20 (the four printed report cards as templates the whole school shares)
- **Status:** In Progress (built; the service is run against a throwaway database, the API and browser specs are written and not run)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/school-templates` (built on `claude/subject-catalog`, which carries sweep 2, the catalogue and the result templates) / not opened yet
- **Started:** 2026-11-20

> **How to tick:** change `[ ]` to `[x]`.

---

## 1. Objective

The maintainer, 2026-11-20: "Can you make all the templates I gave to you school-wide templates?" (the four printed cards of task 0116: Pre-school, Basic 1-6, Junior Secondary, Senior Secondary). Today each branch holds its own copy of each card, seeded by the migration or by the app, so a typo in a trait or a change of the Senior grade bands would have to be made in every branch, and the copies would drift apart. Success: the school keeps ONE definition of each card; a superadmin edits it once and brings the branches up to it deliberately; a branch keeps its own row (so classes, marks and results stay in the branch) and can change it or step away from the school's.

## 2. Decision: a master the rows follow, not a shared row

A `ResultTemplate` belongs to one branch, and every child (class assignments, the scheme, the scale, the trait groups and traits, every rating) points at it with the branch-checked composite key `(branchId, id)`: that is what stops one branch's marks from reaching another. Sharing ONE row between branches would remove that guarantee. So, the same shape as the subject catalogue (0119): a new school-wide **`SchoolResultTemplate`** (the master) holds the look and a validated `definition`; each branch keeps its own `ResultTemplate` row, which only says which master it follows (`schoolTemplateId`) and which version it was last brought up to (`schoolTemplateVersion`). Copying the master into the rows is an explicit act ("Update branches"), never a side effect of saving it.

## 3. Design

- **The master** (`SchoolResultTemplate`): name, description, `layoutCode`, `layoutOptions`, `version` (1 and up, bumped by any change to the name, description, look or definition), `archivedAt` (archived, never deleted: rows follow it), and `definition` (JSON, validated by `definitionSchema` and `checkDefinition`): `scheme` (name, total, exam, the continuous-assessment parts) or null, `scale` (name, bands, `unconfirmed`) or null, and `groups` (each with a stable `key`, a title, `showSign` and its traits, each with a stable `key` and a name). Null scheme or scale means "as each branch does today". The checks are the branch's own (`checkScheme`, `checkBands`), so a master can never hold what a branch could not, plus no two groups or traits with the same key or name.
- **The row** (`ResultTemplate`): `schoolTemplateId`, `schoolTemplateVersion` (both null or both set, a CHECK), and `localEditedAt` (set when somebody in the branch changed the look, name, scheme or scale of a followed row: "Customised here"). Trait groups and traits carry `schoolKey`, the stable key a sync matches on.
- **State of a row:** Up to date; Behind (the master has a later version); Customised here; or Customised and behind (`rowState`).
- **Who:** the master routes are a **superadmin's** only (`withAuth({ superAdmin: true })`, no branch). A branch **administrator** sees "School template · <state>" on a followed row, may edit it (which marks it Customised here) and may **Detach** it (an ordinary template of the branch from then on; nothing is copied or removed). Everyone else: 403. The role gate runs before the branch lookup; a foreign or unknown template is a 404.
- **Applying a master to a row** (`applyMaster`, used by Update branches, Add to branches and the seeding of a new branch):
  - *look:* layout code and options, the description, and the name when no other live template of the branch has it;
  - *marks:* the live scheme of the branch NAMED like the master's. Made (hosted, "made for a template") when absent; left alone when equal; changed in place while no result has locked it; otherwise a NEW VERSION (the predecessor is archived and linked, results keep the scheme they were entered under). A scheme the branch owns (not made for a template, or a school-wide or a teacher's) with that name is never touched: that branch fails with the reason;
  - *grades:* the same for the grade scale by name, never for the branch's default scale. A changed scale takes the master's `unconfirmed` flag; an unchanged one keeps the branch's own confirmation, and bands the master has confirmed school-wide clear the branch's notice;
  - *traits:* groups and traits are matched on their keys (a keyless group or trait of the branch with the same title or name is adopted, not duplicated); renamed ones keep their row and so their ratings; one the master dropped is **archived** (a group with no live trait is not printed), never deleted; the branch's own groups and traits are untouched;
  - *never:* class assignments.
- **One name, one structure.** A branch holds one live scheme per name and one live scale per name, and every row that follows a master with that name shares it. So two live masters that use the same scheme (or scale) name must describe it identically (`sharedNameClashes`); changing the marks of one of them needs a new scheme name. This is why the seeded cards, which share "Report card marks (CA 40 + exam 60)", cannot have it changed one card at a time under the same name.
- **Update branches** (`syncSchoolTemplate`): for each chosen branch (at most 50), its own transaction under the branch's template lock, and a report: `ok` (with what changed), `up-to-date`, `skipped-customised` (unless the branch is in `replaceLocal`), `not-following`, `gone`, `failed` (with the reason). Audited per branch (`SCHOOL_TEMPLATE_SYNCED`).
- **Add to branches** (`addSchoolTemplateToBranches`): `added`, `already`, `clash` (a template of the branch's own has that name: rename or detach it first), `gone`, `failed`.
- **Seeding a new branch** (`ensureReportTemplates`) now builds the four rows FROM the masters' current definition and links them, so a branch made after the superadmin edited a card starts on the edited card. The template row keeps the migration's id (`seedId(branch, "template", key)`). A master the superadmin archived is not given to new branches; superadmin-made masters reach branches only through Add to branches.
- **Marking Customised here:** `markCustomised` is called by the branch's own edits: `updateTemplate` and `applyTemplateLayout` (and the approval of a held layout change), and the scheme and scale edits of Academics > Assessment and grading (`updateScheme`, `newSchemeVersion`, `updateScale` and `newScaleVersion` when the bands changed; a rename or a confirmation alone is not a change of content). A sync never marks anything.
- **Migration** `20261121090000_school_result_templates` (additive; sorts after `20261120120000_subject_catalog`): the table, three nullable columns on `ResultTemplate`, `schoolKey` on groups and traits, partial unique indexes (a live master name ignoring case; one live row per branch per master; a key unique in its template or group), two CHECKs, and a backfill generated from the seed constants by `scripts/gen-school-template-sql.mjs`: the four masters (version 1), every branch's seeded live row linked to its master, and the keys on their groups and traits. A row that was renamed, given another look or archived stays the branch's own. A row whose description, look options, scheme or scale differs from the seeded ones (scheme and scale compared by content, so merely confirming the Junior bands is not a change) is linked and marked Customised here.

## 4. Work

- [x] Design (this file)
- [x] Schema, migration and backfill (`prisma/schema/academics.prisma`, `prisma/migrations/20261121090000_school_result_templates/`, `scripts/gen-school-template-sql.mjs`)
- [x] Pure rules (`lib/results/school-templates-rules.ts`) and seed data (`school-template-seed.ts`, `school-seeds.ts`)
- [x] Service (`lib/results/school-templates.ts`), seeding from masters (`seed-branch.ts`), Customised-here markers (`school-template-marks.ts`, `templates.ts`, `assessment.ts`, `settings/changes.ts`)
- [x] Routes: `GET/POST /api/v1/school-templates`, `GET/PATCH /api/v1/school-templates/[id]`, `POST .../sync`, `POST .../branches`, `POST /api/v1/results/templates/[id]/detach`; the route-role-guard registries and guard tests
- [x] Screens: Results > School templates (superadmin), the school badge, state and Detach on a branch's Templates
- [x] Docs (this file, the functions, components and pages references, the tasks index, the Octalve list)
- [x] Specs: unit (`tests/unit/school-templates.spec.ts`, the guard tests), integration (`tests/integration/school-templates.spec.ts`), API (`tests/api/school-templates.spec.ts`), browser (`tests/e2e/school-templates.spec.ts`)
- [ ] The run of the API and browser specs one at a time on the shared test database, merged to `dev`, promoted

## 5. Tests and what was run

Run (2026-11-20, from the logs):

- **Migration**, on a throwaway database after every earlier migration, with three seeded branches (one with the Basic template renamed, one with the Junior scale's bands edited and the Senior description changed, one with the Junior scale only confirmed): the four masters, the links (11 of 12 rows linked; the renamed one not), "Customised here" on exactly the two edited rows and not on the confirmed-only one, 155 of 174 traits and 22 of 24 groups keyed (the unlinked branch's are not); running the backfill again changed nothing (a hash of the rows before and after); `prisma migrate diff` from the migrations to the schema found no difference.
- **Integration spec** (the service called in-process on a throwaway `_test` database): 15 passed. Seeding from masters and from an edited master; Update branches (look, trait, bands; class assignment untouched; audited once; a second update is up to date); a customised branch skipped and then replaced; a locked scheme and a locked scale each making a new version with the old one archived and unchanged; a dropped trait archived and un-archived when it returns; a renamed trait keeping its row; not-following, gone and an archived master; a branch's own default scale holding the name (that branch fails and is not half-changed); Add to branches (added, already, clash, gone); Detach; validation (bands, marks, duplicate keys, a taken name, one name one structure); the listing and its states.
- **Unit**: `tests/unit/school-templates.spec.ts` and the guard tests, 29 passed with the existing guard tests.
- `tsc`, `eslint` and `prettier --check` on the changed files; `next build` compiles the new screens.

Not run: `tests/api/school-templates.spec.ts` and `tests/e2e/school-templates.spec.ts` (they need the shared test servers and database; the fixed ports were in use). Nothing was looked at in a browser, including the phone layout of the new dialogs. No trait with ratings was involved in the archive test (ratings need a pupil, a term and a user); the archive is by `archivedAt`, and the foreign keys already refuse deleting a trait that has ratings.

## 6. Known limits and follow-ups

- **Printed-history fix (not in this task):** a published card is drawn at render time from the pupil's CURRENT template, so moving a class to another template, or updating a branch, changes how earlier terms print (marks never change). Stamping which template a published card used is a separate piece.
- A school-wide template cannot yet carry a per-class grade scale or class assignments (by design: classes are the branch's).
- The master editor has no "restore previous version"; a version is not kept once replaced (the audit log keeps what changed).
- A superadmin's wish to change the shared marks scheme for all four seeded cards at once means giving the new structure a new scheme name in each (see "One name, one structure").
- Bulk "Add to all branches" and a "Behind" count on the Results tab are not built.
