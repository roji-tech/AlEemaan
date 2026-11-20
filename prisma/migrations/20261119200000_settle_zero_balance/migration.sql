-- Settle invoices that already owe nothing (the maintainer approved this on 2026-11-19: "settle any invoice whose balance reaches zero").
--
-- An invoice's "totalAmount" is the net: the fees less every discount. Before this change only scholarships made a fully covered invoice PAID; a manual (or sibling, or staff-child) discount that
-- took the whole fee off left it UNPAID with nothing to pay, so it sat on arrears lists and reminders. The application now settles such an invoice when the discount is written; this one-off
-- statement does the same for the ones that already exist.
--
-- Safe and repeatable: it only moves UNPAID or PARTIALLY_PAID invoices to PAID, only those that owe nothing ("totalAmount" <= "amountPaid") AND that have a discount (an invoice nobody took
-- anything off is left exactly as it was), and a second run finds nothing to change. Nothing is deleted, no amount changes, and no audit row is written (a status catch-up, not a decision).
UPDATE "Invoice" AS i
SET "status" = 'PAID'::"InvoiceStatus",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE i."status" IN ('UNPAID'::"InvoiceStatus", 'PARTIALLY_PAID'::"InvoiceStatus")
  AND i."totalAmount" <= i."amountPaid"
  AND EXISTS (
    SELECT 1
    FROM "InvoiceDiscount" AS d
    WHERE d."invoiceId" = i."id" AND d."branchId" = i."branchId" AND d."amount" > 0
  );
