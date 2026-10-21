# 0036: Only an API path with a percent sign comes through the proxy

- **Period / Focus:** 2026-10-21 (the twin of Octalve Edu's task 0021, module A)
- **Status:** In progress (written and verified on branch `claude/fix-proxy-api-matcher`; PR pending)
- **Priority:** High (a request body that never ends was never answered)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; branch `claude/fix-proxy-api-matcher`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A request body that never ends is answered with the route's own refusal (a 413 straight after the cap), as before the proxy was given the API.

## 2. Context & Related Docs
- `src/proxy.ts` is given the API by a matcher entry only so that a badly encoded path (`%ff`, a lone `%`) is refused with a 400 before Next's own bare 500. A request that goes through the proxy is buffered by Next until its body ENDS before the route runs, so a body that never ends was never answered and the routes' own size cap (`readBoundedText`, task 0034) never got its say.
- Octalve Edu found this (its task 0021, a failing test on its `dev`); this repository had the identical entry, marked "check first, not verified" in `docs/HANDOVER.md` section 6.0. It is now verified here.
- Next's `proxyClientMaxBodySize` does not help: past the limit the clone is ended, but the original request is still awaited to its end.

## 3. Work Breakdown
- [x] The API entry of the matcher is `/api/(.*%.*)`: only a path that contains a percent sign (the only kind that can be badly encoded) comes through the proxy. The comment in `src/proxy.ts` says why.
- [x] `tests/api/body-cap-stall.spec.ts` (new, the twin of Octalve's `body-cap-chunked.spec.ts`): a small body is judged on its fields; a finished chunked body over the cap is a 413; a chunked body that passes the cap and never ends still gets its 413 within 10 s; the server still answers afterwards.
- [x] `tests/integration/proxy.spec.ts`: every API entry of the matcher demands a percent sign, an ordinary API path does not come through and one with a percent sign does.
- [x] Catalog row (`docs/functions/shared.md`), `docs/HANDOVER.md` section 6.0, `docs/open-items.md`.
- [x] `fail()` and the payment webhook give every 413 `Connection: close`; `tests/api/body-cap-stall.spec.ts` has two more tests (the header; eight rounds of an oversize body by length, an oversize chunked body, then an ordinary request, none reset) and `tests/unit/api-infrastructure.spec.ts` one (only a 413 carries it). **Why:** found by the whole-suite run of this change. Without the proxy reading the body, an oversize body is refused while the client is still sending, and the next request on the reused connection could be reset (`branch-gate-both-sources.spec.ts`, the test after its 1 MiB-body test: failed in 4 of 6 repeats here, passed 4 of 4 on an unmodified `dev` build). A throwaway probe compared ways of refusing: cancelling or not cancelling the stream made no difference (reset in 6 of 9 and 5 of 9 runs), a background drain still failed when the client's loop was busy, every variant with `Connection: close` was clean (25 of 25 informative runs).
- [ ] A request whose path does contain a percent sign still goes through the proxy, by design (the check above needs it). Longer-term options are in Octalve's task 0021.

## 4. Unified Verification & Quality Gates
- Failing first, on a production build of `dev` (`dfb78d5`) with only the new spec: the stall test failed (no answer within 20 s); the three other tests of the spec passed as controls.
- Failing first for the `Connection: close` change, on the build of the branch before it: the header test failed (`keep-alive`) and the eight-round test failed (6.2 s); the four earlier tests of the spec passed. After: the stall spec and the `fail()` unit test 30 passed; `branch-gate-both-sources` repeated 6 times 31 passed.
- On the fixed build: `body-cap-stall` (4), `path-id-fuzz`, `proxy` (in-process, with the two new guards): see the PR for the counts. The guard fails against the old matcher.
- Not run: the e2e and https projects; a full suite on the branch (see the PR).
