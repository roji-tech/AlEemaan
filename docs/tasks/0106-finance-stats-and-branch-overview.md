# 0106: Finance statistics: one branch in depth, and every branch side by side

- **Period / Focus:** 2026-11-18 (the maintainer, with a screenshot of Finance > Student Invoices & Payments: "i think we should have stats under finance, both for single branch and multiple branch overview")
- **Status:** Built; the record is section 5
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/finance-stats` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What exists and what is missing

The Invoices tab already shows four cards (Total Invoiced, Total Collected, Outstanding Balance, Collection Rate) for the branch on screen. They are summed in the browser from the list the screen loaded, so they are only as complete as that list (a filter, a page, a term), they say nothing about WHEN money came in, WHO is behind (which classes), HOW it was paid, or how long it has been owed, and there is no view across branches: a superadmin with four branches has to switch four times and add up by hand.

## 2. Decisions

- **D1. A new first tab, "Overview", on Finance** (`?tab=overview`; the existing tabs keep their names). It has two views, chosen by a switch at its top: **This branch** (always) and **All branches** (only for a person who may read the finance of two or more branches: a superadmin, or an administrator of several branches). The Invoices tab's four cards stay as they are (they follow its filters, which is their job).
- **D2. The figures come from the server, in the database, not from a loaded list.** One endpoint per view, each answering from aggregate queries (`SUM`, `COUNT`, `GROUP BY`) scoped by the branch ids the viewer may read; the browser draws what it is given and adds nothing up.
  - `GET /api/v1/finance/stats?branchId=&periodId=` : one branch.
  - `GET /api/v1/finance/overview?scope=current|all` : every branch the viewer may read, one row each, plus the total.
- **D3. What is measured, and what each figure means** (so nobody reads a number differently from the screen next to it):
  - **Invoiced** = the sum of `totalAmount` of invoices that are not Cancelled or Waived (an invoice's total is already after its discounts; the discounts given are shown on their own line).
  - **Collected** = the sum of `amountPaid` of those invoices (the field the screens already trust; it is changed only by a verified payment). **Outstanding** = Invoiced minus Collected on the invoices still Unpaid or Partially paid. **Collection rate** = Collected / Invoiced, 0 when nothing is invoiced, never above 100.
  - **Overdue** = the outstanding amount of invoices whose `dueDate` is before today, and **ageing** splits it: not yet due, 1-30 days, 31-60 days, over 60 days. Invoices with no due date are "not yet due".
  - **Waived** and **Cancelled** are counted and shown, never added into Invoiced.
  - **By status**: how many invoices, and how much, are Unpaid, Partially paid, Paid.
  - **By class**: Invoiced, Collected and the rate for each class the pupils are enrolled in for the invoice's term (a pupil with no enrolment that term is "No class").
  - **How it was paid**: the sum of successful payments by channel (card, bank transfer, cash, POS) and by provider.
  - **Month by month**: collected (by `paidAt`) and invoiced (by invoice creation) for the last six months, so a school sees whether money is coming in or only being billed.
- **D4. Term.** Terms belong to a branch, so a figure for one branch can be limited to one of ITS terms (the same term select as the Invoices tab; the default is the current term, "All terms" is one click). The all-branches view cannot pick one term for four branches: it has **Current term of each branch** (the default) and **All time**.
- **D5. Money is integer kobo inside the calculation** (`Math.round(amount * 100)` once, on the way out of the database), so a rate or a total is never a rounded float summed twenty thousand times; the naira text comes from the existing `formatNaira`.
- **D6. Who may see it.** The same rule as the rest of Finance: a branch administrator reads their own branch; a superadmin every branch; nobody else (teachers, pupils, parents, other branches' administrators) gets a 403, and a branch id the viewer may not read is a 404, exactly as the invoice routes answer. The all-branches endpoint silently leaves out the branches the viewer may not read and answers for the rest; if that leaves one branch (or none), the tab shows only "This branch".
- **D7. Drawn without inline style** (the page's content policy refuses it): bars are SVG rects with attributes, in the tone palette of task 0105 (collected green, outstanding amber, overdue rose, upcoming blue). Every chart has its numbers as text beside it and a text summary for a screen reader; colour never carries a number alone.
- **D8. Nothing here changes money.** Read-only: no payment, invoice or discount is touched.
- **D9. Export** of these figures as CSV rides on task 0103 (lists and export), with its same rules (admins only, audited, rate limited); not built here.

## 3. Work

- [x] `lib/finance/stats.ts` (pure: kobo, rate, ageing buckets, month buckets, the overview total) and `lib/finance/stats-service.ts` (the aggregate queries)
- [x] `GET /api/v1/finance/stats` and `GET /api/v1/finance/overview` with the access rule of D6
- [x] `FinanceOverview.tsx` (cards, month chart, ageing, by class, how paid; the all-branches table) and the first tab in `FinancePanel.tsx` with `?tab=`
- [x] Unit tests of the pure part (17); API tests (17: figures equal a hand count; access; overview total equals the sum of the branches); browser tests (11: at 360 / 850 / 1280 in both themes with axe)
- [x] Docs: `docs/components/school-app.md`, this file's build record

## 4. Not in this task

A statement per pupil, refunds, forecasts, and the CSV export (D9).

## 5. Build record and tests

**Batch run, 2026-11-19.**
- **Setup:** one local checkout merging #294 (17d147b), #295 (99c1656) and #296 (51d31f4) as f5e8be1, one production build, one worker on the shared test database.
- **Projects:** setup; unit (all); integration (session-lifecycle); api (scheme-none-yet, finance-stats, student-parent-login-switch, school-site, portals, login); browser on desktop and phone (info-tips, academics-grading-staff, scheme-levels, finance-overview, finance-a11y, finance-contrast, fees-bulk, finance-fee-edit, finance-refresh, standing-and-payment-rules, browser-security, school-site, portals, global-search, sign-in).
- **Result:** **1834 passed, 9 failed, 23 skipped** in 45.2 min.

The 9 failures:
- `portals.spec.ts:81` and `:99`, desktop and phone (4): known before this batch and recorded in earlier runs. The local portals server's `localhost` school address sends a website page back to itself. Not caused by these changes.
- `school-site.spec.ts:33`, desktop and phone (2): the test counted three Sign in buttons on a database an earlier spec had emptied. Fixed in the test (#296).
- `academics-grading-staff.spec.ts:57`, desktop, both themes (2): see the reruns.
- `academics-grading-staff.spec.ts:124`, phone, dark (1): the tap on the Staff tab did not register under load (load average about 13). It passed alone.

**Reruns on the same build:**
- **Rerun 1:** `school-site:33` passed on desktop and phone; `:124` passed. The grading spec, now naming the element in its axe report, failed target-size on `button[data-info-tip="academics.schemes"]`, which sat half under the sticky top bar after the page had scrolled. The test now scrolls to the top before that check.
- **Rerun 2:** academics-grading-staff + info-tips on desktop and phone: **45 passed, 0 failed**.

**For this task:**
- `tests/unit/finance-stats.spec.ts`, `tests/api/finance-stats.spec.ts` and `tests/e2e/finance-overview.spec.ts` on desktop and phone all passed in the batch: 31 finance result lines, 0 failed.
- So did the existing finance specs that now open `/finance?tab=invoices` (fees-bulk, finance-a11y, finance-contrast, finance-fee-edit, finance-refresh, standing-and-payment-rules) and `browser-security`.
- The 6 failures of the earlier full run (30 s timeouts while outside Gradle builds held the load average near 20) did not recur.
- The kobo rounding case (1.005 -> 101) is a unit test.
