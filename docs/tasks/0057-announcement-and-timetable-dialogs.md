# 0057: "Save as Draft" published the announcement, "Edit" opened the wrong form, and editing a period overwrote it

- **Period / Focus:** 2026-11-12 (all three found by the product walkthrough's first full runs of C08 Announcements and C09 Timetable, task 0033)
- **Status:** Done
- **Priority:** High (an unfinished announcement went live to parents while the screen said it was a draft; a period edited only for its room came back with another subject, teacher and end time)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/announcement-draft-fix` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Three defects, one family: a dialog that is kept mounted and a form that reads its starting values once.

1. **"Save as Draft" published the announcement** (new or edited). `AnnouncementComposerModal`: the button did `setStatus(DRAFT); handleSave(e)` in one click. `setStatus` takes effect on the NEXT render, and `handleSave` read the `status` of the render the person was looking at (`PUBLISHED`), so the request carried it. The card said "Posted", not "Draft".
2. **"Edit" on an announcement opened the form blank** (or with whatever it held before), not with the announcement. The feed mounts the composer once (`isOpen={composerOpen}`), and the fields are `useState(initialAnnouncement?.title ?? "")`, which reads its prop on the first render only.
3. **Editing a period opened the form on the first arm, subject and teacher and 09:00, and "Update" overwrote the period with them.** Same mechanism in `SlotEditModal`, mounted once by `TimetableCanvas`. Changing only the room of a Mathematics period for another arm turned it into the first subject (English) with the first teacher. This one silently corrupts data.

## 2. Context

- Found by the walkthrough, with screenshots: C08 step 70 expected a "Draft" badge and found "Posted 11/12/2026"; C09 step 76 changed a room and the card came back as another subject with another teacher and 09:00 to 09:00.
- The component catalogue (`docs/components/school-app.md`) already named the first two as "two traps" of the composer, but nothing fixed or tested them. **No test mentioned "Save as Draft", and none edited an announcement or a period** (`grep` over `tests/`), so nothing could have caught any of the three.
- `BatchSlotsModal`, in the same canvas, already has `key={batchOpen ? "open" : "closed"}`: the codebase's own answer to this problem.
- The Publish button is not affected by (1): it is a submit button, its click sets `PUBLISHED`, and the form's own submit runs as a separate event after React has rendered. Pressing Enter in a field submits with the current `status` (a draft being edited stays a draft); that is kept as it is.

## 3. Decisions (mine; the maintainer may correct)

- **D1. (1) is fixed by passing the status explicitly**: `handleSave(event, nextStatus = status)` builds the payload from `nextStatus`; the draft button calls `handleSave(event, DRAFT)`. It still calls `setStatus(DRAFT)` so a failed save followed by Enter behaves as before. Publish and Enter are untouched.
- **D2. (2) and (3) are fixed by remounting on every opening**, with a `key` on the dialog in its parent: the feed uses `composerOpen ? (editingItem?.id ?? "new") : "closed"`, the canvas `modalOpen ? (editingSlot?.id ?? "new-<day>") : "closed"`. A remount reads the props again, which is what the form's `useState(initial...)` assumes; it is the pattern `BatchSlotsModal` already uses and the smallest change (no `useEffect` that copies props into state, which would also race with typing).
- **D3. Browser specs prove all three against the real database**, and the first run of each is against the UNFIXED build: `announcements-draft.spec.ts` (a new draft is stored as `DRAFT` and shows the badge; a published announcement saved as a draft becomes `DRAFT`, and a draft published becomes `PUBLISHED`, so the path that worked is kept; "Edit" opens with the announcement's own title, message and pin, and a new one afterwards opens blank) and `timetable-edit.spec.ts` (the period opens with its own arm, subject, teacher, times and room, which are all seeded to DIFFER from the form's defaults; changing only the room leaves every other stored field as it was).
- **D4. Not in this task:** whether a draft is hidden from its readers (the server's rule, tested in `announcements-rules.spec.ts`); the other dialogs of the app, which were NOT audited for the same pattern. All three defects here were found by the walkthrough, not by searching. The only other dialog I read, the grade-scale form in `GradingPanel`, renders its form only `{open && ...}` inside the shared `Dialog`, so it starts fresh; the rest are unchecked, and a sweep is listed in section 5.

## 4. Work breakdown

- [x] Design (this file).
- [x] The two specs first; run against the unfixed build and each failure read.
- [x] The fixes (D1, D2).
- [x] The specs and the existing announcement and timetable specs pass on the fixed build, desktop and phone.
- [x] Docs: the component catalogue rows, the tracker.

## 5. Not in this task

- A sweep of every other hand-built modal for the same pattern; the walkthrough's chapters, which now expect the fixed behaviour (they are rebased onto this in their own PR); mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (the AlEemaan test stack on :5434, one run at a time, a production build of this branch each time).

**Gate:** `tsc --noEmit` exit 0; ESLint on the three changed components and the two new specs, no findings; Prettier written and checked; `pnpm build` compiled before each run; `verify_catalogs` clean before the commit.

**Run 1, against the UNFIXED build (desktop only): 5 failed, 1 passed (setup).** Each failure was read and is the right one:
- *a new announcement saved as a draft*: the card read "Sports day Posted 11/12/2026 ... Edit", expected "Draft". The draft was published.
- *a published announcement saved as a draft, then a draft published*: the edit dialog stayed open with the alert "Please provide both a title and content body.", because "Edit" had opened it blank.
- *editing an announcement opens it with its own title*: the title field was `""`, expected "Welcome to New Term".
- *editing a period opens it with its own values*: the arm select held the FIRST arm's id, not the period's.
- *changing only the room of a period*: the stored period came back with day 1 (was 2), 08:00 (was 10:00), 09:00 (was 10:40) and another arm, subject and teacher. All overwritten by the form's defaults.

**Run 2, against the FIXED build: 49 passed, 0 failed, 0 skipped, 2.5 minutes.** unit 26, api 2, e2e-desktop 10, e2e-mobile 10, setup 1. By file: `announcements-draft.spec.ts` 6 and `timetable-edit.spec.ts` 4 (the three and two new tests, each on desktop and phone), and, unchanged, `announcements-audience.spec.ts` 2, `timetable-and-announcements-a11y.spec.ts` 4, `timetable-batch.spec.ts` 4, `tests/api/announcements.spec.ts` 1, `tests/api/timetable.spec.ts` 1, `announcements-rules.spec.ts` 13, `timetable-rules.spec.ts` 13.

**Not run:** the whole suite; mutation passes (deferred to the end of PHASE 2, the maintainer's call); the rest of the app's modals (not audited, section 3 D4); a real phone beyond the emulated one.

**Not mine to decide, noted:** how many people published an unfinished announcement by pressing "Save as Draft", and how many periods were overwritten by an edit, is not something the code can tell. If the school has been using these screens, an administrator may want to check its announcements for any that should have been drafts, and its timetable for periods whose subject or teacher changed after an edit.
