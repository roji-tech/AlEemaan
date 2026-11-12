# 0061: After a sign-out the portal kept the last person's section, and some of their data, in its state

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's chapter C12, task 0033: a guardian signed in straight after a pupil and landed on the pupil's Practice section instead of the Overview)
- **Status:** Done
- **Priority:** Medium (a shared computer at a school office or a family tablet is the normal way a portal is used; nothing is stored wrongly, and the next person's own data is fetched again, but they start somewhere that is not the Overview and the page still holds the last person's coursework in memory)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/portal-signout-reset` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`src/app/portal/page.tsx` keeps the portal's whole state in one component. `handleSignOut` clears who is signed in, the pupils, the access, the chosen pupil, the overview, the results and the invoices, and nothing else. Signing in again on the same page (no reload, which is what happens when two people use one screen in turn) therefore starts with what the last person left:

- `activeTab` stays on the section they had open, so the next person lands on, for example, Practice or Coursework and not on the Overview. (Found: step 100 of the walkthrough, a guardian after a pupil.)
- `lmsData` (the coursework: assignments, materials, quizzes), `resultsBlocked`, `resultsBalance` and `progress` are not cleared either. They are overwritten by the next fetch, and the "Loading" state hides them meanwhile, so they are not shown today; but a sign-out is the one moment a screen must forget a person, and one change to the loading branch would show them.

## 2. Context

- The sign-in card calls `handleLoginSuccess`, which sets the new pupils and access and `tabLoading`, but not the section; `shownTab` is `activeTab` if the new access allows it, otherwise the first allowed section. So a section that BOTH people may open (Practice for a pupil and for a guardian) carries over, and one that the new person may not open (Forms, for a guardian after a pupil) falls back to the first section, which is why only some sign-in pairs showed it.
- Octalve has no portal, so nothing to change there.

## 3. Decisions (mine; the maintainer may correct)

- **D1. A sign-out puts the portal back to its first state:** `activeTab` to the Overview, the coursework to its empty value, the results flags and balance to their initial values, the progress to none. Nothing else about the sign-out changes (the session cookie is deleted by the same request as before).
- **D2. Not changed:** a pupil's or guardian's browser reload (the session cookie is still read once at mount, as before); what the next person is allowed to see (the server decides it again for every request).

## 4. Work breakdown

- [x] Design (this file).
- [x] The test first: `portal-access.spec.ts`, "after a sign-out the next person starts on the Overview ... and none of the last one's coursework is there"; run on the unfixed build and the failure read.
- [x] The fix in `handleSignOut`.
- [x] The test and the existing portal specs pass on the fixed build, on a desktop and a phone.
- [x] Docs: the tracker, `docs/pages/portal.md`.

## 5. Not in this task

- Mutation passes (deferred to the end of PHASE 2, the maintainer's call); the other portal screens' own state.

## 6. Build record and tests

From the logs of these runs (the AlEemaan test lane: ports 3200 to 3204 and 3543, database `aleemaan_test`, a production build of each state), not from memory.

- **Gates on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the two changed files exit 0; `next build` exit 0; `prettier --check` clean for the new spec, the task file and the two docs. **`src/app/portal/page.tsx` does not pass `prettier --check`, and did not before this change** (the version on `dev` fails it: long single-line props and a long type are where Prettier would wrap). I did not reformat the whole file inside a bug fix; my change keeps the file's own style.
- **The new test on the UNFIXED build** (desktop): 7 passed, **1 failed**: "after a sign-out the next person starts on the Overview ...", `expect(tab "Overview").toHaveAttribute("aria-selected", "true")` received `"false"`: the guardian had left the Coursework section open, signed out, a pupil signed in on the same screen, and the portal landed on Coursework.
- **On the fixed build, the five portal specs** (`portal-access`, `portal-coursework`, `portal-forms`, `portal-practice`, `portal-a11y`), desktop and phone: **75 passed, 0 failed** (9.8 minutes), including the new test on both.
- **Found in the walkthrough, not in a spec:** the first run of chapter C12 (task 0033) showed the same thing with a pupil then a guardian, which is how it was found; the chapter now asserts that the guardian starts on the Overview.
- **Not run, and not claimed:** the whole suite; the other e2e specs; mutation passes (deferred to the end of PHASE 2, the maintainer's call). The "coursework is not held in memory" half of the fix (and `resultsBlocked`, `resultsBalance`, `progress`) is not separately testable from the browser, because the loading state hides it today; the test proves the section and that none of the last person's coursework is on screen, nothing more.
