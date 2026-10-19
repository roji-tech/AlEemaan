# Design note: Forms module and Question Bank (AlEemaan)

- **Status:** Design agreed with the maintainer on 2026-10-19; **nothing is built**. Written before any code, per the plan-before-code rule.
- **Applies to:** AlEemaan (single tenant, many branches). Octalve Edu (multi-tenant, RLS) needs its own note later.
- **Decisions behind it:** `docs/HANDOVER.md` sections 6.1 to 6.5b (the maintainer's words, in order). This note turns them into a design; where they disagree, HANDOVER wins and this note is wrong.
- **Task file to create when work starts:** `docs/tasks/0032-forms-and-question-bank.md`.

---

## 1. Purpose and scope

Today a **Quiz** is the only assessment object: online, auto-marked, taken by enrolled pupils through the portal. Teachers also need to:

1. keep and reuse good questions (a **question bank**), with review before pupils see them;
2. publish questions that are **not graded** (practice sets for exam preparation);
3. gather information (**questionnaires**: enquiry, feedback, review), from members or from the public, optionally anonymous;
4. run work that is **handed in on paper** (the teacher records who submitted);
5. **mark** some questions or whole attempts by hand;
6. let pupils **practise** bank questions from the portal with a kept history;
7. keep **exam questions secret** until the exam is over, without giving anything away by hiding things.

Out of scope here: replacing the existing Quiz tables (they stay as they are), a native app, a lockdown browser, Octalve parity.

## 2. Principles (every rule below follows from these)

1. **The server decides what a pupil sees.** The UI never filters secrets; the database query does. A pupil's response never contains an answer key, a teachers-only item or another pupil's data.
2. **A question may appear later, never disappear.** There is no dynamic "hold". Visibility is decided once, at approval, by someone senior. (A disappearing question tells anyone who knew it that an exam is near; "question not available" is a disclosure.)
3. **The uploader always sees "approved".** Visibility and the overlap warning are for the approver only.
4. **Copy on use.** A question used in a quiz, test, exam or form is a copy with a link to the bank item. Editing the copy never changes the bank or past papers.
5. **Everything sensitive is switchable by the superadmin and audited.** Branch admins may only narrow, never widen.
6. **No promise we cannot keep.** Screenshots and phone photos cannot be prevented in a browser. Controls are watermarks, an audit trail, caps and rate limits, said plainly in the settings screen.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Bank item** | An approved, reusable question. Lives in a bank. |
| **Bank** | `ASSESSMENT` (quizzes, tests, exams, practice) or `QUESTIONNAIRE`. Two banks, one machinery. |
| **Copy** | A question inside an assessment or form that came from a bank item (`sourceItemId`). Freely editable. |
| **Visibility** | `PRACTICE`, `TEACHERS_ONLY`, or `TEACHERS_ONLY_UNTIL` a date or an assessment's close. Set at approval. |
| **Reviewer** | Approves, edits or rejects submissions. **General** (all subjects) or **per subject**. |
| **Exam approver** | A designated reviewer (general or per subject) who sees overlap warnings and sets visibility. Several allowed. |
| **Form** | The container for practice sets, questionnaires and paper work (below). Quizzes keep their own tables. |
| **Section** | A coarse grouping of classes (for example "JSS", "SSS", "Primary") used wherever a pupil must not be identifiable by class. |

## 4. The kinds of thing a teacher can publish

| Kind | Where the answers go | Who answers | Ends when | Marked by |
|---|---|---|---|---|
| **Quiz** (exists) | online | enrolled pupils | pupil submits | automatically |
| **Test / exam (online)** | online | enrolled pupils | window closes | auto, manual, or mixed |
| **Practice set** | nowhere (study material) | pupils | never | nobody |
| **Questionnaire** | online, not scored | members, or the public | window closes | nobody |
| **Paper work** | handed in physically | pupils | teacher closes it | teacher marks who handed in |

**Question types (both banks):** single choice, **multiple selection** (correct only when exactly the right set is chosen; partial credit is a later rule), true/false, short answer. Questionnaires add rating (1 to 5) and free text. **Images:** up to 3 per question (the superadmin may raise the limit to 4), each with a maximum size (start: 500 KB, 1600 px long side), JPEG/PNG/WebP only, metadata stripped on upload, **alt text required** (or an explicit "decorative" tick).

## 5. Data model (sketch, additive; existing tables untouched)

Names follow the repo's conventions (composite `(branchId, id)` keys, partial unique indexes, triggers where an invariant matters).

```
QuestionBankItem
  id, branchId?            // null = general (all branches); set = restricted to that branch
  bank                     // ASSESSMENT | QUESTIONNAIRE
  type                     // SINGLE | MULTI | TRUE_FALSE | SHORT | RATING | TEXT
  prompt, explanation?, points, difficulty?, topic?
  options Json             // [{id, text}]
  correctAnswer Json?      // string | string[]; null for questionnaire items
  subjectId?               // null = cross-subject
  visibility               // PRACTICE | TEACHERS_ONLY | TEACHERS_ONLY_UNTIL
  visibleFrom DateTime?    // for TEACHERS_ONLY_UNTIL (date) ...
  visibleAfterAssessmentId?// ... or an assessment's close
  status                   // DRAFT | PENDING | APPROVED | REJECTED | RETIRED
  version Int              // a fix creates a new version, old versions kept
  submittedById, approvedById?, approvedAt?, retiredReason?
  createdAt, updatedAt

QuestionBankImage        (itemId, storageKey, alt, decorative, bytes, w, h, sortOrder)  max 3 or 4 per item (trigger)
QuestionBankClassTag     (itemId, classGroupId)                                        several per item
QuestionBankReview       (itemId, version, reviewerId, outcome, reason, at)            immutable audit of every decision
QuestionBankReviewer     (userId, scope: GENERAL|SUBJECT, subjectId?, isExamApprover, branchId?, assignedById, at)
QuestionOverlapFlag      (itemId, similarToItemId?, similarToAssessmentQuestionId?, score, createdAt)  visible to exam approvers only

FormQuestion             (formId|assessmentId, sourceItemId?, sourceVersion?, prompt, type, options, correctAnswer?, points, marking AUTO|MANUAL, sortOrder, images...)  the COPY
Form                     (id, branchId, kind PRACTICE_SET|QUESTIONNAIRE|PAPER_WORK, title, audience, anonymity, opensAt, closesAt, maxDurationMinutes?, closedById?, status)
FormAudience             (formId, kind MEMBERS|PUBLIC, roles[], classGroupIds[], ...)
FormResponse             (formId, respondentId?, createdAt, ...)        respondentId is NULL when the form is anonymous
FormAnswer               (responseId, formQuestionId, value Json, markedScore?, markedById?)
FormAnsweredBy           (formId, subjectKey)                           "has answered" for one-per-person; NO link to FormResponse
FormTurnIn               (formId, studentId, status PENDING|HANDED_IN|LATE, markedById?, requestedAt?, at)   paper work roll-call
PracticeAttempt          (id, studentId, bankItemId, version, answer, correct, answeredAt, archivedAt?)       private to the pupil
PracticeSession          (id, studentId, subjectId?, classGroupId, size, feedbackMode EACH|END, startedAt, finishedAt?)
QuestionReport           (itemId, version, reporterKind TEACHER|PUPIL, reporterId, section?, text, status OPEN|FIXED|NOT_AN_ERROR|DISCUSS, resolvedById?, reason?)
QuestionBankPrintLog     (userId, itemId|assessmentId, kind, at, watermark)
```

Notes:
- **Anonymity** is structural, not a flag on a query: for an anonymous form `FormResponse.respondentId` is never written and `FormAnsweredBy` has no foreign key to `FormResponse`, so nobody (admins included) can join the two. Small summaries (fewer than 5 responses) hide the breakdown.
- **Questionnaire items** use the same `QuestionBankItem` with `bank = QUESTIONNAIRE` and no `correctAnswer`.
- **Retention:** practice data follows the same retention as other pupil data. A pupil can only **archive** entries (`archivedAt`: hidden from their view); archived rows stay and still feed class summaries.
- Existing `Quiz`, `QuizQuestion`, `QuizAttempt` stay. A later task may link them to bank items.

## 6. Roles, permissions and switches

| Capability | Pupil | Teacher | Reviewer | Exam approver | Branch admin | Superadmin |
|---|---|---|---|---|---|---|
| Practise bank questions (portal) | yes | | | | | |
| Submit a question | | yes | yes | yes | yes | yes |
| See approved `TEACHERS_ONLY` items | | their subjects only | per scope | per scope | own branch | all |
| Approve, edit, reject | | | yes (their scope) | yes | override | override |
| Set visibility and the "until" date | | | | **yes** | **yes (the uploader's admin)** | yes |
| See overlap warnings | | | no | **yes** | no | yes |
| Assign reviewers and exam approvers | | | | | yes (own branch) | yes |
| Print exam questions in the exam window | | | | **yes (audited, watermarked)** | per setting | yes |
| Turn comments (reports) on or off | | | | | per branch (narrow only) | school-wide or per branch |
| **Disable bank access for a group** | | | | | | **pupils, staff, admins, separately, per branch too** |

Rules: the uploader never sets visibility. A branch can never override a school-wide "off".

**Superadmin settings (school-wide, with a default; branch admins can only narrow):**
`bank.access.pupils|staff|admins` (on/off, per branch override only to narrow) · `bank.practice.maxQuestions` (start 100) · `bank.practice.defaultQuestions` (20) · `bank.practice.presets` (10, 20, 30, 50, 100) · `bank.practice.dailyCap` (per pupil) · `bank.practice.minPoolSize` (below it, practice is simply not offered for that subject and class; no explanation about exams) · `bank.reports.teachers|pupils` (on/off) · `bank.images.max` (3, may be 4) and size limits · `bank.print.nearExamDays` and the exam window (teachers cannot print exam questions inside it) · `bank.smallSummary.min` (5).

## 7. Exam secrecy (the hard part)

1. **Static visibility.** An approved item is `PRACTICE`, `TEACHERS_ONLY`, or `TEACHERS_ONLY_UNTIL` (a date, or an assessment's close). The pupil query is `visibility = PRACTICE OR (visibility = TEACHERS_ONLY_UNTIL AND the date/close has passed)`. An item that was never shown cannot be missed.
2. **Questions written for a real exam start inside the exam**, not in the bank. After the sitting they are offered to the bank only when a teacher or an admin chooses.
3. **A practice-pool question later chosen for an exam is not hidden.** The exam copy records `exposedToPractice = true` so the teacher sees the risk and can swap it.
4. **Overlap check, silent.** On submission and on offer-back, a similarity check compares the text with items used in scheduled assessments. A hit creates a `QuestionOverlapFlag` visible only to exam approvers. The uploader sees "pending", then "approved", in every case. The approver can approve and keep it out of the pupil pool until the exam closes.
5. **Retiring a question** (an error found) shows pupils the same generic "this question was corrected" for every reason.
6. **Templates.** A teacher's personal template used by a scheduled exam is hidden from sharing, copying and browsing until the exam closes (the owner still sees it).
7. **Printing.** Server-made PDF only. Pupils may print their own practice (always), and their own finished work with answers after submission; never an unsubmitted quiz or an exam in the window. Teachers cannot print exam questions in the near-exam and exam window (set by the superadmin); exam approvers can, audited and watermarked (name and time on every page). A teacher may release a handout to a named pupil (access needs, paper work); the release is recorded.
8. **Honest limits.** Phone photos and screenshots cannot be prevented in a browser or an installed web app. A native Android wrapper could block screenshots (FLAG_SECURE); iOS can only detect them. A camera pointed at a screen can never be stopped. The settings screen says this in plain words.

## 8. Flows

### 8.1 Bank: submit and approve
Teacher writes a question (or promotes one from a quiz, 8.3) → `PENDING` → a reviewer in scope approves, edits or rejects with a reason (`QuestionBankReview`) → on approval the approver (or the uploader's admin) sets scope (general or one branch), class tags, subject and visibility → `APPROVED`. The submitter can use their own draft in their own quiz meanwhile; nobody else sees it.

### 8.2 Setting a quiz, test or exam from the bank
Browse and search approved items by subject, class tag, topic, difficulty, type. **Add** copies the item into the assessment (`FormQuestion` with `sourceItemId`). Edit the copy freely. Past papers are never touched by later bank edits.

### 8.3 Offer back
A copy that differs from its source can be offered as a **new** bank item (never an overwrite). It goes through 8.1 again.

### 8.4 Pupil practice (portal)
Pupil picks subject and topic for their class, **chooses feedback timing (after each question, or at the end)** and **how many questions** (presets up to the superadmin's maximum, default 20; a daily cap applies). The server draws a random set from approved `PRACTICE` items tagged for the pupil's class group; no lookup by id. The key is revealed only after the pupil answers (per question, or at the end). A history is kept (`PracticeAttempt`); the pupil can archive entries. Teachers see class-level weak topics, not individuals, by default. **Practice is never a mark.**

### 8.5 Reports on questions ("report an issue", not a thread)
Teachers on any approved item they can see; pupils only on questions they have just practised. Text is length-capped, links stripped, rate-limited. It lands in the reviewer queue; reviewers see the reporter's **role and section only** ("a pupil in JSS"). Outcomes: **fixed** (new version; if a copy was already used, the reviewer is offered "apply the correction to that copy and re-grade attempts", never silently), **not an error**, **needs discussion**; the reason is visible to the reporter. Teachers' and pupils' reports have separate switches.

### 8.6 Questionnaires
Create from the questionnaire bank or ad hoc. Audience chosen at creation: **members** (pupils, parents, staff, by role and class) or **public** (an open link). Anonymity chosen at creation: **anonymous** (no link to the person) or **identified**. One response per person works for members in both modes (via `FormAnsweredBy`); a public form can only limit by device or IP, which is weak and is said so in the form settings. Public forms add rate limiting and a spam check and never ask for pupil data.

### 8.7 Paper work
The teacher sets a title, a due time and a **maximum duration**, publishes, and later **closes it** (or it closes itself at the deadline). The teacher marks each pupil handed in, late or not yet, like a roll call. A pupil can tap **"Request marking"**; that only flags them for the teacher and never marks them. Every change is audited with who made it.

### 8.8 Manual marking
Per question (`marking = MANUAL`) or per attempt. The score is the sum; the result is "pending" until the teacher finishes. Short answers default to manual (exact text match punishes spelling).

## 9. API surface (all new; `withAuth` and a branch combinator on staff routes, portal session on portal routes)

- Staff: `GET/POST /api/v1/question-bank/items`, `PATCH .../items/[id]`, `POST .../items/[id]/submit|approve|reject|retire|offer-back`, `GET .../review-queue`, `GET/POST .../reviewers`, `GET .../reports`, `PATCH .../reports/[id]`, `GET/POST /forms`, `PATCH /forms/[id]`, `POST /forms/[id]/close`, `GET /forms/[id]/responses`, `GET/PATCH /forms/[id]/turn-ins`, `POST .../print`, settings under `/settings/question-bank`.
- Portal (no staff login; branch from the pupil's enrolment): `POST /portal/students/[studentId]/practice/sessions`, `POST .../practice/sessions/[id]/answers`, `GET .../practice/history`, `PATCH .../practice/history/[id]` (archive only), `POST .../questions/[itemId]/report`, `POST .../forms/[id]/response`, `POST .../forms/[id]/turn-in-request`.
- Public: `GET/POST /api/public/forms/[token]` (rate-limited, spam-checked).
- Every new route is added to `tests/unit/route-role-guard.spec.ts` with its reason.

## 10. Screens

Question bank (browse, filter, submit, my submissions), Review queue (approve/edit/reject, overlap flags for exam approvers), Reviewers (assign general, per subject, exam approver), Reports queue, Forms builder (kind, audience, anonymity, dates, duration), Responses and summaries (small-count hiding, export for admins), Paper-work roll call, Portal: Practice (setup, session, history with archive), Portal: forms and "request marking", Superadmin: Question bank settings. All with theme tokens (see HANDOVER 6), both themes, phone width, axe clean.

## 11. Security and abuse controls

| Risk | Control |
|---|---|
| Scraping the bank through practice | Random sets only, no lookup by id, answer revealed only after answering, daily cap per pupil, size cap per set |
| Answer key sent early | Key stays server-side until answered; response shapes tested for absence of `correctAnswer` |
| Teachers-only item seen by a pupil | Query-level filter; tested for every portal route |
| Uploader learns an item is protected | Uploader status is only pending/approved; flags are exam-approver only |
| Exam printed by the wrong person | Window enforced server-side; PDFs watermarked; every print logged |
| Anonymous response de-anonymised | No respondent id stored; `FormAnsweredBy` unlinked; small-count hiding |
| Public form abuse | Rate limit, spam check, no pupil data, size caps |
| Child free text | Treated as personal data (NDPA); reviewers see section only; same retention as pupil data |
| Image abuse | Type and size limits, metadata stripped, re-encoded server-side, alt text required |
| Cross-branch reads | `withBranch` / `withAuthGated` on every staff route; cross-branch tests per route family |

## 12. Audit

Every approval, rejection, retirement, visibility change, reviewer assignment, switch change, report outcome, print, turn-in change and exam-approver view of an overlap flag is written with who, what, when and the old and new value. The audit rows are append-only (trigger).

## 13. Build order (each slice: design here, tests first where possible, commit, docs updated)

1. **Foundation:** models, migration, settings keys, reviewer assignment, audit, route guard entries.
2. **Bank core:** submit, review queue, approve/reject/retire, class tags, images, scopes, visibility, overlap flags.
3. **Use in assessments:** pick from bank (copy on use), offer-back, templates and their hiding.
4. **Pupil practice:** sessions, feedback timing, size and caps, history and archive, portal screens.
5. **Reports on questions:** queue, outcomes, switches, re-grade offer.
6. **Practice sets (forms):** ungraded publishing.
7. **Questionnaires:** members, then public and anonymous, summaries.
8. **Paper work:** roll call, close, maximum duration, pupil request.
9. **Manual marking:** per question and per attempt.
10. **Printing:** server PDFs, windows, watermark, logs.

Mutation passes stay deferred to the end of Phase 2 (maintainer's call).

## 14. Tests to write (the minimum)

- **Secrecy:** a pupil route never returns `correctAnswer`, `TEACHERS_ONLY`, or items before their date/close; a practice set never contains an item the pupil's class is not tagged for; no route lookup by item id for pupils.
- **Uploader opacity:** the uploader's responses are identical whether or not an overlap flag exists (compare bytes).
- **Appear later, never disappear:** an item whose date passes appears; no operation removes a `PRACTICE` item from a pupil's pool except an admin retirement, which shows the generic text.
- **Permissions:** each cell of the table in section 6, per role, including the uploader's admin; reviewer scope (general vs per subject); branch narrowing cannot override a school-wide off.
- **Anonymity:** an anonymous response row has no respondent; no query path joins it to `FormAnsweredBy`; small-count hiding.
- **Public form:** rate limit and spam rejection; no pupil data accepted.
- **Practice:** caps (daily, per set), presets up to the superadmin maximum, feedback modes, archive does not delete, history is private.
- **Printing:** the window blocks teachers, allows exam approvers, writes a log row, PDF carries the watermark text.
- **Images:** the 4th (or 5th) image is refused, type/size limits, alt text required.
- **Cross-branch:** the usual probe per route family.
- **A11y:** axe in both themes at desktop and phone for every new screen.

## 15. Migration notes

All additive. New tables only; no change to `Quiz`, `Result`, `Assignment`. Triggers: image count per item, append-only audit and review rows, `FormAnsweredBy` has no foreign key to responses. Deploy order: migration first, then code (as in the UI1 note).

## 16. Open items (small; none block slice 1)

- Wording of the generic retirement text.
- Whether partial credit for multiple selection should ship in slice 9.
- The exact similarity method for overlap flags (start: normalised text plus trigram similarity; no external service).
- Whether the existing Quiz should later be re-pointed at `FormQuestion` (not now).
- Octalve parity (tenant-scoped, RLS) needs its own note.
