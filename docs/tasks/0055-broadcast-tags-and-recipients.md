# 0055: The Broadcast Composer's tags are filled in, a phone number is used only where one exists, and a message nobody can read is not recorded as sent

- **Period / Focus:** 2026-11-12 (found while checking the words of the info icons, task 0054; the maintainer's standing instruction is to fix what I find)
- **Status:** Built and tested; PR into `dev`
- **Priority:** High (a guardian receives the text `{{class_arm}}` as it stands)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/communication-tags-recipients` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

What a person types in the Broadcast Composer is what the recipient reads, and the screen only offers what can work. Three defects of one kind (the screen says one thing, the send does another), found by reading `src/lib/communication/service.ts` and `templates.ts`:

1. **Four of the five "Insert Personalization Tags" are never filled in.** The composer offers `{{student_name}}`, `{{class_arm}}`, `{{school_name}}`, `{{date}}` and `{{due_date}}`. `broadcastMessage` merges only `student_name` (and only for the guardian audience); the composer sends no `variables`; `interpolateTokens` leaves an unknown token as written. So a guardian receives `{{class_arm}}` as text.
2. **SMS and WhatsApp to the Staff or Students audience are addressed to an email address.** For those two audiences the address is `membership.user.email` whatever the channel is; only the guardian audience picks the phone number.
3. **The In-App channel records "Sent" for a message no screen shows.** `dispatcher.ts` answers success for `IN_APP` ("immediately ready in the user's notification feed"), but no screen, API or page in the app reads a dispatch back to a person (`notificationDispatch` is used only inside `service.ts`). It is the same kind of lie as the missing provider key of task 0053. Announcements, which this app already has, ARE the in-app feed.

## 2. Context

- Octalve Edu (read-only check on 2026-11-12): defect 2 does not apply there (its recipient list picks email or phone per channel and audience); defect 1 applies to all four of its tags (its Broadcast body goes into the queue raw; nothing calls `interpolateTokens`); defect 3 is for its own task. Its own task and PR follow this one.
- A tip is not shipped over a defect (task 0054, D13): the two info icons `communication.channel` and `communication.tags` were held back for this task and are added here, now that they are true.
- Data available: `SchoolSettings.name` (the school's name, one row, `getSchoolSettings()`); a pupil's current class is the `StudentEnrollment` of the ACTIVE session (`className` and `arm` strings, as the Students screen shows them); a staff member's phone is `StaffRecord.phone` (linked by `userId`); a pupil with a login has **no phone number anywhere** (`StudentRecord` has only `guardianPhone`); the school's own time zone is `resolveSchoolTimeZone()` (`SCHOOL_TIME_ZONE`, UTC when unset).

## 3. Decisions (mine; the maintainer may correct)

- **D1. One pure module says which tags exist and for whom** (`src/lib/communication/tags.ts`, no database): guardians can use `student_name`, `class_arm`, `school_name`, `date`; staff and pupils can use `school_name` and `date`. The composer and the server read the same table, so a chip cannot be offered that the server will not fill.
- **D2. The server fills them.** `school_name` is `SchoolSettings.name`; `date` is today's date in the school's time zone, written "12 November 2026"; `student_name` is the pupil's full name (as today); `class_arm` is the class and arm of the pupil's enrolment in the active session ("JSS 1 A"), and "their class" for a pupil with no enrolment in an active session. The four known tags always win over a same-named entry in the API's optional `variables` (no spoofing of `student_name`); any other key in `variables` still works as before.
- **D3. A tag that cannot be filled is refused, not sent.** The input check (the same Zod schema every caller passes through, so the route and the service agree) refuses a body or subject that holds a `{{tag}}` which is neither one of the audience's tags nor a key of `variables`: 400 `VALIDATION`, "These tags cannot be filled for guardians: {{due_date}}. Remove them or choose another audience." Nothing is created. `{{due_date}}` has no source in a free-text broadcast, so the chip is removed.
- **D4. Staff: SMS and WhatsApp use the staff record's phone** (the live `StaffRecord` of that user in that branch). A staff member with no phone, or with no staff record, is left out for those channels; email still uses the account's email. (The count in the answer is the number sent, as before.)
- **D5. Pupils (the Students audience, who have a login): SMS and WhatsApp are refused**: 400, "Pupils have no phone number on file. Use Email, or send to guardians." The composer disables those two channels when the audience is Students and says why. (A phone number on a pupil's login would need a data-model change: not here.)
- **D6. In-App is refused** (defect 3): 400, "In-App messages are sent from Announcements: nothing here shows them to the person." The chip leaves the composer; the subject field is for Email only. Old In-App rows stay readable and their Retry still behaves as before. **This is a decision the maintainer may reverse**: the alternative is to build a notification feed (a bell and a page listing the user's In-App dispatches), which is a feature, not a fix.
- **D7. The info icons.** `communication.channel` (beside the "Notification Channel" label) and `communication.tags` (beside "Insert Personalization Tags") are added, in the words of D1 to D5, each checked against the code.
- **D8. Not in this task.** Siblings who share a guardian's email or phone still receive ONE message (the recipient list is de-duplicated by address, first child's name wins): said here, not changed. The Live Preview still shows the tags unfilled (it has no recipient). Mutation passes are deferred to the end of PHASE 2 (the maintainer's call).

## 4. Work breakdown

- [x] Design (this file).
- [x] `tags.ts` (the table, `findUnfillableTags`, `TAG_LABELS`) and the three rules in `BroadcastMessageSchema` (D3, D5, D6).
- [x] `broadcastMessage`: fill the tags (D2); staff phone (D4); the active-session class of each pupil.
- [x] Composer: chips by audience, no Due Date, no In-App, Students disables SMS and WhatsApp; the two info icons (D7).
- [x] Tests: unit (tags, the schema rules), API (filled tags in the stored body, staff phone, left out without one, the three refusals create nothing), browser (chips per audience, no In-App, SMS disabled for Students, the new icons in `info-tips.spec.ts`).
- [x] Docs: tracker, the function and component catalogues, open items (HANDOVER has no Communication section to change).

## 5. Not in this task

- Octalve Edu (its own task and PR: tags only, plus the In-App decision).
- Real delivery through Resend or Termii (no key exists to try it with).
- A notification feed, a phone number for pupils' logins, a "skipped" count for people with no address.

## 6. Build record and tests

**Static gates (on `claude/communication-tags-recipients`, in the order tsc, lint, build, tests):** `tsc --noEmit` clean; eslint 0 errors and 0 warnings on every changed file; Prettier `--check` clean; `pnpm build` succeeded (four times: each change to the code was rebuilt before the tests that follow it); catalogue check 737 rows = 737 tracked files.

**Tests (one lane, AlEemaan's fixed ports): the final run passed 154, failed 0, skipped 4, in 5.2 minutes.** The 4 skipped are the device-only tests of `info-tips.spec.ts` (one phone test on the desktop project, three mouse and keyboard tests on the phone project). Ran on the unit, api, desktop and phone projects: the new `communication-tags.spec.ts` (13 unit tests), the new `communication-tags-recipients.spec.ts` (API, 13 tests: tags filled for guardians including a pupil with no class and one enrolled only in a closed session, the subject filled, a caller's `variables` cannot override the four known tags while others still work, staff and pupil audiences, SMS and WhatsApp to staff use the staff record's phone and leave out staff with no phone, no record or an archived record, Email still uses the account's email, guardians unchanged, and six refusals that each assert the exact 400 message and that NO dispatch row and no audit entry was created), the new `communication-composer-tags.spec.ts` (browser, 6 tests on each of desktop and phone: chips per audience, no Due Date, no In-App, pupils switch SMS and WhatsApp off with the reason and move a selected phone channel to Email, subject only for Email, a refused tag is shown with the text kept, axe in dark and light), the changed `communication.spec.ts` (the In-App case now asserts the refusal), the two new icons in `info-tips.spec.ts`, and the existing `communication-fail-closed`, `communication-gateways`, `communication-templates`, `info-tips`, `route-role-guard`, `branch-gate-both-sources`, `cross-branch-isolation`, `communication-broadcast-result`, `communication-a11y`, `academics-structure` and `students-screen`, all unchanged and passing.

**What the first run found (134 passed, 2 failed, both the new `communication.tags` icon in `info-tips.spec.ts`), and what was done.** Each was read on its own.

1. *Desktop: the neighbouring chip "moved" 244 px.* It was below the fold; the hover scrolled the page to it, and the spec compared window coordinates. A flaw in my spec, not a layout shift: the spec now scrolls the icon into view before it measures.
2. *Phone: the popover's bottom edge was 33 px below the screen. A real defect in `InfoTip` (task 0054's component), found by this icon because it sits low on a long page.* A diagnostic showed the placement was right when it was made (282 px of room below, a 96 px popover) and that about 10 ms later Chrome scrolled the page UP by 227 px (the document's height never changed, and tapping an ordinary button on the same page does not scroll). Three first-pass styles were tried on one build: parked at the window's corner (the 0054 fix) and beside the icon both scroll the page; parked far outside the window (`position: fixed; left: -9999px; top: -9999px`) does not. It is now measured there. **The cause inside Chrome is not known**: found by bisecting, not explained. The browser spec now asserts that opening a tip does not scroll the page, read after two animation frames. The first run is the proof for it: that check failed before the change and passes after.

**Regression proof for the input check (old `validation.ts` put back, the new unit spec run): 4 failed, 9 passed.** The four failures are the In-App refusal, the pupil SMS and WhatsApp refusal, the unfillable-tag refusal and the order of the rules; the nine that pass are the pure tag module and a normal message. Not run on the old code: the API and browser tests of the new behaviour (they need the old build); they assert the new fills and refusals where the old code sent the text `{{class_arm}}` and addressed a staff SMS to an email.

**Not run, and not claimed.** The whole suite; mutation passes (deferred to the end of PHASE 2, the maintainer's call); any send through the real Resend or Termii (no key exists); the Octalve side (its own task); a real phone or screen reader; the In-App decision (D6) is mine and reversible, and has not been put to the maintainer.
