# 0059: A refresh after a save blanked the whole Finance screen: the batch result never showed, and the invoice closed after every payment

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's second run of chapter C11 Finance, task 0033, at step 88)
- **Status:** Done
- **Priority:** Medium (nothing is stored wrongly: the invoices are made and the payments recorded. But the one message that says how many invoices were made and how many were skipped is never seen, and the screen jumps after every payment)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/fix-finance-refresh` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On Finance, every save refreshes the data with `FinancePanel.loadData`, which sets `loading = true`; while it is true, the panel shows "Loading finance records..." INSTEAD of the tabs' content. So the whole dashboard, with every dialog that is open inside it, is unmounted and mounted again. Two things the code clearly intends do not happen:

1. **"Batch Generate Invoices" never shows its result.** `BatchInvoiceModal` sets `result` ("Invoicing Complete: N new invoices created, M existing invoices skipped.") and then calls `onGenerated()`, which is that refresh. The dialog and the message are gone before anyone can read them. The person sees the list fill with invoices, and never sees how many were skipped; pressing it a second time changes nothing and says nothing.
2. **The invoice dialog is meant to stay open after a payment or a waiver, with the new figures.** `InvoicesDashboard` does `onRefresh(); handleViewInvoice(selectedInvoice.id)` (refresh, then fetch the invoice again and reopen it). But `onRefresh()` has just unmounted the dashboard that holds that state, so the reopen lands on nothing: the dialog is closed after every payment.

Make a refresh after a save swap the new data in WITHOUT unmounting the screen, so that both work as written.

## 2. Context

- **Found by the walkthrough** (C11 step 88, recon run 11): after "Generate Invoices" the failure screenshot shows NO dialog, and the dashboard behind it already lists the four invoices (₦220,000.00 billed). The chapter had expected the dialog's `role="status"` message. Nothing was wrong with the invoices; the dialog was gone.
- **The chain, read in the code:** `BatchInvoiceModal.handleSubmit` calls `setResult(json.data); onGenerated();` and `InvoicesDashboard` passes `onGenerated={onRefresh}`, which is `() => loadData(selectedBranchId)` in `FinancePanel`; `loadData` starts with `setLoading(true)`, and the render is `loading ? <Loading finance records...> : ... <InvoicesDashboard .../>`. So the dashboard, and the `result` state inside its dialog, are destroyed.
- **No test saw it.** `grep` over `tests/` and `src/`: the sentence "Invoicing Complete" and "existing invoices skipped" appear only in the component. `finance-a11y.spec.ts` opens and scans the dialogs; it never generates.
- **The payment half was first read from the code, then shown:** the browser spec below failed on the unfixed build exactly where the code said it would (section 6).
- **Task 0058 D3 was wrong, and is corrected here.** It left `RecordPaymentModal`, `DiscountModal` and `BatchInvoiceModal` alone "because a save refreshes the whole panel (which remounts them)". That remount is the defect in this task. Once the refresh stops remounting, those three dialogs, which seed their fields once (`useState(String(balanceDue))`, empty reference and note), would show the previous payment's amount, reference and note on the next opening. They must start fresh per opening, as the fee dialog now does. (They were safe only because of the bug.)

## 3. Decisions (mine; the maintainer may correct)

- **D1. A refresh after a save is quiet.** `loadData(branchId, quiet = false)`: the first load and a change of branch still show "Loading finance records..." (there is nothing to show yet); the refresh the tabs ask for after a save (`onRefresh`) passes `quiet = true`, which does not set `loading`, so the current screen stays and the new data replaces it when it arrives. Rejected: lifting the dialogs' state above the `loading` branch (keeps them but still flashes and resets the rest of the screen, and is a bigger change); showing the batch result in a toast (does not fix the invoice dialog).
- **D2. The three dialogs start fresh per opening**, with a `key` counter in their parent, the pattern of task 0058: `InvoicesDashboard` for `BatchInvoiceModal`; `InvoiceDetailModal` for `RecordPaymentModal` and `DiscountModal`. After a payment the pay dialog closes itself (`onClose`), and the next opening is a new instance: the amount is the NEW balance, the reference and the note are empty.
- **D3. A failed quiet refresh behaves as a failed load always did:** the error message with "Retry" replaces the screen. It is not changed here, and I did not try to show it as a banner above the old data.
- **D4. A consequence, not separately tested:** the status filter, the search text and the term filter of the invoices list are state of the dashboard, so they now survive a save instead of being reset by it.
- **D5. The browser spec proves it against the real database, first on the UNFIXED build.** (a) Generate: the dialog stays open and says "2 new invoices created, 0 existing invoices skipped."; pressed again, "0 new invoices created, 2 existing invoices skipped."; closed, the list holds the two invoices. (b) Pay: record a part payment from an invoice; the invoice dialog is still open and shows the new "Amount Paid" and "Balance Due"; opening "Record Payment" again shows the new balance as the amount and an empty reference and note. Each on desktop and phone.

## 4. Work breakdown

- [x] Design (this file).
- [x] The spec first; run against the unfixed build and each failure read.
- [x] The fix (D1, D2) and the correction of task 0058's D3.
- [x] The spec and the existing finance specs pass on the fixed build, desktop and phone.
- [x] Docs: the component catalogue rows, the tracker.

## 5. Not in this task

- `SpeedGraderModal` (the Coursework chapter will exercise it); the other screens' refresh behaviour (only Finance was read); the walkthrough chapter that found this (its own PR, after this one); mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (the AlEemaan test stack on :5434, one run at a time, a production build of the branch before each run; `tsc --noEmit`, ESLint on the three changed components and the new spec, Prettier and `pnpm build` all clean before each run).

**Run 1, the new spec against the UNFIXED build (desktop and phone): 4 failed, 1 passed (setup).** Each failure was read:
- *making the term's invoices*: "2 new invoices created, 0 existing invoices skipped." was never there: no `role="status"` inside the dialog, because the dialog itself was gone. Same as the walkthrough's screenshot.
- *after a part payment*: the payment dialog closed (so the payment was recorded) and then the invoice's own dialog was NOT there. The failure screenshot shows why this is not a test artefact: the dashboard behind shows ₦20,000.00 collected, 40%, and the row "PARTIAL", and no dialog at all. So the invoice was closed by the refresh after the payment, which was read from the code and is now shown.

**Run 2, the same spec and the existing finance specs on the FIXED build: 37 passed, 0 failed, 2.8 minutes.** setup 1, `finance-a11y.spec.ts` 4, `finance-fee-edit.spec.ts` 10 (task 0058's, which had relied on the remount this task removes), `finance-refresh.spec.ts` 4, `program-fees.spec.ts` 18.

**Run 3, are the keys (D2) needed? A variant with the quiet refresh and WITHOUT the keys (only `FinancePanel` changed): 4 failed, 1 passed.** I added a "reopen" check to the batch test first (close the dialog, open it again, expect no result message in it). In the variant, the first halves of both tests PASSED (so the quiet refresh alone fixes the lost message and the closed invoice), and the next opening failed: the reopened batch dialog still held the last result (1 status message, expected 0), and the next payment dialog opened with "20000", the LAST payment's amount, not the new balance "30000". So the keys are not a belt-and-braces: without them the fix introduces stale dialogs, which is what task 0058's D3 had missed.

**Run 4, the FINAL code (quiet refresh and keys, and the reopen check in the spec): 37 passed, 0 failed, 0 skipped, 2.8 minutes.** setup 1, `finance-a11y.spec.ts` 4, `finance-fee-edit.spec.ts` 10, `finance-refresh.spec.ts` 4, `program-fees.spec.ts` 18.

**What the runs do not show.** `DiscountModal`'s key follows the payment dialog's pattern but no test opens the waiver dialog twice (C11 step 92 will, in the walkthrough). D3 (a failed quiet refresh shows the old error card) and D4 (the filters and the search text survive a save) are by construction and not tested. No accessibility scan was run on the state "invoice stays open after a payment" (`finance-a11y.spec.ts` passes but does not reach it).

**Not run:** the whole suite; the API finance specs (no server code changed); mutation passes (deferred to the end of PHASE 2, the maintainer's call); the walkthrough's C11 chapter on this build (next).
