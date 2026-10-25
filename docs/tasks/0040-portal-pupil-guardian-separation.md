# 0040: Portal sign-in tells a pupil from a guardian, and what each may do is an admin setting

- **Period / Focus:** requested 2026-10-25 (the maintainer answered yes to all three questions and added: "put them to admin settings")
- **Status:** Pending (planned, not started; waits for Task 0039 slice 1 to merge so the two do not touch the same files at once)
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
- **Enforcement.** A single guard `portalMay(session, student, capability)` that every portal route and the portal page call after the session check. A refusal is a 403 with one message ("Your sign-in does not include this."), the same for every capability, and the screens do not show a link the guard would refuse. The overview and results cannot be turned off for both actors together (a portal with nothing in it); the settings route refuses that.
- **Who edits.** `PATCH /api/v1/settings/portal-access` for an administrator of the branch (a superadmin for any branch), strict body, validated; every change writes a `SettingAudit` row with the old and new value. A change that gives the PUPIL invoices or the GUARDIAN submitting is flagged in the audit as widening. No approval flow and no fresh proof in step 1 (the data is the school's own, the change is audited and reversible); if the maintainer wants either, the setting joins `ENFORCEABLE_KEYS`.
- **The screen.** A "Portal access" section on the Settings page: a table, one row per area, a column for each actor, checkboxes (the practice row is a select), a Save button, the audit trail below. States: loading, load error with Try again, saved, refused. Phone width and both themes, axe on each state.

## 4. Work Breakdown
- [ ] 1 `src/lib/portal/access.ts`: types, defaults, `resolvePortalAccess`, `portalMay` (unit spec)
- [ ] 2 Session payload `actor`; set at every sign-in path; `parsePayload` and the legacy-cookie rule; siblings only for a guardian
- [ ] 3 Guard on the six portal API routes and the portal page; the screens hide what is refused
- [ ] 4 `portal_access` read/write service, `GET/PATCH /api/v1/settings/portal-access`, audit
- [ ] 5 Settings screen section
- [ ] 6 Tests: unit (resolver, payload), integration/api (every route by actor and by setting, the audit, the strict body, a legacy cookie), e2e (the screen, desktop and phone, both themes; a pupil and a guardian each find what the table says)
- [ ] 7 Docs: HANDOVER, `open-items.md`, `current-tasks.md`, catalogs, ADR-style note for the actor rule
- [ ] Mutation passes (deferred to the end of Phase 2)

## 5. Not in step 1
Separate credentials (a pupil password, a guardian account), a migration, revoking portal sessions, replacing the guardian phone as a secret. These stay open items.

## 6. Definition of done
Every portal route is covered by a test for each actor and each switch; the defaults reproduce the table; tsc, lint, build, then the tests pass; docs updated.
