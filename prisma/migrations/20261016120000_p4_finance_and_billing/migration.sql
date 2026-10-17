-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'PAYSTACK', 'FLUTTERWAVE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DiscountWorkflowMode" AS ENUM ('MANUAL_OVERRIDE', 'SCHOLARSHIP', 'SIBLING_DISCOUNT', 'STAFF_CHILD');

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATE,
    "lineItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
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

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDiscount" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "mode" "DiscountWorkflowMode" NOT NULL DEFAULT 'MANUAL_OVERRIDE',
    "appliedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "rawPayloadHash" TEXT NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "branchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("branchId","year")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "branchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("branchId","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_branchId_id_key" ON "FeeStructure"("branchId", "id");

-- CreateIndex
CREATE INDEX "FeeStructure_branchId_periodId_idx" ON "FeeStructure"("branchId", "periodId");

-- CreateIndex
CREATE INDEX "FeeStructure_branchId_classGroupId_idx" ON "FeeStructure"("branchId", "classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_branchId_studentId_periodId_key" ON "Invoice"("branchId", "studentId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_branchId_id_key" ON "Invoice"("branchId", "id");

-- CreateIndex
CREATE INDEX "Invoice_branchId_status_idx" ON "Invoice"("branchId", "status");

-- CreateIndex
CREATE INDEX "Invoice_branchId_periodId_idx" ON "Invoice"("branchId", "periodId");

-- CreateIndex
CREATE INDEX "Invoice_branchId_studentId_idx" ON "Invoice"("branchId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_branchId_id_key" ON "Payment"("branchId", "id");

-- CreateIndex
CREATE INDEX "Payment_branchId_invoiceId_idx" ON "Payment"("branchId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_branchId_status_idx" ON "Payment"("branchId", "status");

-- CreateIndex
CREATE INDEX "Payment_branchId_providerRef_idx" ON "Payment"("branchId", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDiscount_branchId_id_key" ON "InvoiceDiscount"("branchId", "id");

-- CreateIndex
CREATE INDEX "InvoiceDiscount_branchId_invoiceId_idx" ON "InvoiceDiscount"("branchId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_receivedAt_idx" ON "PaymentWebhookEvent"("provider", "receivedAt");

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_invoiceId_fkey" FOREIGN KEY ("branchId", "invoiceId") REFERENCES "Invoice"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_branchId_invoiceId_fkey" FOREIGN KEY ("branchId", "invoiceId") REFERENCES "Invoice"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptCounter" ADD CONSTRAINT "ReceiptCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCounter" ADD CONSTRAINT "InvoiceCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
