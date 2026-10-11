# [0006]: Branch administrators and superadmins (build of design S1–S8)

- **Period / Focus:** 2026-10-11 → (authorization model change on the live-school codebase)
- **Status:** Completed (code) — full one-lane suite on `claude/branch-admins-superadmins`, 2026-10-11: **1143 passed, 0 failed, 18 skipped (1.0 h)**; ADR 0014 awaits the maintainer
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/branch-admins-superadmins` → `dev`
- **Started:** 2026-10-11 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
`ADMIN` administers one branch; a new `User.isSuperAdmin` flag administers every branch. Every current administrator becomes a superadmin in the migration, so nothing changes for the live school until the maintainer demotes someone by choice.

## 2. Context & Related Docs
- Plan: "Build design — branch administrators and superadmins" (S1–S8) and the maintainer's answers (2026-10-11); defaults accepted: flag on the person; a branch admin cannot create another admin; all current admins become superadmins; branch admins manage their branch's sessions.
- ADR 0012 (Accepted) — this work supersedes only its interim ADMIN bullet; ADR 0005 (last administrator, extended to superadmins); ADR 0003 (additive migrations, migration before code).
- New ADR: drafted with the code, **Proposed** (only the maintainer can accept).

---

## 3. Work Breakdown

### Module A: Foundation (slice 1)
- [x] Tests first: migration backfill + idempotency; `canAdminister` / `resolveBranchRole` / `branchIdsFor` truth table
- [x] `User.isSuperAdmin` + additive migration with the backfill in the same file; applied to the docker dev DB (:5434) first (done 2026-10-11; that DB has no users, so the backfill is exercised by the test only)
- [x] `lib/auth/branch-access.ts`: `isSuperAdmin`, `canAdminister`; `resolveBranchRole` / `branchIdsFor` honour the flag; ADMIN membership is now that branch only
- [x] Test support: `createUser({ role: ADMIN })` makes a superadmin by default (as the migration does); `superAdmin: false` for a branch admin

### Module B: Members and invitations (slice 2)
- [x] `withAuth({ superAdmin: true })`
- [x] Members / invitations routes: branch admin acts on own branch only, roles below ADMIN only (`CAN_MANAGE_USERS` does not exist here yet, so nothing to refuse)
- [x] Last-superadmin rule (`LAST_SUPERADMIN`), counted by person under a lock; grant/revoke superadmin (password re-type, audited)
- [x] `scripts/make-superadmin.mjs` and `pnpm superadmin:make`; setup wizard marks the first administrator a superadmin

### Module C: The other admin routes (slice 3) — review list of the `Role.ADMIN` sites
- [x] students (create/update/archive/restore/import), attendance, academics sessions/periods → `canAdminister(branch)`
- [x] branches, school settings → superadmin only
- [x] sign-in shorter admin session, page session (`isAdmin`), Users page
- [x] route-role guard: second assertion (a handler that takes a branch must call `canAdminister` / `resolveBranchRole`)

### Module D: Docs
- [x] New ADR (Proposed), plan "As built", progress tracker, tests/README, issues ISS-0013, this file's results

---

## 4. Unified Verification & Quality Gates
- [x] `tsc --noEmit`, lint, `format:check`, `pnpm build`, tests (gate order)
- [x] Full one-lane suite — 1143 passed, 0 failed, 18 skipped (1.0 h), 2026-10-11, HEAD `539574d`
- Mutation pass: not run — pending, end of Phase 2 (targets: backfill predicate, last-superadmin count, branch comparison in `canAdminister`, "cannot touch an admin").

---

## 5. Notes, Findings & Deviations
- Slice 1 is deliberately behaviour-neutral for the live school: the flag is added and read, every admin is a superadmin, so every route answers as before. Branch admins only come into being once slice 2 lets a superadmin demote someone; the interim rule must not be loosened before `canAdminister` guards the admin routes (slice 2–3).
- Slice 1 results (2026-10-11): `tests/integration/super-admin.spec.ts` 6 passed; regression subset (api attendance/students/members/invitations/branches/school-settings/setup, integration members/deactivated-members/with-auth/super-admin, unit) on ONE worker: 326 passed, 1 failed before the fix below. The failure was `attendance › an administrator still reaches every branch`: that test minted an ADMIN membership by hand, which is now a branch admin; it is split into "a branch administrator reaches their own branch and gets 404 for another" (new behaviour) and "a superadmin reaches every branch" (old behaviour, explicit); `attendance.spec.ts` 18 passed. (A first attempt with `--workers=2` produced 6 failures; the specs share one test database and reset it, so they must run on one worker — my mistake, not a code fault; all passed alone.)
- The new tests were written before the code but could not run until the column and helpers existed, so no 'seen failing' run exists for them; the migration test asserts the predicate on active, deactivated, teacher, parent, no-membership and two-admin-memberships people, and the mutation pass (end of Phase 2) targets it.
- The full suite has NOT been run on this branch.
- Slice 2 (2026-10-11): `withAuth` gains `superAdmin: true`, and `roles` containing `ADMIN` is satisfied by a superadmin without an ADMIN membership; the route-role guard accepts `superAdmin: true` as a declaration. Members/invitations services take a REQUIRED `AdminScope` (a forgotten scope is a type error, not a fail-open); routes get it from `scopeOrForbidden` (403 when the caller has no authority at that instant, so a membership deactivated between the gate and the action is not a misleading 404). Out of scope = 404 like an unknown id; an administrator or superadmin, making one, or moving a person to a branch outside scope = 403. `LAST_ADMIN` became `LAST_SUPERADMIN`: only deactivating a superadmin's LAST active membership, or revoking the flag, can leave the school without one; changing a role or branch never removes authority (the flag stays). Counted by person, rows locked (`FOR UPDATE` on superadmin `User` rows) BEFORE counting in a new statement. New: `PATCH /members/[id]/superadmin` (superadmin, own password, audited, strict body, rate-limited wrong passwords), `scripts/make-superadmin.mjs` (+ `pnpm superadmin:make`), the setup wizard marks the first administrator a superadmin.
- Slice 2 tests: new `tests/api/branch-admins.spec.ts` (13), `tests/integration/make-superadmin-script.spec.ts` (3), `tests/integration/members.spec.ts` rewritten for the superadmin rule (28 incl. deactivate-race and revoke-race, branch-scope and `setSuperAdmin` blocks); API/integration/unit subset 298 passed after the race-test fix. One failure on the way was a TEST bug, not a lock failure: the race test retired its pair by setting the role to PARENT, which no longer removes authority, so a third superadmin existed and two removals were correctly allowed; it now retires by clearing the flag and counts bystanders by flag (3 repeat runs passed).
- Slice 3 (2026-10-11): students (create/update/archive/restore/import) and academic sessions/periods follow the branch (`lib/students/scope.ts`: entity of another branch = 404 like an unknown id, a branch in the body that is not the caller's = 403); `POST /branches` and `PATCH /settings/school` are `superAdmin: true`; `GET /branches` is scoped; page session, nav (Branches and Settings are superadmin entries), the Branches/Settings pages, the sign-in lifetime and the Users page (badge, hidden controls, "Make / Remove superadmin" dialog, role options without Administrator for a branch administrator). Second route-guard assertion added and checked non-vacuous. ADR 0014 drafted (**Proposed**). The superadmin endpoint is `PATCH` (not `PUT`) so the shared `components/auth/postJson.ts`, which CLAUDE.md keeps identical to Octalve's, is untouched.
- Slice 3 tests: `tests/api/branch-admin-scope.spec.ts` (7), e2e in `users.spec.ts` (3) and `responsive-and-a11y.spec.ts` (2 new screens, desktop + phone). They were seen failing against the slice-2 build first (branch-admin-scope: 6 of 7 failed for the right reason). Subset runs: unit+integration+api projects 736 passed, 1 failed (`branches.spec` "demoting an admin…", which relied on the old meaning that a role change ends authority; rewritten: a role change alone keeps it, clearing the flag or deactivating the last membership ends it); e2e subset (users, branches-page, shell, responsive-and-a11y, sign-in): 241 passed, 4 failed, 15 skipped: the same branches test, the Edit-dialog hint text my change altered (test updated), and **one unexplained failure**: `e2e/branches-page "shows every branch with its real member count"` saw 23 members where the database had 24 a moment later; it passed alone (16 passed) and I have not found who wrote the extra membership. Watch for it in the full run; do not treat a pass as an explanation.
- Full-suite result (2026-10-11, HEAD `539574d`, `pnpm build` first, one worker, run alone except for short Octalve doc/test-writing work in another repo): **1143 passed, 0 failed, 18 skipped (the 18 are the same designed viewport-specific skips as before), 1.0 h.** The earlier unexplained failure (`e2e/branches-page "shows every branch with its real member count"`, 23 vs 24 members) did **not** recur; that is not an explanation, only an absence. Candidate cause, unproven: a membership written by another process between the page render and the test's own count. If it recurs, capture the rows before assuming a code fault. Not run: mutation passes (end of Phase 2).
