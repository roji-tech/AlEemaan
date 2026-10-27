# 0038: One shared reader for a request body (`readJsonBody`, `readJsonObject`)

- **Period / Focus:** 2026-10-22 (the twin of Octalve Edu's task 0021, module B and C; register row ISS-0027 there)
- **Status:** Completed and merged (PR #85; verified below)
- **Priority:** Medium (a missing size cap and a 500 for a body that is not JSON on 51 routes)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; branch `claude/shared-body-reader`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Every route that reads its own request body reads it in one shared way: bounded (1 MiB, 413), parsed once, a NUL character refused (400 `VALIDATION`), and a body that is not JSON, or not an object where the route needs one, a 400 `INVALID_BODY` instead of a server error.

## 2. Context & Related Docs
- 51 route files (of 128) did `await req.json()` themselves: 28 inside their own try/catch (a body that is not JSON was a 400 in the wording each route chose), 23 inside the route's outer try (a body that is not JSON was a 500, and `null` reached `body.branchId` as a TypeError, also a 500); two of the 51 have an optional body that ignored a bad one. A body that was not bounded was read whole by the route: `withAuth` and the branch gate read a COPY of it to judge it, so a route behind them was spared the cap only when the gate happened to refuse first.
- `validate()` (a declared schema) already had the cap, the NUL scan and the 400; this moves the same reading into `readJsonBody()` and has `validate()` call it, so there is one implementation. Octalve Edu did this for its 16 routes (PR #57, `readJsonBody`); this port adds `readJsonObject()` for the routes that look for a `branchId` first.
- The matcher change of task 0036 removes the proxy buffering that made a body which never ends unanswerable; the bounded read here is what then gives such a body the route's own 413 on these routes.

## 3. Work Breakdown
- [x] `readJsonBody(req, cap = MAX_BODY_BYTES)` in `src/lib/api/validate.ts`: bounded read (`readBoundedText`), JSON.parse, NUL scan; 413 `PAYLOAD_TOO_LARGE`, 400 `INVALID_BODY`, 400 `VALIDATION`. `parseRequest()` calls it.
- [x] `readJsonObject(req, cap)`: the same, and a body that is not a JSON object (an array, a string, a number, `null`) is 400 `INVALID_BODY`. Used by the routes that read `body.branchId` before their schema.
- [x] The 51 route files use them: 37 with `readJsonBody` (sign-in, password, two-step verification, invitation, profile, setup, portal and the staff routes that declare a schema), 12 with `readJsonObject` (the routes that look for a `branchId` before their schema), and the two optional-body routes below; a refusal that has to give a rate-limit slot back (`email-change/request`, `login/mfa`) still does; the portal routes' refusals stay `no-store`.
- [x] The two routes with an optional body (student restore, dispatch retry) read the text through `readBoundedText`: over the cap is a 413, an empty or non-JSON body keeps the default.
- [x] `tests/unit/route-body-guard.spec.ts` fails on a route or library that reads a request body straight from the request.
- [x] `tests/api/own-body-routes.spec.ts`: a sweep over the route files that use the readers (found by reading the source): a body that is not an object, not JSON or empty is never a server error, on every route; on the routes without an id in the path the exact answers (413 over the cap, 400 `VALIDATION` for a NUL character, 400 `INVALID_BODY` for a body that is not JSON); the payment webhook; the two optional-body routes.
- [x] Docs: catalog row (`docs/functions/shared.md`), `docs/open-items.md`, `docs/tasks/current-tasks.md`, the progress tracker, `docs/HANDOVER.md`.
- [ ] Open: a central 400 in `withAuth` for a body that is not JSON was considered and not done: the routes need their own refusal (some give a rate-limit slot back, some are `no-store`), and the reader gives the same answer everywhere.

## 4. Unified Verification & Quality Gates
- Order: `tsc` (ignoring the known `LayoutProps` error), eslint, prettier, the catalogs, `pnpm build`, then the specs.
- Failing first: the guard and the sweep (with the promotion specs of task 0037) on a production build of unmodified `dev` (3fff09e): the guard's two tests failed, the sweep's route-finding test failed, and the optional-body 413 test failed; the per-route "never a server error" tests passed as controls on routes that already caught a bad body.
- On the branch (production build, rebased onto `dev` after PR #84): the guard and the sweep 153 passed, 0 failed before the rebase; after it the guard, the sweep, the promotion unit and api specs and the `fail()` unit spec 208 passed, 0 failed (setup, unit and api projects); `tsc` (ignoring the known `LayoutProps` error), eslint, prettier and the catalogs (396 rows) clean; `pnpm build` clean; the first run of the sweep found three faults in the spec itself, not in a route, fixed here: a route that uses `readBoundedText` was in the list of routes expected to use the readers; routes that limit attempts per account (they call `reserveAttempt`) used up their attempts in the "never a server error" test, so their exact-answer tests now run as a fresh administrator; and the restore route's 413 test used a made-up student id, which the route refuses (404) before it reads the body, so it uses a real record.
- Not run: the e2e and https projects; the whole setup, unit, integration and api projects on the branch; a full suite on the merged `dev`.

## 5. Notes
- A NUL character in the sign-in, password-reset and other public routes' bodies used to reach the schema (a wrong-credentials answer, for instance); it is now the reader's 400, as it is for every route behind `withAuth` (task 0035).
- `null`, `[]`, `"text"` and `7` as a body are 400 `INVALID_BODY` where the route needs an object, and the route's own refusal where a schema judges them (the sign-in routes keep their uniform answers).
