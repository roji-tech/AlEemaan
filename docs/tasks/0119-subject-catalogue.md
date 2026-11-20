# 0119: Shared subject catalogue (one subject, many branches)

- **Period / Focus:** 2026-11-20 (subjects that several branches offer; the superadmin's view of all of them)
- **Status:** In Progress (built; API and browser specs written, not run)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/subject-catalog` / not opened yet
- **Started:** 2026-11-20

> **How to tick:** change `[ ]` to `[x]`.

---

## 1. Objective

The maintainer, 2026-11-20: "what if one subject can be connected to multiple branches" and "superadmin should be able to view all subject and the branches offering them". Success: the school keeps ONE list of subjects (a catalogue); each branch can take a subject from it with one click; a superadmin sees every subject with the branches offering it; the CSV of 38 subjects loads once and is added to the branches that teach it.

## 2. Decision: a catalogue, not a many-to-many

Today a `Subject` belongs to exactly one branch, and `Result`, `SubjectOffering`, `StaffSubjectAssignment`, `AssessmentSchemeScope`, `TimetableSlot`, the LMS tables and `DepartmentMember`-adjacent rows all point at it with the composite key `(branchId, id)`. That is what lets the database itself refuse a mark, a class offering or a teacher assignment that mixes two branches. A subject shared by several branches (a join table `Subject <-> Branch`) would remove that guarantee: one query without a branch filter could read or write another branch's marks.

So the shared thing is a new, school-wide **`SubjectCatalog`** entry, and each branch keeps its own `Subject` row (unchanged: same keys, same archive rules, same department link) with an optional `catalogId`. "English Language" is the same subject in every branch because the rows point at one catalogue entry, but no result, offering or assignment ever crosses a branch.

## 3. Design

- **Schema** (`prisma/schema/academics.prisma`): `SubjectCatalog { id, name, code?, tags text[], archivedAt?, createdAt, updatedAt }`; `Subject.catalogId String?` -> `SubjectCatalog` (onDelete NoAction: entries are archived, never deleted), `@@index([catalogId])`. Migration `20261120120000_subject_catalog`, additive. Raw partial unique indexes (Prisma cannot express them, like `Subject_live_name_key`): a live catalogue name is unique ignoring case; a live catalogue code is unique when present; one live `Subject` per branch per catalogue entry (`(branchId, catalogId)` where `catalogId` is not null and `archivedAt` is null). Backfill: one catalogue entry per distinct live subject name across branches (case-insensitive; the code of the first row that has one, only if no other entry already has that code), and every live subject of that name is linked. Safe on an empty database, repeatable, deletes nothing.
- **Who may do what.** The catalogue is the school's, so create / rename / code / archive / "add to branches" / the all-subjects view are **superadmin only** (`withAuth({ superAdmin: true })`). A branch **administrator** may "Add from catalogue" into their own branch (`POST /api/v1/academics/subjects/from-catalog`, `withBranch` administer with the branch in the body: 403 for a branch that is not theirs, a role gate that answers 403 before the branch lookup could answer 404) and list what their branch lacks (`GET /api/v1/subject-catalog/available?branchId=`, 404 for a branch that is not theirs). Everyone else: 403. A branch administrator never sees the names of other branches, nor the catalogue entries a superadmin archived.
- **Rename.** A catalogue rename changes only the entry unless the superadmin chooses "also rename in every branch" (default off). With it on, a branch where the new name would clash with another live subject of that branch refuses the whole rename: 409 naming those branches (a superadmin sees every branch, so the names are fine to give). Audited in the same transaction.
- **Archive.** Archiving an entry hides it from "Add from catalogue" and from "Add to branches". The branches' own subjects are untouched (they keep working; a school's marks never depend on the catalogue). Restoring is `archived: false`.
- **Linking the normal ways.** A subject created in a branch the usual way (single form, bulk import) is linked to the catalogue entry with the same name (ignoring case) when one exists and is live. Nothing is created in the catalogue from a branch: only the superadmin's screens create entries. No silent cross-branch write.
- **API** (all bodies zod-strict and bounded, standard error envelope, writes rate limited):
  - `GET /api/v1/subject-catalog?q=&archived=&page=` (superadmin): each entry with the branches offering it (branch id and name, the branch subject's id, live or archived, how many classes of that branch offer it), and the number of branches.
  - `POST /api/v1/subject-catalog` {name, code?} (superadmin): one entry; 409 for a taken name or code.
  - `POST /api/v1/subject-catalog/import` {dryRun, rows} (superadmin): the CSV, through the bulk engine's `subjectCatalogKind` (same row rules as the branch subjects: name up to 60, code up to 12; all or none; batches of 20 from the screen).
  - `PATCH /api/v1/subject-catalog/[id]` {name?, code?, archived?, renameInBranches?} (superadmin).
  - `POST /api/v1/subject-catalog/[id]/branches` {branchIds[]} (superadmin; at most 50): each branch is its own transaction and reported (`added`, `already`, `renamed-clash`...); a branch's live subject with the same name (ignoring case) and no link is linked instead of duplicated.
  - `GET /api/v1/subject-catalog/available?branchId=` and `POST /api/v1/academics/subjects/from-catalog` {branchId, catalogIds[]} (administrator of that branch, or superadmin; at most 50): per entry `added` / `already` / `clash`.
- **Screens.** Superadmin: "Subject catalogue" (Academics, school-wide, shown to a superadmin only): a list/grid of the subjects, each with chips for the branches offering it (a chip opens that branch's own subject and the classes offering it), search, Add subject, Import subjects (the bulk dialog), Add to branches (multi-select), Rename (with the "also rename in every branch" choice), Archive / Restore. Branch administrator: "Add from catalogue" in the branch's Subjects tab (multi-select of what the branch lacks).
- **Tags** (the maintainer, 2026-11-20: "can we add tags to subjects?"). `SubjectCatalog.tags` is a `text[]` (default empty; no backfill): labels such as Pre-school, Basic, Junior, Senior, Arabic, Core, Elective. The application normalises them (lower-case, trimmed, runs of spaces made one, repeats dropped), at most 10 per subject, 30 characters each, letters, digits, spaces and dashes only; a CHECK in the migration bounds the count too. They are labels only: no access, no result effect. Only a superadmin edits them (create and PATCH of a catalogue entry, and the catalogue import); a branch's subject shows its entry's tags through `catalogId` (`GET /api/v1/academics/subjects` returns `tags`, and `?tag=` keeps those whose entry has it); `?tag=` also filters `GET /api/v1/subject-catalog` and `.../available`. On screen: a Tag filter on the catalogue and on a branch's Subjects tab, and "Choose all tagged X" in the superadmin's list and in "Add from catalogue", so everything with a tag is added in one click. The catalogue CSV takes an optional third column `Tags` (semicolons between tags, the same limits); a branch's subjects export gets a `Tags` column (the branch import does not take tags and says it ignored the column). Departments stay separate: they group staff and a subject is in one department.
- **Audit.** `SUBJECT_CATALOG_CREATED`, `SUBJECT_CATALOG_UPDATED`, `SUBJECT_CATALOG_RENAMED`, `SUBJECT_CATALOG_ARCHIVED`, `SUBJECT_CATALOG_RESTORED`, `SUBJECT_CATALOG_BULK_IMPORTED`, `SUBJECT_ADDED_FROM_CATALOG` (one entry per subject added or linked to a branch, with `catalogId`; a branch subject made the usual way writes the `SUBJECT_CREATED` it always wrote, with `catalogId` when it linked). A rename in every branch also writes `SUBJECT_UPDATED` for each branch subject renamed (`via: "catalogue"`).

## 4. Work breakdown

- [x] Design (this file)
- [x] Schema, migration and backfill (`20261120120000_subject_catalog`)
- [x] Rules module (names, limits, tags, the plan of an add and of a rename) and its unit tests
- [x] Service (`src/lib/academics/subject-catalog.ts`), routes, bulk kind
- [x] Superadmin screen (Academics > Subject catalogue), "Add from catalogue", tag filters, search destination
- [x] API and browser specs written (not run)
- [x] Docs: functions, components and pages references, route role guard, Octalve list, tasks

## 5. Verification

- [x] `tsc --noEmit`, lint, `prettier --check`
- [ ] Unit tests: see the PR for the run
- [ ] API and browser specs: WRITTEN, NOT RUN in this build (the shared test database was in use by another run)
- [x] Migration: applied to a throwaway database with every earlier migration; `prisma migrate diff` against the schema reports no difference; the backfill was run on seeded data (case variants merged, archived rows left alone, a code held by two names kept by one, run twice with the same result)

## 6. Notes

- The catalogue and the branch subjects are kept in step only where the superadmin says so (rename in every branch). A branch may still rename or recode its own subject; that does not touch the catalogue entry.
- The question bank has its own, unrelated tags (normalised text on questions, `normalizeLabel`); these are tags of catalogue subjects.
- Not built: a catalogue-wide merge of two entries; comparing marks across branches (reports can now use `catalogId` to do it).
