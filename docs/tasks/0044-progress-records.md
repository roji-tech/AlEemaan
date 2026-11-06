# 0044: Progress records (logbooks): a running log a teacher keeps for each person in a program

- **Period / Focus:** requested 2026-11-03 by the maintainer; design written the same day, nothing built yet
- **Status:** Design (plan written 2026-11-03; no slice started; waits for task 0043, slice P1 and P2)
- **Priority:** High
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR per slice, each off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A paper booklet the school uses today (the Daarul-Hadeeth "Al-Mu'in", for recording a student's daily Quran memorisation) shows what is wanted: not a term report card but a **running log**, one row per day, kept by a teacher for each student and signed off. This task builds that as a general thing, so the same tool serves any other program: reading levels, times tables, music pieces, skills sign-off, early-years observations, or another school's memorisation log.

The booklet's pages, as read from the photographs: the cover (name, circle, date); a student data page (name, age, neighbourhood, phone, class, guardian's name and number, riwayah, school, group, teacher, and a list of the student's recurring mistakes, with a photo); a "new text" table and a "daily revision" table, each with the columns day, date, surah, from, to, notes, rating and signature, with the rows Saturday to Wednesday and a weekly-revision row, two weeks to a page; and a follow-up block (date, surah, notes, an overall grade, signature).

## 2. The maintainer's decisions (2026-11-03)
- **Name:** "Progress records" by default. The super admin or admin can switch the display name to **"Logbook"**. Two presets, each with an Arabic form; no free text. The super admin sets the school default and may lock it; a branch admin may change it for their branch unless it is locked.
- **Who sees it:** the **student view** and the **guardian view** are separate switches, both **on** by default. The guardian sees a **summary** by default; a setting switches that to full entries. The super admin's setting is a ceiling that a branch admin can narrow and never widen (the pattern of task 0040). Enforced by the API, not only by hiding a tab.
- **Languages:** English, Arabic, or both side by side, chosen by each viewer (parents, students, instructors). The default is a setting: school, then branch, then program. Labels, headings, day names, surah names and ratings are stored in both languages; teachers' notes appear once, as written, unless a verified translation exists (4.7).
- **Dates:** Hijri and Gregorian both show. **Digits** in Arabic mode: Western (1 2 3) by default, with a setting for Arabic-Indic (١ ٢ ٣).
- **Entry:** teachers type on a phone or tablet, or copy from the paper booklet: a quick-add row and a week grid that mirrors the booklet, and a printable booklet-style view.
- **Standard remarks** (stored in both languages, shown in the viewer's language) plus free text.
- **Translation while typing:** wanted, with the teacher viewing and verifying the translation (4.7).
- **Verification:** the super admin or admin can require that entries are **verified before they are published** (4.5).
- **Who may write:** an admin setting chooses the group's teachers, assigned staff only, or both. Someone editing an entry locks it for others; a manual Editing / Viewing switch; the lock expires after inactivity; after a manual switch the lock is released after a delay (30 seconds by default); both set by the super admin or admin (4.6).
- **Attendance** is part of programs (task 0043, slice P3); a progress record may use it (a day with an entry and no attendance is flagged, not blocked).

## 3. What it builds on
Programs, participants, groups and program staff (task 0043: P2 people, section 9; P3 staff and attendance, section 10), and the published results of a program's assessments (task 0043, 8.11, slice P3b), which a participant's record page lists read only without copying the marks; the settings ceiling (`SettingValue`, GLOBAL and BRANCH); the portal's access switches and the way a guardian is linked (`GuardianLinkToken`, `Role.PARENT`); the verify-by-link page for certificates; the Forms module's field kinds (single choice, multiple choice, short and long text, rating) and its `AnswerFields` components as the vocabulary for a template's fields, kept separate from the questionnaire code because a log is rows by date, not one response.

## 4. Design

### 4.1 Entities (working names)
| Entity | What it holds |
| --- | --- |
| `ProgressTemplate` | `name` (English and Arabic), `version`, `schema` (JSON, validated): the **profile fields**, the **tracks**, the rating scale, the week (which days count, and the weekly row), the direction. Published templates are immutable; a change makes a new version and existing records keep theirs |
| Track | `table` (dated rows with typed columns) or `notes` (dated free notes, such as the student's recurring mistakes). A table track says whether it is one row per day |
| Column | `key`, label in English and Arabic, `type`: `date`, `text`, `choice` (from a reference list or a fixed list), `range` (a from and a to inside a reference list, such as surah and ayah), `rating`, `note`, `remark` (standard remarks) |
| Reference list | a bilingual list shipped in code, not in the database: for the Quran pack, the 114 surahs with their names in Arabic and English and their ayah counts, so `from` and `to` are checked (ayah 1 to the count) and totals can be worked out. **Only references are stored (surah and ayah numbers), never the text of the Quran.** |
| `ProgressRecord` | one per `ProgramParticipant` (the person's one place in the program, task 0043 section 9) and template version: the profile values (the data the system already has is shown live from the person's record, not copied) |
| `ProgressEntry` | `recordId`, `trackKey`, `entryDate` (Gregorian), `values` (JSON, validated against the column types), `status` (`DRAFT`, `SUBMITTED`, `VERIFIED`), `version` (an integer for the save check), `createdBy`, `lastEditedBy`, `verifiedBy`, `verifiedAt`, and `publishedValues` (the last verified copy, what families see) |
| `ProgressEntryRevision` | every save, append-only: who, when, what changed |
| `ProgressLock` | `entryId` (unique), holder, `heartbeatAt`, `expiresAt`, `releaseAt` |
| `ProgressRemark` | a standard remark: text in English and Arabic, template, order |

### 4.2 Pages
- **Staff:** "Progress records" in the sidebar's Classroom section (renamed "Logbooks" when the setting says so). A program's page has a Progress records tab: the list of people with their latest entry; a person's record with the profile, then the tracks. Two ways to enter: **quick add** (one row, with the date and teacher filled in and each new row starting where the last one ended: the next "from" is the last "to") and the **week grid** that mirrors the booklet's page, for copying from paper.
- **Family:** a "Progress" tab in the portal for a student or a guardian (task 0040's pattern), read-only, showing the summary or the full entries as the settings say, with a "seen" button for a guardian in place of the signature.
- **Print:** a booklet-style PDF (right to left in Arabic, the weekdays of the template, the two weeks to a page).

### 4.3 The summary a guardian sees by default
Computed from **verified** entries only, per week and month: days recorded, the range covered (the first "from" to the last "to" in the reference list), the amount in ayat, the revision done, the spread of ratings, and the latest overall follow-up grade and note. It shows no day-by-day notes and not the list of recurring mistakes.

### 4.4 Settings (all with the ceiling rule of task 0043, 4.5)
`progress.displayName` (`PROGRESS_RECORD` or `LOGBOOK`, lockable), `progress.studentView` (on), `progress.guardianView` (on), `progress.guardianDetail` (`SUMMARY` or `FULL`), `progress.requireVerification`, `progress.writers` (`TEACHERS`, `ASSIGNED`, `BOTH`), `progress.lockInactivitySeconds` (300), `progress.lockReleaseDelaySeconds` (30), `progress.language` (`EN`, `AR`, `BOTH`), `progress.digits` (`LATIN`, `ARABIC_INDIC`), `progress.hijriAdjustDays` (-1, 0 or +1, school-wide: the Hijri date shown is calculated and local moon sighting can differ by a day), `progress.translation.enabled` (off). The effective value for a person is the strictest of school, branch and program; a screen says when a higher level decides it.

### 4.5 Verification (when `requireVerification` is on)
- An entry is **Draft** while it is being written, **Submitted** when the writer says it is done, **Verified** when someone else with the right confirms it. **Families see only the verified copy** (`publishedValues`).
- **Who verifies:** the school and branch admins and the program's supervisors; **not the person who wrote it** (a four-eyes rule that is on and can be switched off by the super admin only).
- A **"verify the week"** button verifies a whole week at once; a verifier can **return** an entry with a comment.
- **Editing a verified entry** returns it to Submitted, and **families keep seeing the last verified copy** until the new one is verified, so a correction never makes something vanish.
- When verification is off, a saved entry is published at once.

### 4.6 Writing, locks and clashes
- **Who may write** follows `progress.writers`: the program's teachers for the group, the staff assigned as recorders, or both. A suspended or ended place cannot be written to (task 0043, 4.3).
- **Lock per entry** (not per person's whole record, so two teachers can work on different days and students): opening an entry to edit takes a lock held by that person, shown to others as "Zainab is editing, view only". The page sends a heartbeat while it is open and active; the lock expires after `lockInactivitySeconds` without one.
- **The manual switch:** the person can press **Viewing** at any time. With unsaved changes the page asks to save or discard first. The lock is then released after `lockReleaseDelaySeconds` (so a mis-click or a slow save does not hand the row away at once); an admin can release it immediately.
- **The version check is the safety net**: a save carries the version it was opened at, and a stale one is refused with "changed by Zainab at 10:42", showing both versions. This is what protects a phone that lost its connection while someone else edited.
- The first version needs a connection; saving while offline is not built (said on the screen).
- For a track that is one row per day, adding a second row for the same day opens the existing one.

### 4.7 Translation while typing (an opt-in helper, the last slice)
- Off by default; the super admin switches it on. The provider sits behind a small provider-neutral interface and its credentials are the maintainer's to configure, like the image store; nothing is sent until both are done.
- It sends **the text of the note only**, never the person's name or any identifier, but free text can contain a first name, so the screen says that text is sent to the translation service.
- The translation appears as a **draft after the teacher pauses typing** (about 1.5 seconds; not on every key), with a per-school rate limit. The teacher **edits and confirms** it; the entry stores the original (with its language), the translation, and who confirmed it.
- **Families see only a confirmed translation.** An unconfirmed draft is never shown to them.

### 4.8 Languages, dates and digits
- Direction and language are set per viewer for this module (the rest of the app stays English); "both" puts Arabic and English side by side on a wide screen (headings, day names, reference values, ratings, remarks) and stacks them on a phone.
- Gregorian is stored; Hijri is calculated (Umm al-Qura) and shown beside it with the school's adjustment.
- The module's strings live in one message catalogue per language, built so the rest of the app can use it later; the Arabic wording comes from the booklet's own terms and is reviewed by an Arabic reader before release.

### 4.9 Safety rules
1. Families see only what the settings allow and only verified content when verification is on; the API refuses the rest, not only the screen.
2. A person sees only their own record (a student) or their linked children's (a guardian).
3. Every save is checked against the template's types on the server; nothing the client sends is trusted for status, version, author or visibility.
4. Notes are rendered as text, never as markup.
5. Every change is in the revision history with who and when.

## 5. Work breakdown (each slice: update this note, build, tests, docs, PR into `dev`)
- [x] **R1 Templates and entries:** the template schema and validation, the Quran pack (the surah list and the booklet's template with its Arabic wording), records, entries, quick add and the week grid, the staff pages, both themes and phone, tests, matrix rows
- [x] **R2 Verification and locks:** the settings, the Draft, Submitted and Verified states, verify the week, return with a comment, the lock with heartbeat and the manual switch, the version check
- [x] **R3 Family views:** the portal tab for a student and a guardian, the summary, the "seen" button, the switches and the ceiling
- [ ] **R4 Languages:** Arabic, English and both side by side, Hijri and Gregorian, digits, the print view
- [ ] **R5 Translation helper:** the interface, the draft, confirm, limits, the setting
- [ ] Octalve Edu parity (its own task, after AlEemaan's slices land)

## 6. Not in the first slices
Offline entry, voice recording of recitation, uploading photos of the paper pages, a student's own self-assessment, charts over time.

## 7. Open items (defaults are used unless the maintainer changes them)
- The Arabic wording of the two display names and of every label (reviewed before release).
- The translation provider (the maintainer's choice and credentials).
- Whether the "seen" acknowledgement should be required for a guardian before the next entry (default: no, it is only a record).

## 8. Batch C1 (slices R1, R2 and R3): decisions written 2026-11-06 before any code
Built together on one branch with one full run, as the 0043 batches were. R4 (Arabic, Hijri, digits, print) and R5 (translation) follow in their own batch. Where the design above left a choice, this is what is built (the safest option each time; any can be changed):

**8.1 Templates.** Templates ship in code as presets, not as a designer: `QURAN_BOOKLET` (the Al-Mu'in booklet: a profile, the tracks "New text" and "Daily revision" with day, surah from and to with ayah numbers, notes and a rating, a "Follow-up" track with an overall grade, and the notes track "Recurring mistakes") and `SIMPLE_LOG` (a date, a topic, notes, a rating). A program turns progress records on by choosing a preset; its schema is copied into an immutable `ProgressTemplate` row (version 1; a trigger refuses UPDATE and DELETE). The preset cannot be changed once any record exists (409). Not built: a template designer, a second version.

**8.2 Reference list.** The 114 surahs with their names in Arabic and English and their ayah counts are shipped in code (`progress-reference.ts`; a unit test checks 114 surahs and 6,236 ayat in all). A "range" column stores `{ fromSurah, fromAyah, toSurah, toAyah }` (numbers only, never text) and is checked: ayah 1 to the surah's count, and the end not before the start. Amount in ayat is worked out from the counts.

**8.3 Records and profile.** One `ProgressRecord` per place (`ProgramParticipant`), made when the first entry or profile is saved, or by "Start the record". The profile holds only what the system does not already know (age band, neighbourhood, riwayah, recurring-mistake notes are entries); the name, class, guardian and phone are shown live from the person's own record and never copied.

**8.4 Who may do what.**
| Person | Reads | Writes entries | Verifies |
| --- | --- | --- | --- |
| Super admin, program admin | every record | yes (a correction after verification returns it to Submitted) | yes, but not their own entry while four-eyes is on |
| Supervisor | every record | no | yes, not their own |
| Teacher | records of people in their assigned groups | in those groups, when `writers` is TEACHERS or BOTH | no |
| Recorder | records of people in their assigned groups | in those groups, when `writers` is ASSIGNED or BOTH | no |
| Branch administrator | records of people through their branch | no | no |
| Pupil, guardian | through the portal only (R3) | no | no |
A suspended, expelled, withdrawn, ended or completed place cannot be written to (a completed place stays readable). A person with no reach sees nothing (404). Every write goes through the program guard (`change`), so it holds the program's row lock, honours the school's switch, and is refused when the program is archived or completed.

**8.5 Entries.** A track says whether it is one row per day. A second row for the same day is refused with 409 `EXISTS` carrying the existing entry's id, so the screen opens it. The date may not be in the future and may not be before the place began. Values are checked on the server against the column types; unknown keys are refused; text is trimmed, at most 500 characters, and shown as text. `version` counts saves; a save carries the version it was opened at and a stale one is refused 409 `CHANGED` naming who changed it and when. Every create and change appends a `ProgressEntryRevision` (append-only by trigger). Entries are never deleted; a wrong entry is corrected, and its earlier values stay in the revisions. The week grid saves up to 30 rows all or nothing.

**8.6 Verification (R2).** Off by default per program (`requireVerification`). When off, a saved entry is VERIFIED and published at once. When on: DRAFT (being written), SUBMITTED (the writer says it is done), VERIFIED (someone else confirms it; `publishedValues` is the copy families see). Four-eyes (the verifier is not the last editor) is on by default and only a super admin can switch it off. "Verify the week" verifies every SUBMITTED entry of a person in a week in one step, all or nothing. A verifier can return an entry with a comment (back to DRAFT, comment kept). Editing a VERIFIED entry sets it to SUBMITTED; families keep the last verified copy.

**8.7 Locks (R2).** One lock per entry (unique). Taking it is part of opening an entry to edit; the holder's heartbeat extends it by `lockInactivitySeconds` (default 300, allowed 60 to 3600); another person sees the holder's name and "view only". "Viewing" releases it after `lockReleaseDelaySeconds` (default 30, allowed 0 to 300); an administrator can release at once. A write by anyone but the holder while an unexpired lock exists is refused 409 `LOCKED`. The version check stays the safety net. Locks are advisory against a stale page and never replace it.

**8.8 Settings.** Ceiling switches (school, branch, then the program's own flag) for `programs.progress.enabled` (the program flag defaults off), `programs.progress.studentView` and `programs.progress.guardianView` (the program flags default on, as decided on 2026-11-03). Program columns: `progressTemplate`, `progressWriters`, `progressRequireVerification`, `progressFourEyes`, `progressLockInactivity`, `progressLockRelease`, `progressGuardianDetail` (`SUMMARY` by default, or `FULL`). The effective value is the strictest of school, branch and program. A guardian's detail can be narrowed by the program and never widened above what the program set.

**8.9 Family views (R3).** Through the portal, with the same gate as the other portal routes (`portalGate`, capability `overview`), then the progress switches. Only a pupil who has a place that is a STUDENT participant is covered; people typed in (adults, children, guardians) have no portal sign-in, so their families cannot see anything yet (said on the staff screen). A pupil sees their own verified entries in full (when `studentView` is on); a guardian sees the summary of 4.3 or the full entries as the program's `progressGuardianDetail` says. The summary is computed from published (verified) values only and shows no day-by-day notes and no recurring mistakes. A suspended or expelled pupil's portal access is already narrowed by task 0045 and that gate is not bypassed. "Seen" is a record of a guardian (or pupil) pressing a button for a week; it is stored and shown to staff, and is not required for anything.

**8.10 Work breakdown and tests.**
- [x] Design decisions written (this section)
- [x] R1: migration, presets and the reference list, pure rules, services, routes, staff screens (a Progress tab, a person's record, quick add, the week grid), matrix rows
- [x] R2: migration, settings columns, verification states and actions, locks with heartbeat, the settings controls
- [x] R3: migration (the "seen" table), the family summary and entries, the portal tab, the ceiling switches (two more), matrix rows
- [x] Tests: unit (templates, the surah list, value validation, next-from, the week, the summary, the lock rules, the status moves), API (who may; each refusal; one row a day; stale version; locks; four-eyes; return; verify the week; families see only published values; a guardian never sees notes in SUMMARY; a pupil never sees another pupil), browser (desktop and phone, both themes, axe)

**8.11 Not in batch C1.** Arabic and both-side-by-side display, Hijri dates, Arabic-Indic digits and the print view (R4); translation (R5); a template designer or second version; deleting an entry; a photo; offline entry; voice; charts; progress for people typed in on the portal; the Octalve Edu parity.

## 9. Batch C1 results (2026-11-06)
**Targeted runs on the final build.** Unit (progress rules, the surah list, the route-role guard): passed. API `tests/api/progress-records.spec.ts`: 40 tests passed. Browser `tests/e2e/progress-records.spec.ts`: passed on desktop and phone (teacher, supervisor, program admin, pupil, guardian; both themes with axe and a no-sideways-scroll check).

**Real defects the tests found (all fixed).**
- Saving an entry or a profile with the values it already held still raised its version and wrote a revision. The database returns JSON keys in its own order, so a plain string comparison never matched. A key-order-independent comparison (`sameJson`, `progress-rules.ts`) is now used by the service, and by the week grid and the profile form on screen (the week grid's "Save the week" stayed enabled after saving for the same reason).

**Mistakes in my own tests (fixed).** The settings test counted a refused change as an audit row; the suspension test used the program's People route, which refuses school pupils (they are changed on the Students page); the lock test moved the release time before the heartbeat, which the database check forbids; the browser spec made entries for tomorrow (so nothing showed), made two records at once, and used wrong button and rating wording.

**Full suite on the final build:** 3,662 tests = 3,609 passed / 46 skipped / 7 failed (3.6 h). None of the 7 is in the progress-records tests or in code this batch touches. All 7 were read and then re-run alone on the same build: all passed (14 of 14 across desktop and phone), so they are recorded as timing failures, not fixed, and the cause is not confirmed. They are: the MFA "code that confirmed it cannot immediately sign in" API test (a replay inside the same 30-second code window answered 200 instead of 401); five desktop light-theme colour-contrast checks on the Forms pages (marking tab, overview, questions, results, the Forms list), which ran one after another in the same stretch of the run; and the phone students "suspends with a reason" test (timed out waiting for the Suspend button), the same phone students test that failed once in batch B. If the contrast failures come back, look first at what is on screen when axe measures (a hover or a transition), then at the Forms colours.

**Not run.** Mutation passes (deferred by the maintainer to the end of Phase 2); the hosted database; a real phone; Arabic and Hijri display, digits and print (R4); translation (R5).
