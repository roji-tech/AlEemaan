# 0035: A NUL character in a request's query string or JSON body is refused before the handler

- **Period / Focus:** 2026-10-21 (follow-up of the bug hunt: input the database cannot store; the twin of Octalve Edu's task 0019)
- **Status:** Completed (merged into `dev` on 2026-10-21 as PR #79, 01:41 UTC; the whole API, integration and unit projects were run on the branch, the e2e and https projects were not, see section 4)
- **Priority:** Medium
- **Assignee:** Agent (Claude); merged under the standing authority to merge into `dev` after the checks pass (Vercel SUCCESS, `base.ref` checked to be `dev`)
- **Target Branch / PR:** `dev`; PR #79 `claude/fix-nul-in-input`, listed in section 6

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A request that holds a NUL character, where the database cannot store one, is a bad request (400) refused centrally, after the checks that say who may be here and before any handler runs, and not a 500 that depends on which route happened to look at the value.

## 2. Context & Related Docs
- PostgreSQL cannot store a NUL character in text or JSON, so a request that held one and reached a query came back as a 500. The routes disagreed about it: some refused the value with a check of their own, some did not. The path was already covered by `sanitizePathParams` (a NUL in a path segment becomes a stand-in no id equals, and the route answers its own 404).
- Octalve Edu has the same rule since its PR #49 (task 0019 there); `src/lib/api/no-nul.ts` is the same file in both repositories, on purpose (Octalve's design is canonical for shared parts).
- Builds on task 0034 (PR #73): the body of a request is read through `readBoundedText`, which this change reuses for the scan.
- In this repository 51 of the 128 route files read their request body themselves and only 46 use `validate()`, so a scan inside `validate()` alone would have left most of the create routes uncovered. `withAuth` is the one place every route behind it (`withAuth`, `withAuthGated` and `withBranch` all go through it) already passes, so the scan is there. Octalve Edu scans the body in `validate()`; the routes there that read their own body can adopt this approach.

## 3. Work Breakdown

### Module A: The scan (`src/lib/api/no-nul.ts`, new)
- [x] `holdsNul(value)` looks at keys as well as values, at any depth, and is iterative, so a body a million levels deep cannot overflow the stack (a recursive walk would have been a 500 of its own). `NUL_MESSAGE` is the one constant answer; it says nothing about the database.

### Module B: Where it runs
- [x] `withAuth` (`src/lib/auth/with-auth.ts`), after CSRF, session and role and before the handler: a NUL in the query string (a key, or any one of several values) is 400 `VALIDATION` naming "query"; a NUL in a JSON body of a state-changing request is 400 `VALIDATION` naming "body". The body is read from a COPY of the request (`readBoundedText(req.clone(), MAX_BODY_BYTES)`, the way `withAuthGated` already reads the branch a body names), so the handler still reads its own whole body. A body that is empty, is not JSON, or is longer than the cap is not judged here: the route (or `validate()`) says what is wrong with it.
- [x] `validate()` (`src/lib/api/validate.ts`) refuses a NUL in the JSON body it parses, before the schema, so a handler composed without `withAuth` is held to the same rule and the rule is unit-tested on its own.
- [x] A value with a NUL is refused, never stripped or replaced. Other control characters (tab, line break), invisible characters and the six characters of an escape are text and pass (a spec stores a notice with a line break and a tab, and one with an escape's text, and reads them back).

### Module C: Tests
- [x] New: `tests/api/nul-in-input.spec.ts` (sweeps over every route found in the route files: the query string with a value, with a key and with one of several values, and a NUL in the body for every method; 12 free-text bodies; look-alikes that must pass and be stored whole; a body that is not JSON is not judged; the routes outside `withAuth`), `tests/unit/no-nul.spec.ts` (5), one test in `tests/unit/api-infrastructure.spec.ts` (`validate()`), five in `tests/integration/with-auth.spec.ts` (the query, the body for every method, the usual refusals come first, look-alikes pass and the handler still reads the whole body, a body that is not JSON goes on untouched).
- [x] Changed on purpose: `tests/api/account-self-service.spec.ts` (a NUL in a profile name is now refused by the central check, whose message is "Some of the fields are not valid.", before the schema) and `tests/api/question-bank-foundation.spec.ts` (a NUL in `?branchId=` is 400 from the scan, not the gate's 404; an oversized id is still 404).

### Module D: Docs
- [x] Catalog rows in the same commit (`docs/functions/shared.md`: `no-nul.ts` new; `with-auth.ts`, `validate.ts`, `read-body.ts`).
- [x] This task file, `current-tasks.md`, `aleemaan_progress.md`, `open-items.md`, `HANDOVER.md` (section 6.0 and the new section 7) and the banner of `CLAUDE.md`.

---

## 4. Verification
- [x] Failing first, on a production build of `dev` (`c93323b`) with the helper and the new specs but NOT the wiring: of 75 tests 19 failed and 56 passed (the controls). The 19: the `validate()` unit test, two `with-auth` integration tests, the two sweeps (the search of the member list and of the student list for a NUL in the query string; the school-settings update and the branch create in the body sweep), all 12 body tests (8 answered 500, 4 a different 400), and two tests of mine that were wrong and are fixed (route-count thresholds that were too high for this repository, and a test that assumed every route answers a client error for a body that is not JSON, now asserting only that the scan does not judge it).
- [x] On the branch's production build, the four new or changed spec files and the setup project: 75 passed, 0 failed.
- [x] The whole setup, unit, integration and api projects on the branch: 1318 passed, 2 failed of 1320 (45.8 min, machine load 8 to 20). The 2 are the two changed tests above, which still expected the old messages; re-run alone on the same build after the update: 2 passed, 0 failed (1.2 minutes).
- [x] `prettier --check` and `eslint` on the changed files: clean. `pnpm build` (type-checks source and tests): clean. Catalog check: no missing, extra, duplicate or broken row.
- [ ] NOT run: the e2e and https projects on the branch (no page changed; the scan runs in route handlers only), and a full suite of every project on the merged `dev` (only the setup, unit, integration and api projects were run, on the branch before the merge).

## 5. Notes
- **Not covered, said plainly:** the routes that are not behind `withAuth` (`webhooks/paystack`, `setup`, `dev/email-inbox`, `verify/[token]`, the portal routes, `invitations` accept and preview, `auth` login, `login/mfa`, `forgot-password`, `reset-password`, `email-change` confirm, `logout`) each refuse by their own checks. Each was tried with a NUL in the fields it reads and none answers 5xx today; the spec keeps that true for 17 combinations.
- **The one visible change for an authorized caller:** a NUL in `?branchId=` is now 400 from the scan instead of the gate's 404 (neither is a 5xx). A signed-out caller is still told 401, a forged cross-origin request 403, and someone who may not be here 403, whatever the address or the body holds, because the scan runs after authorization.
- **Wrong first drafts of two of my own tests**, fixed before the merge: two route-count thresholds (77 routes found, not 80; 354 query combinations, not 360) and a test that assumed every route answers a client error for a body that is not JSON.
- **Open, a separate change:** one shared reader and a central 400 for a body that is not valid JSON (see `docs/HANDOVER.md` section 6.0 and `docs/open-items.md` section 1b).

## 6. Output & Deliverables
- **Pull request, into `dev` (off `c93323b`), merged with a merge commit; the remote branch is kept:**

| PR | Branch | Commit | Merge commit | Opened (UTC) | Merged (UTC) |
|---|---|---|---|---|---|
| #79 | `claude/fix-nul-in-input` | `e22d0f6` | `deb072f` | 2026-10-21 01:39:53 | 2026-10-21 01:41:01 |

- **Merge gate used:** state open, `base.ref` is `dev`, the head is the commit that was verified, the Vercel check (type-check and build of the preview) is SUCCESS, GitHub reports the PR mergeable.
- **Docs:** `docs/functions/shared.md` (catalog rows), this file, `docs/tasks/current-tasks.md`, `docs/development-history/aleemaan_progress.md`, `docs/open-items.md`, `docs/HANDOVER.md`, `CLAUDE.md`.
