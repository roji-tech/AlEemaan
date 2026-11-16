# 0081: CI goes green: `next typegen` before `tsc`, and the multipart test that Node 24.22 blames on its neighbour

- **Period / Focus:** 2026-11-16 (task 0079's first CI runs were red on every PR; the maintainer: "go" to fixing it)
- **Status:** Built (the record is section 4)
- **Priority:** Medium (every pull request showed two red checks for reasons that had nothing to do with it)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/ci-typegen-flake` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The two GitHub checks of task 0079 (`Typecheck, lint, format` and `Build and unit tests`) pass on a clean checkout, so that red means a real problem.

## 2. Findings

- **F1. `tsc` needs `next typegen` first.** `src/app/layout.tsx` uses the global type `LayoutProps`, which Next writes into `.next/types` (a build or `next dev` does it; a clean checkout has none). CI said `error TS2304: Cannot find name 'LayoutProps'`. Verified earlier in a clean checkout: one step before `pnpm typecheck` fixes it.
- **F2. One unit test failed only on the runner's Node.** `report-card-payment-gate.spec.ts:87` failed with `TypeError: Invalid state: ReadableStream is already closed`, a test that has nothing to do with streams, while the same tree passes locally. Found by experiment on the runner (throwaway branch, since deleted):
  1. A small script that reads a streamed request body past a cap and cancels it (what `readBoundedBytes` does) printed no error on Node 24.11.1 or 24.22.2.
  2. The two spec files together, one worker, passed on 24.11.1 and **failed on 24.22.2** (the runner's version; the maintainer's machine has 24.11.1).
  3. Pairing each `read-body.spec.ts` test with the failing one: only the third, "a multipart form is parsed only after it is known to fit", reproduces it.
- **Cause (what is known and what is not).** That test builds its request from a `FormData` object (`new Request(url, { body: formData })`) and reads it with a cap of 50 bytes, so the reader cancels a body that is too big. A body made from `FormData` is generated lazily by Node's fetch (undici); on 24.22 cancelling it early makes that generator close a stream that is already closed, an error Node raises outside any promise, which Playwright reports against whichever test is running next. That is a defect of that Node version's handling of a `FormData` body, not of `readBoundedBytes`: a real upload arrives as a network stream and the first two tests, which cancel a streamed body, do not trigger it. I did not read undici's source to confirm the mechanism; the bisect shows the trigger, not the line.

## 3. Decisions

- **D1. The test stops using a `FormData` body.** It encodes the form once (`new Response(formData).arrayBuffer()`) and sends those bytes with the multipart `Content-Type`, which is what a client puts on the wire. Everything the test asserts is unchanged (it parses, the 50-byte cap is `TOO_BIG`, a wrong type is `NOT_MULTIPART`, garbage is `UNREADABLE`); one assertion is added so that 50 really is below the form's size.
- **D2. No retry, no skip, no Node pin.** The repository's policy is that a flaky test is understood, not retried; pinning CI to 24.11.1 would hide the difference from the version the maintainer's hosting runs.
- **D3. `read-body.ts` is not changed.** Its behaviour is the same on both versions for every real input; only the test's way of building a body was fragile.
- **D4. The spec was not Prettier-clean at `HEAD`** (two lines over 140 columns), and CI's format check covers the files a pull request changes, so the whole file is formatted; the two reformatted lines are not mine.

## 4. Build record and tests

Record filled in after the first CI run of this branch (see the pull request): `ci.yml`'s two checks on Node 24.22.2.

**Not run, and not claimed:** the other CI-only differences between Node versions; the rest of the unit project on 24.22.2 other than through this branch's CI run; mutation passes (deferred). No application code, schema, migration or environment change.
