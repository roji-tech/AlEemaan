# 0046: Part payment "if allowed"

- **Period / Focus:** requested 2026-11-03 by the maintainer ("a person can also pay part payment if allowed"); design written the same day, built in the same branch as programs slice P1 and standing (task 0045)
- **Status:** Built and tested 2026-11-03 on `claude/programs-p1` (section 6 is the build record); waiting for the migration `20261104110000_part_payment` on the hosted databases and the maintainer's promotion. Octalve Edu parity is a separate task.
- **Priority:** Medium
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** `claude/programs-p1`, into `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Whether an invoice may be paid in parts becomes a rule the school controls: on or off, with an optional smallest part, a school-wide value that a branch can only tighten, and a way to say "this one invoice must be paid in full". The default keeps exactly what happens today.

## 2. What the code does today (read 2026-11-03)
- `Invoice` has `totalAmount`, `amountPaid` and the status `UNPAID`, `PARTIALLY_PAID`, `PAID`, `WAIVED`, `CANCELLED`; `resolveInvoiceStatus` already turns a part payment into `PARTIALLY_PAID`.
- Both ways of paying accept **any amount up to the balance** with no setting: `recordManualPayment` (an administrator records cash, a transfer or a POS payment) and `initializeGatewayPayment` (starts a Paystack payment; the route `POST /invoices/[id]/pay` is an administrator's act). The schema comment on the gateway amount says "if partial payment allowed, else full balance", but nothing decides "allowed".
- The portal shows a guardian the invoices read only; there is no pay button for a payer yet.
- `fulfillPayment` (the webhook) is given money that has already been taken; it must never refuse it.

## 3. Design

### 3.1 The rule
A pure function `checkPart({ total, paid, amount, policy, payInFull })` decides, for a payment of `amount` against an invoice with `total` and `paid` so far:
1. The payment that **settles the balance exactly** is always allowed (a ₦3,000 balance can be paid even when the smallest part is ₦5,000).
2. Otherwise, if the invoice is marked **pay in full**, or the effective policy says part payment is **not allowed**, it is refused: "This invoice has to be paid in full (₦X)."
3. Otherwise, if the policy has a smallest part and `amount` is below it, it is refused: "The smallest part you can pay is ₦X."
4. Otherwise it is allowed. (Zero, negative and more-than-the-balance are refused first, as today.)
The smallest part is an amount (₦) or a percentage of the invoice's total, whichever the policy names; a percentage is rounded up to the kobo.

### 3.2 The policy and the ceiling
`finance.partPayment` is a `SettingValue` (GLOBAL = the school, BRANCH = a branch), value `{ allowed: boolean, minimum: { kind: "NONE" | "AMOUNT" | "PERCENT", value?: number } }`. **Default: allowed, no minimum**, which is today's behaviour, so nothing changes until a school chooses. The effective policy for a branch is the **strictest** of the two: `allowed` only if both allow it; the larger smallest part (an amount and a percentage are compared on the invoice at hand). A branch can only tighten: storing a looser value than the school's is refused, a hand-written looser row is ignored. A stored value that does not parse is ignored (the school's value, or the default, applies).

### 3.3 Per invoice
`Invoice.payInFull` (boolean, default false): an administrator of the branch can mark one invoice "pay in full" (and clear it). It can only tighten, never allow what the policy forbids. Changing it is audited.

### 3.4 Where it is enforced
In the two places a payment is started or recorded: `recordManualPayment` and `initializeGatewayPayment`, inside the same transaction that reads the invoice, so two payments racing cannot slip under the rule. **Not** in `fulfillPayment`: a payment that was accepted when it was started is never refused after the money has been taken, even if the rule changed in between (documented in the code and tested).

### 3.5 Screens
- Finance: a "Payment rules" section (a super admin edits the school's value, an administrator the branch's, both through `PATCH /api/v1/settings/part-payment`), showing what the school decided when the branch cannot widen it.
- The record-payment dialog says what is allowed ("Part payments are allowed, at least ₦5,000" / "This invoice has to be paid in full") and offers "Pay the full balance".
- The invoice detail shows the same sentence and a "Pay in full only" switch for an administrator.
- Not built: a pay button for a payer in the portal. That is a separate decision (who may start an online payment, with which secret), and the rule is already enforced in the server path it will use.

### 3.6 Program fees
Slice P4 of task 0043 reuses this: the policy applies to program invoices, and a program's fee item can be marked pay in full.

## 4. Work breakdown
- [x] F1 Migration (`Invoice.payInFull`); the pure rule and the policy resolver; the settings service and route; enforcement in the two payment paths; the invoice flag route
- [x] F2 Finance screens (payment rules, the record-payment dialog, the invoice detail)
- [x] Tests: unit (the rule table, the policy ceiling), API (both payment paths, the race, the webhook still accepts, who may edit), browser (screens, both themes, phone)

## 5. Not in this task
Instalment schedules with due dates per part, reminders for the next part, and late fees. Each can sit on top of the same rule.

## 6. Build record (2026-11-03)
**What exists.** The migration `20261104110000_part_payment` (additive, one column: `Invoice.payInFull`, default false). The rule and the policy in `src/lib/finance/part-payment.ts` (pure), the database side in `part-payment-service.ts`, `GET/PATCH /api/v1/settings/part-payment`, `PATCH /api/v1/finance/invoices/[id]/pay-in-full`, enforcement in `recordManualPayment` and `initializeGatewayPayment` inside the payment's own transaction, the Finance tab "Payment Rules", the invoice's sentence and "Pay in full only" switch, and "Pay the full balance" in the record-payment dialog. The matrix rows are PPY-01 to PPY-04.

**Decisions made while building:**
- The invoice row is **locked** (`FOR UPDATE`) at the start of both payment paths. That is what makes the rule hold under a race, and it also closes a pre-existing hole: two payments at the same moment could each pass the "not more than the balance" check and together take more than the balance (now tested: one is taken, the other is told).
- A payment that **settles the balance exactly** is always allowed, even under the smallest part, so a ₦3,000 balance can be paid when the smallest part is ₦5,000.
- The sentences read whole naira without ".00" ("at least ₦5,000"), because the school typed a whole number.
- A branch cannot go under the school's smallest part **of the same kind**, cannot remove it, and cannot allow what the school forbids; an amount and a percentage are not comparable without an invoice, so a branch may name the other kind and the larger applies on the invoice at hand. A looser value that got into the database by hand is ignored (the stricter of the two always applies).
- `fulfillPayment` (the webhook) is **not** given the rule, and a test starts a payment, changes the rule, and delivers the webhook: the money is accepted.

**Not built:** a pay button for a payer in the portal (section 3.5), Octalve Edu parity, and program invoices (slice P4 of task 0043).

**Tests.** Unit: `tests/unit/part-payment-rules.spec.ts`. API: `tests/api/part-payment.spec.ts`. Browser: `tests/e2e/standing-and-payment-rules.spec.ts` (the Payment Rules tab, the invoice, the record-payment dialog, both themes). Results of the full run are in section 8 of `docs/tasks/0043-programs.md`.

