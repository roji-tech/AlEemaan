-- Programs, slice P4 (task 0043, section 11): fees of a program - fee items, invoices, payments and discounts, in tables of their own. The school's Invoice and Payment tables are NOT touched.
--
-- ADDITIVE ONLY: one column on Program (the program's own switch, default OFF), three enums, seven tables. The existing InvoiceStatus, PaymentProvider and PaymentStatus enums are reused.
-- Nothing that exists is changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the
-- maintainer, never by an AI session. Run it after 20261107090000_program_assessments.

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "feesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "ProgramFeeFrequency" AS ENUM ('ONCE', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ProgramFeeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramFeeBilledTo" AS ENUM ('PARTICIPANT', 'GUARDIAN');

-- CreateTable
CREATE TABLE "ProgramFeeItem" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "ProgramFeeFrequency" NOT NULL DEFAULT 'ONCE',
    "dueDay" INTEGER,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "discountPercent" DECIMAL(5,2),
    "billedTo" "ProgramFeeBilledTo" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "ProgramFeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramFeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: people an item does not apply to.
CREATE TABLE "ProgramFeeExemption" (
    "feeItemId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramFeeExemption_pkey" PRIMARY KEY ("feeItemId","participantId")
);

-- CreateTable
CREATE TABLE "ProgramInvoice" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATE,
    "payInFull" BOOLEAN NOT NULL DEFAULT false,
    "lineItems" JSONB NOT NULL,
    "billingName" TEXT,
    "billingPhone" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPayment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "providerRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedServerSide" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "paidAt" TIMESTAMP(3),
    "receiptNo" TEXT,
    "metadata" JSONB,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: every discount, kept (the invoice total is the lines minus these).
CREATE TABLE "ProgramInvoiceDiscount" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramInvoiceDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one counter per year for the whole school, so PINV-2026-0001 is unique across programs.
CREATE TABLE "ProgramInvoiceCounter" (
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramInvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramFeeItem_programId_id_key" ON "ProgramFeeItem"("programId", "id");
CREATE INDEX "ProgramFeeItem_programId_status_idx" ON "ProgramFeeItem"("programId", "status");
CREATE INDEX "ProgramFeeExemption_participantId_idx" ON "ProgramFeeExemption"("participantId");
CREATE UNIQUE INDEX "ProgramInvoice_invoiceNo_key" ON "ProgramInvoice"("invoiceNo");
CREATE UNIQUE INDEX "ProgramInvoice_programId_id_key" ON "ProgramInvoice"("programId", "id");
-- Generating again never duplicates: one invoice per program, person and period.
CREATE UNIQUE INDEX "ProgramInvoice_programId_participantId_periodKey_key" ON "ProgramInvoice"("programId", "participantId", "periodKey");
CREATE INDEX "ProgramInvoice_programId_branchId_status_idx" ON "ProgramInvoice"("programId", "branchId", "status");
CREATE UNIQUE INDEX "ProgramPayment_provider_providerRef_key" ON "ProgramPayment"("provider", "providerRef");
CREATE INDEX "ProgramPayment_programId_invoiceId_idx" ON "ProgramPayment"("programId", "invoiceId");
CREATE INDEX "ProgramPayment_programId_branchId_status_idx" ON "ProgramPayment"("programId", "branchId", "status");
CREATE INDEX "ProgramInvoiceDiscount_programId_invoiceId_idx" ON "ProgramInvoiceDiscount"("programId", "invoiceId");

-- AddForeignKey
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramFeeExemption" ADD CONSTRAINT "ProgramFeeExemption_programId_feeItemId_fkey" FOREIGN KEY ("programId", "feeItemId") REFERENCES "ProgramFeeItem"("programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramFeeExemption" ADD CONSTRAINT "ProgramFeeExemption_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- An invoice is of a person of THIS program, through a branch the program runs in: money is collected and seen branch by branch.
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_programId_branchId_fkey" FOREIGN KEY ("programId", "branchId") REFERENCES "ProgramBranch"("programId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramPayment" ADD CONSTRAINT "ProgramPayment_programId_invoiceId_fkey" FOREIGN KEY ("programId", "invoiceId") REFERENCES "ProgramInvoice"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_programId_invoiceId_fkey" FOREIGN KEY ("programId", "invoiceId") REFERENCES "ProgramInvoice"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_name_check" CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name"));
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_amount_check" CHECK ("amount" >= 0.01 AND "amount" <= 10000000);
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_dueDay_check" CHECK ("dueDay" IS NULL OR "dueDay" BETWEEN 1 AND 28);
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_discount_check" CHECK ("discountPercent" IS NULL OR ("discountPercent" >= 0 AND "discountPercent" <= 100));
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_audience_check" CHECK (jsonb_typeof("audience") = 'object');
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_period_check" CHECK ("periodKey" ~ '^(once|[0-9]{4}|[0-9]{4}-(0[1-9]|1[0-2]))$');
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_amounts_check" CHECK ("totalAmount" >= 0 AND "amountPaid" >= 0 AND "amountPaid" <= "totalAmount");
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_lines_check" CHECK (jsonb_typeof("lineItems") = 'array');
ALTER TABLE "ProgramPayment" ADD CONSTRAINT "ProgramPayment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500);
