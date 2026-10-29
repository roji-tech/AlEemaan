# 0040: Portal sign-in tells a pupil from a guardian, and what each may do is an admin setting

- **Period / Focus:** requested 2026-10-25 (the maintainer answered yes to all three questions and added: "put them to admin settings")
- **Status:** Step 1 merged 2026-10-26 (PR #93, built on `claude/portal-actor-and-access`; the test record is in the HANDOVER); step 2, real separate credentials, is not started
- **Priority:** Medium (open item "portal sign-in secret is the guardian's phone", `docs/open-items.md`)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** to be created off `dev` when the work starts

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Today the portal asks for an admission number and ONE secret (the date of birth, the guardian's phone or the guardian's e-mail) and grants the same access whichever it was. A pupil who types their own date of birth therefore sees invoices, and a guardian who types a phone number can submit work and take quizzes as the pupil. Step 1 makes the session record **who is acting** (a pupil or a guardian) and checks what that actor may do on every portal route. Real separate credentials (a pupil's own password, a guardian account that is not derived from a phone number) need a migration and come later, as step 2.

## 2. Decisions (the maintainer's, 2026-10-25)
1. The table below is right as the starting point.
2. A guardian sees a practice summary (what is allowed is an admin choice, below), not the questions.
3. Do step 1 now; real separate credentials (step 2) later.
4. **Added by the maintainer: the access is not hard-coded. It is a setting of each branch, edited in the admin settings screen.**

| Area | Pupil (default) | Guardian (default) |
| --- | --- | --- |
| Overview, results | yes | yes |
| Invoices | no | yes |
| Learning materials (read) | yes | yes |
| Submit assignments | yes | no |
| Take quizzes | yes | no |
| Question-bank practice | full | summary only |
| Other children linked by the same guardian contact | none | all linked children |

## 3. Design
- **Who is acting.** The signed session payload gains `actor: "PUPIL" | "GUARDIAN"`. Sign-in by the date of birth is a PUPIL; sign-in by the guardian's phone or e-mail, or by a guardian link token, is a GUARDIAN. A token without `actor` (a cookie signed before this change, valid for up to 7 days) is read as GUARDIAN, the more restricted of the two for submitting and the less restricted for invoices, which is what it could do before; it is not widened. `parsePayload` rejects any other value. The siblings list is built only for a GUARDIAN; a PUPIL's `allowedStudentIds` is their own id (this also narrows the open item about siblings inferred from a shared contact for the pupil's side).
- **The setting.** A branch setting `portal_access` stored in `SettingValue` (scope BRANCH, the same place as the report-card layout), value `{ pupil: Access, guardian: Access }`, where `Access` is booleans `overview`, `results`, `invoices`, `materials`, `submitWork`, `takeQuizzes`, `siblings` and `practice: "NONE" | "SUMMARY" | "FULL"`. No row means the defaults in the table; a missing or unknown key falls back to the default for that key, so a later release can add a key without a migration. Pure resolver `resolvePortalAccess(value)` in `src/lib/portal/access.ts` (unit tested).
- **Enforcement.** A single guard `portalMay(session, student, capability)` that every portal route and the portal page call after the session check. A refusal is a 403 with one message ("Your sign-in does not include this."), the same for every capability, and the screens do not show a link the guard would refuse. CHANGED WHEN BUILT: each actor must keep at least one of overview, results, invoices and coursework (a sign-in that opens an empty portal is a dead end), and handing in work or taking a quiz needs the coursework section; the settings route and the screen refuse the rest. Money is kept out of everything an actor without `invoices` is given: their overview carries no fee figure and a blocked report card says only that it is not available yet, with no amount. A guardian who may not take quizzes is not sent the quizzes either.
- **Who edits.** CHANGED WHEN BUILT (2026-10-26): the superadmin only, not a branch administrator. The screen is a tab of the Settings page, which is a superadmin page ("Only superadmins can view and manage school settings"), and an API with no screen for the other role would repeat the mistake Task 0031 was written to correct. `PATCH /api/v1/settings/portal-access`, strict body, validated; every change writes a `SettingAudit` row with the old and new value, and a change that gives somebody more than before is marked `CHANGED_WIDENING`. No approval flow and no fresh proof in step 1 (the data is the school's own, the change is audited and reversible); if the maintainer wants either, the setting joins `ENFORCEABLE_KEYS`.
- **The screen.** A "Portal access" section on the Settings page: a table, one row per area, a column for each actor, checkboxes (the practice row is a select), a Save button, the audit trail below. States: loading, load error with Try again, saved, refused. Phone width and both themes, axe on each state.
- **The practice level is Octalve's `bank.parents.view` (proposed 2026-10-26, for the maintainer to confirm or overrule: no second key).** Octalve Edu gives a `PARENT` its own account, so its question bank has a school setting, `bank.parents.view`, one of `NONE`, `SUMMARY`, `FULL`, default `NONE`, which a campus may only lower. Here the pupil and the guardian already share one portal and `portal_access.guardian.practice` carries the same three values (`NONE`, `SUMMARY`, `FULL`) per branch, so a `bank.parents.view` next to it would be two controls for one decision. Two differences remain on purpose and are written down so nobody "fixes" them: the guardian default here is `SUMMARY` (the table above), where Octalve starts at `NONE`; and the level is a per-branch setting of the superadmin with no school-wide ceiling for a branch to narrow. The meaning of the levels is the same in both: `SUMMARY` is how many sets and how it went, never a question's text; `FULL` is the child's own practice history, PRACTICE questions only. If the maintainer later wants one name or a school-wide ceiling in both products, add `bank.parents.view` as a ceiling that the stricter-of-two rule applies to `portal_access.guardian.practice`; nothing in the code needs to change first, because nothing reads `practice` until pupil practice (task 0032 slice 4).

## 4. Work Breakdown
- [x] 1 `src/lib/portal/access.ts`: types, defaults, `resolvePortalAccess`, `allowedTabs`, `portalAccessInput`, `widens` (unit spec); the guard is `portalGate` in `guard.ts`
- [x] 2 Session payload `actor`; set at every sign-in path; `parsePayload` and the legacy-cookie rule; siblings only when the branch's setting for that actor allows them, and checked again on every request
- [x] 3 Guard on the six portal API routes and the portal page; the screens hide what is refused
- [x] 4 `portal_access` read/write service, `GET/PATCH /api/v1/settings/portal-access`, audit
- [x] 5 Settings screen: the "Portal access" tab
- [x] 6 Tests: unit (resolver, payload), integration/api (every route by actor and by setting, the audit, the strict body, a legacy cookie), e2e (the screen, desktop and phone, both themes; a pupil and a guardian each find what the table says)
- [x] 7 Docs: HANDOVER, `open-items.md`, `current-tasks.md`, catalogs, ADR-style note for the actor rule
- [ ] Mutation passes (deferred to the end of Phase 2)

## 5. Not in step 1
Separate credentials (a pupil password, a guardian account), a migration, revoking portal sessions, replacing the guardian phone as a secret. These stay open items.

## 6. Definition of done
Every portal route is covered by a test for each actor and each switch; the defaults reproduce the table; tsc, lint, build, then the tests pass; docs updated.
