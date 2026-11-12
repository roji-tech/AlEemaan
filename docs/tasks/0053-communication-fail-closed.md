# 0053: The Communication senders fail closed: a missing provider key is a failed send that says so, not a "sent"

- **Period / Focus:** 2026-11-12 (the maintainer: "what's the current state of emailing?", then "fix defect")
- **Status:** Built and tested; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/email-fail-closed` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On a server where no email, SMS or WhatsApp provider key is set, a broadcast or an alert must be recorded as **failed, with the reason**, and the Broadcast screen must say so. Today it is recorded as **sent** and the screen says "successfully dispatched", although nothing left the server.

## 2. Context

Found on 2026-11-12 while answering "what is the state of emailing?" (read from the code and from the variable names, never the values, of the hosted Vercel project):

- `src/lib/communication/gateways/email.ts` (`sendEmail`) and `termii.ts` (`sendTermiiMessage`, used for SMS and WhatsApp) fall back to an in-memory "mock store" and return `success: true` whenever `RESEND_API_KEY` or `TERMII_API_KEY` is missing, whatever the environment. `broadcastMessage` (`service.ts`) turns `success` into `SENT`; `retryDispatch` does the same.
- **Hosted today:** the Vercel project has neither `RESEND_API_KEY` nor `TERMII_API_KEY`. So every broadcast sent from the hosted site shows `SENT` in the dispatch log and delivers to no one, and nothing on the screen says email is not set up.
- The Broadcast Composer says "Broadcast successfully dispatched to N recipient(s)!" using `count`, which is the number of dispatch rows made, not the number sent. So even a send that did fail would be reported as a success.
- The account mail (`src/lib/email/transport.ts`: invitations, password reset, notices) is **not** affected: it already logs a production warning, and a failed send there is swallowed on purpose (no account-existence oracle). Not changed.
- `src/lib/dev-tools.ts` is already the one gate for "is this a development or staging build" (`devToolsEnabled(env)`, pure, fails closed to production). It is reused.

## 3. Decisions

- **D1. One rule, stated once.** `src/lib/communication/gateways/stand-in.ts`: `standInAllowed(env)` is true only for `NODE_ENV=test` and where the dev tools are on (a developer's machine, or a staging build with `DEV_TOOLS=true` and its token). Production is never allowed, with or without `DEV_TOOLS=true`. A pure function of the environment, unit-tested over the matrix.
- **D2. Fail closed.** No key and no stand-in allowed: `sendEmail` and `sendTermiiMessage` return `success: false` with a sentence naming what is not set up and the variable ("Email is not set up on this server (RESEND_API_KEY is not set). Nothing was sent."). The dispatch becomes `FAILED`, the sentence is its `lastError` (shown in the dispatch details), and **Retry works once the key is set**. A key that IS set behaves as before. The stand-in itself (tests, development, staging with dev tools) behaves as before, so the whole existing test suite and the walkthrough are unaffected.
- **D3. The result says what happened.** `broadcastMessage` returns `sent`, `failed` and `firstError` besides `count`. The Broadcast Composer shows the success sentence **only** when nothing failed; when something failed it shows an error that says how many were sent, how many failed and why, and points to the dispatch log; the form is **not** cleared when nothing was sent, so the text is not lost. The API answer keeps its shape (the new fields are added).
- **D4. Same words and rule in Octalve** (task 0054 there), designed once.
- **D5. Mutation passes are deferred** to the end of PHASE 2 with all the others (the maintainer's call); said here, not skipped silently.

## 4. Work breakdown

- [x] Design (this file).
- [x] `stand-in.ts`; `sendEmail` and `sendTermiiMessage` use it.
- [x] `summariseDispatches` (pure) and `broadcastMessage` returns `sent`, `failed`, `firstError`.
- [x] Broadcast Composer: honest messages; stays on screen, with the text kept, when anything failed.
- [x] Tests: unit (the environment matrix of `standInAllowed`; `sendEmail`, SMS and WhatsApp in production with and without a key; the dispatcher; `summariseDispatches`), API (the broadcast answer has the new fields; a production-shaped server records `FAILED` with the reason for email, SMS and WhatsApp; a retry stays `FAILED`; the in-app channel is sent), browser (the composer's three outcomes, with the API answer replaced).
- [x] Docs: this file, tracker, `docs/open-items.md`, `.env.example` (`RESEND_API_KEY` and the Termii variables are now listed, with what a missing key does).

## 5. Not in this task

- Sending real mail: no key exists to try it with. **Not tested against Resend or Termii**, and not claimed.
- A background queue, batching or a time limit for a large broadcast (it still sends inline, one at a time).
- Verifying the default sender domain, setting `APP_URL`, or adding any variable on the hosted project: the maintainer's (a Resend account and verified domain first).
- The account mail transport (see section 2).

## 6. Build record and tests

**Static gates (on `claude/email-fail-closed`, in the order tsc, lint, build, tests):** `tsc --noEmit` clean; `pnpm lint` 0 errors (2 warnings that were there before, in `src/app/video-guide/page.tsx`); Prettier `--check` clean on the changed code files; `pnpm build` succeeded (twice: once for the first version of the composer, once after it was changed, below).

**What the first test run found (7 failures out of 36), and what was done about each.** None was fixed by loosening an assertion.

1. **Four existing unit tests and two existing API tests had only ever passed because of the bug.** The suite declares itself production (`tests/support/env.ts` sets `APP_ENV=production` for every test process and for three of the five servers on purpose), where, with no provider key, a send used to be recorded as sent. With the fix it fails, as it should. Those tests now run where the stand-in is allowed: the unit file sets a staging environment with the dev tools on for its own run and restores it; the two API tests (`broadcast campaign...`, `retry dispatch...`) run on the staging-mode server (the one the dev inbox tests already use). Their assertions are unchanged, and the API test now also asserts the new `sent`, `failed` and `firstError` fields.
2. **My browser spec lost the message it was looking for, and this was a finding about the product.** After any answer from the server the Communication panel switches to the dispatch-log tab (`onSuccess={() => setActiveTab("logs")}`), which unmounts the composer: the old "successfully dispatched" sentence was never on screen long enough to read, and the failure message would have gone the same way. So the composer now stays, with the text kept, when anything failed; when everything was sent the panel moves to the log as it always did. The spec asserts both.

**Final run** (unit, api, e2e-desktop and e2e-mobile; the changed specs and the two other API specs that broadcast, `cross-branch-isolation` and `branch-gate-both-sources`; `communication-a11y`): **49 passed, 0 failed.**

**Regression proof (old gateways put back, the new unit spec run): 3 failed, 18 passed.** The three failures are the production tests (email, SMS and WhatsApp, the dispatcher); the 18 that pass are the tests of unchanged behaviour (the stand-in where it is allowed, a set key, the in-app channel, an invalid address, the pure matrix and the summary). Not run on the old code: the API and browser tests of the new behaviour (they would need the old build); the new API tests assert `FAILED` where the old code gave `SENT`.

**Not run, and not claimed.** The whole suite; mutation passes (deferred to the end of PHASE 2 with all the others, D5); any send through the real Resend or Termii (no key exists to try it with); how a large broadcast behaves (it still sends inline, one message at a time).
