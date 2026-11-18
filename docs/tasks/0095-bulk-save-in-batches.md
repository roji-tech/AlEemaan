# 0095: A bulk file is saved in batches of 20, in the background, so a large file no longer fails as one long transaction

- **Period / Focus:** 2026-11-18 (the maintainer: "is there a way we can do the saving batch by batch and also push it to the background"; the production log showed `P2028` for a 144-pupil file)
- **Status:** Done in code; the browser run is recorded in section 7
- **Priority:** High (a real upload failed and nothing was saved)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/bulk-batched-save` / PR #276 into `dev` (it carries #275's commits: the review layout and the branch chip)
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Saving a file of 144 pupils must work. A person can keep working while it saves, sees how far it has got, can stop it, and a failure part-way never loses what was already saved nor what is still on screen.

## 2. What went wrong

The save was ONE request and ONE database transaction for the whole file. The server runs in Washington (iad1) and the production database in Frankfurt (Neon `eu-central-1`), so every query in the transaction pays an ocean crossing. 144 pupils ran past Prisma's interactive-transaction limit (`timeout: 60000` in `src/lib/db.ts`) and the log said `P2028`; nothing was saved and the person saw "Something went wrong. Nothing was changed."

## 3. Decisions

- **D1. The browser sends the rows in batches of 20** (`BATCH_SIZE` in `src/lib/bulk/batches.ts`, `chunkRows`), each its own request and its own transaction, one after the other. No request is long. The server is unchanged in kind: every batch goes through the same `runBulk` rules, which re-validate every row (the whole file was already checked in one dry run).
- **D2. This replaces "all or nothing per request" (task 0084, D3) for the whole file**, not for a request: a failure at batch 4 leaves batches 1 to 3 saved. The message says how many were saved; the rows not saved stay on screen and can be downloaded as a CSV.
- **D3. The loop lives in the app shell, not in the dialog** (`BulkJobsProvider` in `src/components/bulk/BulkJobs.tsx`, mounted in `(app)/layout.tsx`). Closing the dialog ("Keep working") or moving to another page does not stop it. A panel in the corner (`role="region"`, "Saving in the background") shows a native `<progress>` and "N of M saved".
- **D4. Stopping.** "Stop after this batch" stops after the batch in hand. Closing or reloading the tab is asked first (`beforeunload`); it cannot be prevented, so the message says what is saved.
- **D5. A row saved is never sent again.** On a stop or a failure the dialog (if still open) removes the saved lines from its rows and verdicts; the rest can be edited and saved again.
- **D6. The review is responsive** (the same task): List (a table in its own scroll area with a sticky header and a sticky Row column) and Grid (compact cards), with the app's List/Grid toggle. "What needs fixing" appears only for a problem repeated on two or more rows; a problem about the active academic session links to Academics > Sessions.
- **D7. Rate limits** of the five import routes were raised to 150 requests a window (the invitations route keeps 20 for saves), because one file is now several requests.
- **D8. The real cure for the slowness is the function region** (PR #278, `vercel.json` `regions: ["fra1"]`, next to the database). Batching is what makes a file work whatever the latency; the region makes each batch fast.

## 4. Where else a long transaction exists (answer to "do we need batching in other parts?")

Promotion, `generateInvoices` and the attendance register each do many writes in one transaction. They are bounded by a class or a branch rather than by a file a person chooses, and the region change cuts their time by the same factor. They are listed, not changed here; if a log ever shows `P2028` on one of them it gets the same treatment.

## 5. Work

- [x] `src/lib/bulk/batches.ts` and `tests/unit/bulk-batches.spec.ts`
- [x] `src/components/bulk/BulkJobs.tsx` (provider, tray, stop, download of the rest) and its mount
- [x] `BulkImportDialog` uses it; `BulkReview` List/Grid and the repeated-problem summary
- [x] Rate limits; API specs updated (`students-bulk`, `fees-bulk`, `staff-bulk`, `invitations-bulk`)
- [x] `tests/e2e/bulk-batched-save.spec.ts`, `bulk-review-layout.spec.ts`; `students-screen.spec.ts` brought up to date (it still described task 0090's old wording)
- [x] Docs: this file, `docs/components/shared.md`

## 6. Not done

- A save is not resumed after a closed tab: the rows are in the browser, so a reload loses the loop. What was saved stays saved; the person uploads the file again and the duplicates are reported by the normal rules.

## 7. Record of the runs (2026-11-18)

- Unit: 32 passed. API (students, staff, fees, invitations bulk): 37 passed.
- Browser, desktop (bulk-batched-save, bulk-review-layout, classes-subjects-bulk, staff-bulk, users-bulk, fees-bulk, students-screen): the first run had 9 failures (seven strict-mode duplicates of the problem summary, one dialog close rule, one stale students-screen expectation); after the three fixes, **33 passed, 0 failed, 0 flaky** (6.3 min, from `E.log`).
