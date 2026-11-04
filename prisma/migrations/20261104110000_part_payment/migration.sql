-- Part payment "if allowed" (task 0046): an invoice can be marked "must be paid in one payment". ADDITIVE ONLY: one column that defaults to false, so nothing changes for any
-- existing invoice. Run it BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "payInFull" BOOLEAN NOT NULL DEFAULT false;
