# [0006]: Branch administrators and superadmins (build of design S1–S8)

- **Period / Focus:** 2026-10-11 → (authorization model change on the live-school codebase)
- **Status:** In Progress
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
- [ ] `withAuth({ superAdmin: true })`
- [ ] Members / invitations routes: branch admin acts on own branch only, roles below ADMIN only, no `CAN_MANAGE_USERS`
- [ ] Last-superadmin rule (`LAST_SUPERADMIN`), counted by person under a lock; grant/revoke superadmin (password re-type, audited)
- [ ] `scripts/make-superadmin.mjs` and `pnpm superadmin:make`; setup wizard marks the first administrator a superadmin

### Module C: The other admin routes (slice 3) — review list of the `Role.ADMIN` sites
- [ ] students (create/update/archive/restore/import), attendance, academics sessions/periods → `canAdminister(branch)`
- [ ] branches, school settings → superadmin only
- [ ] sign-in shorter admin session, page session (`isAdmin`), Users page
- [ ] route-role guard: second assertion (a handler that takes a branch must call `canAdminister` / `resolveBranchRole`)

### Module D: Docs
- [ ] New ADR (Proposed), plan "As built", progress tracker, tests/README, issues ISS-0013, this file's results

---

## 4. Unified Verification & Quality Gates
- [ ] `tsc --noEmit`, lint, `format:check`, `pnpm build`, tests (gate order)
- [ ] Full one-lane suite — **not run yet**
- Mutation pass: not run — pending, end of Phase 2 (targets: backfill predicate, last-superadmin count, branch comparison in `canAdminister`, "cannot touch an admin").

---

## 5. Notes, Findings & Deviations
- Slice 1 is deliberately behaviour-neutral for the live school: the flag is added and read, every admin is a superadmin, so every route answers as before. Branch admins only come into being once slice 2 lets a superadmin demote someone; the interim rule must not be loosened before `canAdminister` guards the admin routes (slice 2–3).
- Slice 1 results (2026-10-11): `tests/integration/super-admin.spec.ts` 6 passed; regression subset (api attendance/students/members/invitations/branches/school-settings/setup, integration members/deactivated-members/with-auth/super-admin, unit) on ONE worker: 326 passed, 1 failed before the fix below. The failure was `attendance › an administrator still reaches every branch`: that test minted an ADMIN membership by hand, which is now a branch admin; it is split into "a branch administrator reaches their own branch and gets 404 for another" (new behaviour) and "a superadmin reaches every branch" (old behaviour, explicit); `attendance.spec.ts` 18 passed. (A first attempt with `--workers=2` produced 6 failures; the specs share one test database and reset it, so they must run on one worker — my mistake, not a code fault; all passed alone.)
- The new tests were written before the code but could not run until the column and helpers existed, so no 'seen failing' run exists for them; the migration test asserts the predicate on active, deactivated, teacher, parent, no-membership and two-admin-memberships people, and the mutation pass (end of Phase 2) targets it.
- The full suite has NOT been run on this branch.
