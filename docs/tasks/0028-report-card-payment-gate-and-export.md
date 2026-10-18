# 0028: Report Card Payment Gate & Standalone Document Export

- **Period / Focus:** 2026-10-18 (Academics, Finance Integration & Student Portal UX)
- **Status:** Complete
- **Priority:** High
- **Assignee:** Antigravity Agent
- **Target Branch / PR:** [PR #56](https://github.com/roji-tech/AlEemaan/pull/56) (`claude/task-0028-report-card-payment-gate-and-export` -> `dev`)
- **Started:** 2026-10-18 00:15:00 UTC
- **Ended:** 2026-10-18 00:28:00 UTC
- **Duration:** 13 minutes

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Implement the report card payment gate in `reportCardVisibleTo` (Finance F3 requirement) to optionally restrict online report card downloads for students with unpaid fee balances when enabled by superadmin, and provide high-fidelity standalone document export and optimized A4 print styling for report cards.

## 2. Context & Related Docs
- Resolves open items in `docs/open-items.md`:
  - `The payment gate for report cards: reportCardVisibleTo is a stub that always allows staff; the superadmin setting arrives with finance F3.`
  - `PDF download of the report card (printing from the browser is built).`
- Plan reference: `domain-implementation-plan.md` Slice P4 (Finance F3 & Decision 3).
- Data models: `SettingValue` (`prisma/schema/settings.prisma`), `Invoice` (`prisma/schema/finance.prisma`).

---

## 3. Work Breakdown

### Sub-phase A: Report Card Payment Gate Service
- [x] Extend `reportCardVisibleTo` in `src/lib/academics/report-card.ts` to support typed viewers (`staff`, `portal`, `student_or_guardian`).
- [x] Check superadmin setting `block_unpaid_report_cards` (default OFF).
- [x] If enabled, query non-cancelled invoices for the student and verify that `amountPaid >= totalAmount`.
- [x] Ensure staff (`TEACHING_STAFF`, `ADMIN`) always retain unblocked access to review and print.

### Sub-phase B: Student Portal Integration & Restricted Access UI
- [x] Enforce payment gate check in `getStudentPortalResults` in `src/lib/portal/service.ts`.
- [x] When blocked, return `blockedByUnpaidFees: true` with the calculated `outstandingBalance`.
- [x] Render dedicated access-restricted alert card in `PortalResultsTab.tsx` with a direct navigation action to the Fees & Billing tab.

### Sub-phase C: Standalone Document Export & Print Optimization
- [x] Implement `generateReportCardHtml` and `downloadReportCardHtml` in `src/lib/academics/report-card-export.ts`.
- [x] Add "Download report card" button in `CardsPanel.tsx` and `PortalResultsTab.tsx`.
- [x] Add `@media print` rules in `globals.css` with `@page { size: A4 portrait; margin: 12mm; }` and `-webkit-print-color-adjust: exact`.
- [x] Write unit tests in `tests/unit/report-card-payment-gate.spec.ts` for export generation and HTML sanitization.

### Sub-phase D: Verification & Quality Gates
- [x] `tsc --noEmit` / typecheck clean (0 errors)
- [x] `pnpm test:unit` all unit tests pass (308/308 passed)
- [x] `pnpm build` clean production build (72/72 routes)
- [x] `pnpm lint` and `pnpm format:check` clean (0 warnings / 0 errors)

