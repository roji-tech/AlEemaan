# [0022]: Slice P4 — Finance & Fee Invoicing Foundation

- **Period / Focus:** AlEemaan Roadmap Slice P4 (Fee Structures, Idempotent Invoicing, Dual-Mode Paystack & Receipting)
- **Status:** [x] Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** [PR #48](https://github.com/roji-tech/AlEemaan/pull/48) (`claude/p4-finance-billing` -> `dev`)
- **Started:** 2026-10-16 22:50:00 UTC
- **Ended:** 2026-10-16 23:20:00 UTC
- **Duration:** 30m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver **Slice P4: Finance & Fee Invoicing Foundation** for AlEemaan, adapting Phase 1.5 from Octalve Edu to AlEemaan's single-tenant multi-branch architecture:
1. **Fee Structures:** Branch-scoped fee schedules configured per class group or arm and academic session/term with itemized components (tuition, materials, exams, development levy).
2. **Idempotent Invoicing Engine:** Batch generation of student invoices per academic term with unique reference numbering, preventing duplicate invoices.
3. **Dual-Mode Payment Processing:**
   - Manual recorded payments (cash, POS, direct bank transfer) by administrators.
   - Dual-mode Paystack payment gateway (deterministic mock in test/dev, live keys in prod).
   - Tamper-resistant HMAC-SHA512 webhook signature verification.
   - Atomic payment fulfilment with concurrency locks.
4. **Waivers, Discounts & Receipts:**
   - Audited fee discounts and waivers.
   - Printable branded receipts and collection KPIs.

---

## 2. Context & Design Decisions

- **Multi-Branch Isolation (ADR 0015):**
  - `FeeStructure`, `Invoice`, `Payment`, `InvoiceDiscount` are all strictly scoped by `branchId`.
  - Composite foreign keys guarantee cross-branch referential integrity with `ClassGroup`, `Student`, and `AcademicSession`.
  - Cross-branch access is guarded by `withBranch` and `withAuth`.
- **Currency & Precision Rules:**
  - Database stores Decimal Naira values (`Prisma.Decimal`).
  - Integer Kobo conversions are restricted strictly to Paystack gateway payload exchanges (`1 NGN = 100 kobo`).
- **Invoice Status Lifecycle:**
  - `UNPAID` (0 paid) -> `PARTIALLY_PAID` (0 < paid < total) -> `PAID` (paid >= total) or `WAIVED` / `CANCELLED`.
- **Payment Idempotency & Concurrency:**
  - Gateway payments enforce unique references (`providerRef`).
  - Atomicity achieved via transaction locking on payment status transition (`PENDING` -> `SUCCESS`).
- **Permissions:**
  - `SUPER_ADMIN` & branch `ADMIN`: Manage fee structures, issue invoices, apply discounts, record offline payments.
  - Staff / Teacher: View-only access within their assigned branch.
  - Public / Students: View individual invoice status and make payment via secure reference.

---

## 3. Work Breakdown

- [x] **Sub-phase A: Data Architecture & Schema**
  - [x] Create `prisma/schema/finance.prisma` (`FeeStructure`, `FeeItem`, `Invoice`, `InvoiceItem`, `Payment`, `InvoiceDiscount`, `PaymentWebhookEvent`, enums)
  - [x] Add reciprocal relations in `branch.prisma`, `academics.prisma`, and `student.prisma`
  - [x] Generate and deploy migration `prisma/migrations/20261016120000_p4_finance_and_billing/migration.sql`
  - [x] Run `pnpm prisma generate`

- [x] **Sub-phase B: Pure Rules & Computation Engine**
  - [x] `src/lib/finance/rules.ts` & `src/lib/finance/format.ts` (Decimal Naira ↔ Integer Kobo, item aggregation, invoice status transitions, discount math, CSP-safe formatter)
  - [x] `src/lib/finance/crypto.ts` (Webhook HMAC-SHA512 verification with `timingSafeEqual`)
  - [x] `src/lib/finance/validation.ts` (Zod schemas for fee structures, invoice generation, manual payments, discounts)
  - [x] Unit tests for finance math and crypto (`tests/unit/finance-rules.spec.ts`: 17/17 passed)

- [x] **Sub-phase C: Gateway Client & Dual-Mode Paystack Engine**
  - [x] `src/lib/finance/mock-paystack.ts` (deterministic simulator for dev/test)
  - [x] `src/lib/finance/paystack.ts` (dual-mode gateway client)

- [x] **Sub-phase D: Services & API Endpoints**
  - [x] `src/lib/finance/service.ts` (fee structure management, batch invoice generator, payment fulfilment, webhook handling)
  - [x] `src/app/api/v1/finance/fee-structures/route.ts` & `[id]/route.ts`
  - [x] `src/app/api/v1/finance/invoices/route.ts` & `[id]/route.ts`
  - [x] `src/app/api/v1/finance/invoices/[id]/pay/route.ts`
  - [x] `src/app/api/v1/finance/invoices/[id]/discount/route.ts`
  - [x] `src/app/api/v1/finance/invoices/[id]/record-payment/route.ts`
  - [x] `src/app/api/v1/webhooks/paystack/route.ts`
  - [x] API integration tests (`tests/api/finance.spec.ts`: 3/3 passed)

- [x] **Sub-phase E: UI Consoles & Accessibility**
  - [x] Add Finance to Navigation & Shell (`CreditCardIcon`, nav item with admin badge)
  - [x] `src/components/finance/FeeStructuresPanel.tsx`
  - [x] `src/components/finance/InvoicesDashboard.tsx`
  - [x] `src/components/finance/InvoiceDetailModal.tsx` & printable receipt
  - [x] Dedicated `/finance` page with WCAG 2.2 AA compliant contrast
  - [x] E2E and accessibility test suite (`tests/e2e/finance-a11y.spec.ts`: 5/5 passed on desktop & mobile)

- [x] **Sub-phase F: Quality Gates & Handover**
  - [x] `pnpm typecheck` (0 errors)
  - [x] `pnpm lint` (0 errors, 0 warnings)
  - [x] `pnpm test:unit` & `pnpm test:fast` (all green)
  - [x] Update `/docs` registers (`current-tasks.md`, `HANDOVER.md`, `open-items.md`)
  - [x] Run `pnpm tasks:check` (100% green alignment)
