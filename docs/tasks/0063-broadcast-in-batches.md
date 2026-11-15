# 0063: A broadcast is sent in batches of ten, with progress, and carries on where it was cut off

- **Period / Focus:** 2026-11-12 (the maintainer's idea: "segment the sending of the message on the front end ... 10 per queue ... send it 10 10 ... as soon as the page for messaging loads, we check if there are messages that are yet to be sent or that have been cut off ... an info message like sending, which can also show the progress"; recommended and approved with "GO")
- **Status:** Done (built and tested; Octalve's version is task 0058 in its own repo)
- **Priority:** High for a school with more than a few dozen guardians (a broadcast to 200 people was one request that sent one message after another)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/broadcast-batches` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`broadcastMessage` (`src/lib/communication/service.ts`) used to make one `NotificationDispatch` row per recipient and send it, in a loop, inside ONE request. For 200 guardians and a provider that answers in about a second, that is minutes in a function that is cut off after seconds: the request ends, the rows not yet sent stay `QUEUED`, and nothing in AlEemaan takes them out of the queue. Now:

1. **The broadcast writes every row first** (one `createManyAndReturn`), **sends the first batch (ten, at the same time) and answers** with `count`, `sent`, `failed`, `firstError` and the new `queued`. A broadcast to ten people or fewer is delivered before the answer, as it always was.
2. **The Communication screen sends the rest.** `POST /api/v1/communication/queue/next` takes the branch's next ten waiting rows, sends them and answers `{ claimed, sent, failed, remaining, firstError }`. A hook (`useQueuePump`) calls it again and again while `remaining` is above zero; a line above the tabs (`SendingProgress`) says "Sending messages: 40 of 200 · 2 failed", with a progress bar, that the other tabs may be used, and what happens if the page is closed.
3. **It carries on after a cut-off.** When the screen opens, `GET /api/v1/communication/queue?branchId=` says how many messages wait; if any, the same hook sends them. A closed tab, a lost connection or a function that died leaves rows `QUEUED` (or `PROCESSING` past its lease), and the next time Communication is opened, by anyone who administers the branch, they are sent.

## 2. Decisions (mine; the maintainer approved the approach and may correct the details)

- **D1. The server is the source of truth, not the browser.** The maintainer's idea allowed "local storage, or the server if possible". Local storage is per browser (another administrator or another device would not see a half-sent broadcast), would put 200 guardians' phone numbers and the message in browser storage on a shared school computer, and the browser would be choosing recipients. Here the rows are in the database; the browser only says "send the next batch" and never names a person.
- **D2. A row is taken by one call only.** The claim is a compare-and-swap on `(status, updatedAt)` (`updateMany` where the row is as it was read); the call that changes it sends it. Two tabs, two administrators or a retry cannot send a message twice. The claim moves `updatedAt`, which is the lease of a `PROCESSING` row: a call that died mid-send leaves rows `PROCESSING`, and they are taken again after 10 minutes. Delivery is at-least-once (a call that dies after the provider accepted a message and before `SENT` is written sends it again after the lease).
- **D3. Batch of 10, sent together** (`Promise.all`): a batch takes about as long as its slowest message, so it fits a short function, and one batch is the first thing a broadcast sends. The size is `BATCH_SIZE` in `queue.ts`.
- **D4. A failed message is `FAILED` at once**, with its reason, as AlEemaan always did; the administrator retries it from the log (`retryDispatch`, unchanged). No automatic retries here (Octalve's task 0057 has a back-off because it has a scheduler).
- **D5. What the answers hold.** Counts and the reason of the first failure, never an address or a message. A sender that throws is a failed message (a fixed sentence), not a failed call: the other nine are still sent and recorded.
- **D6. The screen can be left; the sending stops when the page is closed.** That is the browser's limit, said on the screen, and the reason a scheduler would be a better engine (not built here: the maintainer's hosting plan decides it; AlEemaan has no cron route). Nothing is lost when the page closes.
- **D7. Who.** Administrators of the branch only, as the broadcast itself (`withAuthGated("administer")`, `roles: [ADMIN]`); the branch must be named; another branch's rows are never counted or sent.
- **D8. Not changed:** the audience resolution, the tags, the template system, `retryDispatch`, the dispatch log, the other senders of messages (the automatic alerts are not in AlEemaan).

## 3. Work breakdown

- [x] Design (this file).
- [x] `lib/communication/queue.ts` (`sendNextBatch`, `countWaiting`, `BATCH_SIZE`, `LEASE_MS`), `broadcastMessage` writes all rows and sends the first batch, the two routes, `useQueuePump`, `SendingProgress`, the panel and the composer.
- [x] Tests: integration on the real database, API (who may call, counts only, a broadcast to 25 leaves 15), end-to-end (the line in each state, in both themes, desktop).
- [x] The tests pass on the built branch, together with the existing communication specs.
- [x] Docs: the function catalogue, the component catalogue, the tracker.

## 4. Not in this task

- Octalve (its own task: a `send-next` route for the signed-in school that reuses its drain, and sending a small audience at once; its daily cron stays as the safety net).
- A cron route for AlEemaan (the maintainer's hosting plan decides how often one may run); automatic retries of failed messages; phone-width (mobile) browser run of the new line (desktop only here, by decision of speed); mutation passes (deferred to the end of PHASE 2).

## 5. Build record and tests

From the logs of these runs (the AlEemaan test lane, a production build of each state), not from memory.

- **New specs:** `tests/integration/communication-batches.spec.ts` (9: one batch takes ten, oldest first; three calls empty 25 and a fourth finds nothing; a message that cannot be sent is FAILED with its reason and the others are still sent; two calls at once send every row once; a fresh PROCESSING row is left alone and a stale one taken back; another branch's rows untouched; `onlyIds`; a broadcast to 25 writes 25 rows, sends 10 and reports 15 queued; a broadcast to 4 is delivered before it answers), `tests/api/communication-queue.spec.ts` (5: who may call, the branch must be named, counts only on the production-shaped server with the missing-key reason, a broadcast to 25 on the staging-mode server leaves 15 and two calls finish it, another branch's rows), `tests/e2e/communication-batches.spec.ts` (4, desktop: resume on open with progress and the finished line, nothing waiting shows no line, a broadcast to many keeps the composer and sends the rest, a lost connection pauses and Try again finishes; axe in both themes on the sending, paused and finished lines).
- **First run (the new specs plus the existing communication specs): 100 passed, 11 failed. Each read:** (1) two `route-role-guard` rules: the two new routes were not in the spec's list of gated routes (added, with the same reason as the broadcast route); (2) seven of the nine integration specs: the stand-in sender is allowed only in the tests and the dev tools (task 0053) and the setup file blanks the dev tools, so every send failed closed; the spec now sets `NODE_ENV` to "test" for its own process and puts it back; (3) two end-to-end specs: a Playwright glob must match the whole URL, query string included (`**/queue` did not match `.../queue?branchId=...`), and my status locator filtered on the word "messages", which the paused sentence does not contain.
- **A real finding of the second run, fixed:** a sender's own reason can quote the address ("Invalid phone number format: not-a-phone"). The answer promised counts and a reason "never an address" (D5); the batch now replaces the address with "the recipient" in what it stores and answers (`withoutAddress` in `queue.ts`), and the integration spec says so.
- **Second run (only the new specs and the route guard): 24 passed, 2 failed** (that finding, and the locator); **final tree: the existing communication specs (unit, integration, api, e2e desktop), `route-role-guard`, `branch-gate-both-sources`, `cross-branch-isolation` and the three new specs: 111 passed, 0 failed (2.3 minutes).**
- **Gates:** `tsc --noEmit` 0; `eslint` on the changed files 0; `prettier --check`; `next build` 0 (three times); `verify_catalogs` 742 rows, 0 missing.
- **The new specs were not run against the unfixed code** (this is a new feature: `queue.ts` and the routes did not exist, so the specs cannot compile or reach them there); the existing broadcast specs were run against the changed code and pass unchanged, which is the check that a broadcast to ten or fewer behaves as before.
- **Not run, and not claimed:** the whole suite; the phone-width run of the new line (desktop only, for speed); a real send through Resend or Termii (no key exists); two real browsers sending at once (the claim is tested with two calls at once on the real database); mutation passes (deferred to the end of PHASE 2).
