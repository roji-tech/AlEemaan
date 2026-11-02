# 0041: The Forms screens (the Forms module had an API and no screen)

- **Period / Focus:** requested 2026-11-02 ("quickly build those screens", the maintainer's answer to decision D1 of task 0033)
- **Status:** In progress (plan written 2026-11-02; no screen built yet)
- **Priority:** High (the walkthrough, task 0033, waits for it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR per slice, each off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Every route of the Forms module has a screen a person can reach by clicking, so that a teacher can set and mark a practice set, a questionnaire and paper work, a pupil can take them, anyone with the link can answer a public questionnaire, and a reviewer can handle reports on questions. Nothing about who may see what changes: the APIs already decide that (task 0032, slices 3 to 10, and 4l to 4q); the screens only show it.

## 2. Context & Related Docs
- The APIs and their rules: `docs/tasks/0032-forms-and-question-bank.md` (4d to 4q); the design: `docs/development-history/forms-and-question-bank-design.md` sections 8 to 10 (flows and screens).
- Why now: the scan of task 0033's P0 found 54 of 184 routes with no trace of a screen; about 35 are the Forms module and the pupil's practice, 6 are question-bank reports, printing and offer-back. The maintainer chose to build the screens and then walk the product, not to walk first (D1).
- Conventions to follow: a server `page.tsx` (session, `PageHeader`, display-only role checks), a client sections component with the ARIA tabs pattern (see `QuestionBankSections.tsx`), panels that call the API with `getJson`/`sendJson` (`components/auth/postJson.ts`), `Dialog`, `TextField`, `SelectField`, `Alert`, theme tokens only, both themes, phone width, axe clean.

## 3. Rules every screen keeps (the maintainer's, made explicit)
1. **The answer key and the explanation are shown only where the API returns them** (a manager of the form, or a pupil after the rules let them see it). A screen never fetches a key to hide it.
2. **An anonymous questionnaire shows no respondent**, not even in a count small enough to point at someone: the summaries show what the API returns, with its small-count hiding, and say so.
3. **Display only**: hiding a button is a courtesy, the API refuses. Every screen has a refusal sentence for when the API says 403/404 (never a status code, never an empty page).
4. **No pasted markup**: question and answer text is rendered as text.
5. **A pupil's time limit is shown and counted down**; the server decides (60 s allowance); a refused submit says what happened and keeps the pupil's answers on screen.
6. **Absent is not zero**: a result that does not exist yet is not shown as 0.

## 4. Work Breakdown (one slice = one PR; each ticks rows of the walkthrough's coverage matrix, which the structure gate demands for every new page)

### Slice F1: Staff forms: list, create, publish, close (`/forms`, nav "Forms" for administrators and teachers)
- [ ] Sections: Practice sets, Questionnaires, Paper work (list with status, dates, counts; New; Publish; Close), For you (questionnaires addressed to the signed-in staff member, answered in place), Marking (the marking queue across forms)
- [ ] The builder per kind: practice set (title, instructions, class groups, window, time limit, questions: written here or added from the question bank, which copies them), questionnaire (members or public link, anonymous or not, roles, classes, window, questions of the kinds the API allows), paper work (title, classes, window, time limit)
- [ ] The public link of a public questionnaire is shown with a copy button and the weakness of a public form is said in words
### Slice F2: A form's page (`/forms/[id]`)
- [ ] Overview with edit, publish, close, print (server PDF); questions (key only for managers)
- [ ] Results: practice-set responses with scores; questionnaire summaries; the analytics route
- [ ] Marking: the per-form queue, one response at a time, a score and feedback per answer, finish the attempt
- [ ] Paper work roll call: the roster, handed in / late / pending with a note, batch save, sync the roster, the pupils who asked for marking
### Slice F3: The portal: forms (a "Forms" tab in `/portal`)
- [ ] Practice sets open now, the attempt with its countdown, the submit, the result with what the rules reveal, print
- [ ] Questionnaires addressed to the pupil or guardian, answered once
- [ ] Paper work: due date and "Request marking"
### Slice F4: The portal: question practice (a "Practice" tab)
- [ ] Setup (subject, topic, size, feedback timing, within the daily cap and the school's switches), the session, the answers, finish, the history with archive, a report on a question just practised, print
### Slice F5: The public questionnaire page (`/q/[token]`, signed out)
- [ ] Open by link, answer, submit; a closed, unknown or malformed link says so in a sentence; nothing about the school beyond the form
### Slice F6: Question bank: reports, printing, offer-back
- [ ] "Report a problem" on a question (staff), the Reports section for reviewers (the queue, the outcome, the reason the reporter sees)
- [ ] Print a set of questions and the print log; offer a changed copy back to the bank
### Slice F7: Small things the walkthrough decisions asked for
- [ ] A link to `/video-guide` from the app; the `/video-guide` page reads its files from a configurable address (the video is hosted outside git)
- [ ] `distDir` from `NEXT_DIST_DIR` in `next.config.ts` (a production build in its own folder for the walkthrough; unchanged when unset)

## 5. Definition of done (every slice)
Tests first and seen failing on a build without the screen; e2e on desktop and phone for each flow including the refusal; axe in both themes; tsc, eslint, build, then tests; the function and component catalogs (`verify_catalogs.py`) and the page catalog updated; this file, HANDOVER and the progress record updated; matrix rows added for every new page (`coverage.mjs --structure` passes); PR into `dev` with `base.ref` verified; Vercel green before the guarded merge.

## 6. Where it stands (2026-11-02)
Plan only. The order is F1, F2, F3, F4, F5, F6, F7; F7 is small and may go first.
