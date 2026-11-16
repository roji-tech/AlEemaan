# 0065: The link typed in "Add Material" was never saved, and a link that is not a web address was accepted

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's chapter C13, task 0033, recon run 21, step 110: after "Publish Material" the card had no "Open Resource" link; the card showed "In-app resource" instead)
- **Status:** Done
- **Priority:** Medium (a teacher who adds a study material with a link loses the link without being told, and the pupils never get it; the dialog also offers a type and a "Publish immediately" box that do nothing)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/lms-number-fields` (second commit, after task 0064) / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The "Add Learning Material" dialog (`src/components/lms/MaterialModal.tsx`) asks for a title, a subject, a class, a **type of resource**, a **link**, a summary, notes, and a **"Publish immediately (visible to students)"** box. It posts `materialType`, `url` and `published` to `POST /api/v1/lms/materials`.

The route's schema (`createMaterialSchema`) has none of the three: it takes `attachments: [{ title, url }]`, and Zod drops the unknown keys. The table `LearningMaterial` has no column for a type, a link or a published flag either; it has `attachments` (JSON). So:

- the link is thrown away: the card of the material reads `mat.url`, which does not exist, and always says "In-app resource";
- the type is thrown away: the card's type chip reads `mat.materialType`, which does not exist, and is an empty chip;
- **"Publish immediately" does nothing in either state**: the list the pupils see (`portal/service.ts`) shows every material of the branch that is not archived, ticked or not. A teacher who unticks it believes the material is hidden from pupils and it is not;
- the portal's material card has no link at all (its "Read Lesson" is a label), so even a material made through the API with `attachments` cannot be opened by a pupil.

**A second defect, found while reading the schema to fix the first:** `attachmentSchema` uses `z.string().url()`, which accepts any URL with a scheme: `javascript:alert(1)`, `data:text/html,...`, `ftp:`. The same schema takes a pupil's hand-in link (`submitAssignmentSchema`), and the Speed Grader puts it in an `href` in the teacher's browser. I did **not** test whether a click on such a link runs the script in the shipped build (React and the browser may stop it); the data layer should not hold it either way.

## 2. Decisions (mine; the maintainer may correct)

- **D1. No migration.** The link is saved the way the API already takes it, as a one-item `attachments` list named after the material (`[{ title: <material title>, url }]`). The card and the portal read `attachments`.
- **D2. The type and the "Publish immediately" box leave the dialog, and the type chip leaves the card.** Nothing stores them, and the box promises something that does not happen. Bringing them back needs two columns (a type enum and a published flag) and a migration, which is the maintainer's to run; it is listed under "For the maintainer" in the tracker.
- **D3. Only `http:` and `https:` links.** `attachmentSchema` refuses anything else with "The link must start with http:// or https://", and the screens that show a link (the Coursework card, the portal card, and the Speed Grader's attachments) show only links that pass the same check (rows written before the rule, or written by hand in the database, are skipped, not rendered). One helper, `src/lib/lms/attachments.ts`, holds both.
- **D4. One link text per attachment:** "Open <title> ↗" (so two cards on a page do not both say "Open Resource ↗", which a screen reader lists as two identical links).
- **D5. Not changed:** the assignment dialog (it keeps its own attachments handling: it has none), the hand-in dialog of the portal (it already builds `[{ title, url }]`), the material edit (there is none: materials can only be added and deleted, recorded for the maintainer).

## 3. Work breakdown

- [x] Design (this file).
- [x] The tests first, on the build that has not got the fix: `tests/api/lms-attachment-links.spec.ts` (the API refuses a link that is not http or https for a material, an assignment and a hand-in; accepts https) and `tests/e2e/lms-material-link.spec.ts` (the teacher adds a material with a link: the card opens it and the row holds it; a pupil sees the link in the portal).
- [x] The fix: `attachments.ts`, `validation.ts`, `MaterialModal.tsx`, `MaterialsList.tsx`, `PortalLmsTab.tsx`, `SpeedGraderModal.tsx`.
- [x] The new specs and the existing LMS and portal specs pass on the fixed build (desktop and phone).
- [x] Docs: `docs/functions/school-app.md` / `docs/components/school-app.md` rows (the component catalogue already said the link and type "are discarded"), the tracker. Open: the walkthrough's chapter C13 (branch `claude/walkthrough-c13`) still looks for "Open Resource ↗" and the type select; it is updated when that branch is rebased on this.

## 4. Build record and tests

Same setup as task 0064 (no lanes, fixed ports, database `aleemaan_test`, one run at a time, a production build before each run).

- **Build without the fix (the 0064 build), the new specs, desktop: 4 failed, 2 passed.** The 4 failures: a study material with `javascript:alert(document.cookie)` was **accepted** (expected 400, received 201); an assignment with a `javascript:` attachment was accepted (201); a hand-in (the pupil's link) with a `javascript:` attachment was accepted (201); and in the browser the card had no "Open ..." link after Publish Material (the element was not found: the card said "In-app resource"). The 2 passes are the setup and the test that an https and an http link are stored as the material's attachments, which the API already did.
- **Fixed build: 27 passed, 0 failed** (desktop and phone): `lms-attachment-links` (4 API tests), `lms-material-link` (1 end-to-end test, both projects: the card opens the link, the row holds `[{ title, url }]`, a material with no link says "In-app resource", the pupil sees the link in the portal), and the existing `lms` API spec, `portal-coursework` (API and end-to-end), `lms-a11y`, `lms-create-a11y` and `lms-number-fields`.
- **Gates:** `tsc --noEmit` exit 0; `eslint` on the changed files exit 0; the catalogue check clean. Prettier was checked on the new files (they are formatted); the three existing component files this task edits (`MaterialsList.tsx`, `SpeedGraderModal.tsx`, `PortalLmsTab.tsx`) were NOT Prettier-clean before it, so they were left as they were and only the lines of this task were edited.
- **Not run:** the whole suite; mutation passes (deferred to the end of PHASE 2). **Not tested:** whether a click on a `javascript:` link runs the script in the shipped build (D3 closes the way in either way).
