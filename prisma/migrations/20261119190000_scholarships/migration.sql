-- Task 0113 S1: scholarships. Types per branch (a name and a default share), a pupil's scholarships (a share, from and to days, ended not deleted), and the link from an invoice discount to the
-- scholarship it came from (one per scholarship per invoice, so it can never be applied twice). Additive; separate from the guardians migration so either can be merged or held alone.
-- AlterTable
ALTER TABLE "InvoiceDiscount" ADD COLUMN     "studentScholarshipId" TEXT;

-- CreateTable
CREATE TABLE "ScholarshipType" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScholarshipType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentScholarship" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "startsOn" DATE,
    "endsOn" DATE,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentScholarship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScholarshipType_branchId_archivedAt_idx" ON "ScholarshipType"("branchId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScholarshipType_branchId_id_key" ON "ScholarshipType"("branchId", "id");

-- CreateIndex
CREATE INDEX "StudentScholarship_branchId_studentId_idx" ON "StudentScholarship"("branchId", "studentId");

-- CreateIndex
CREATE INDEX "StudentScholarship_branchId_typeId_idx" ON "StudentScholarship"("branchId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDiscount_invoiceId_studentScholarshipId_key" ON "InvoiceDiscount"("invoiceId", "studentScholarshipId");

-- AddForeignKey
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_studentScholarshipId_fkey" FOREIGN KEY ("studentScholarshipId") REFERENCES "StudentScholarship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScholarshipType" ADD CONSTRAINT "ScholarshipType_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentScholarship" ADD CONSTRAINT "StudentScholarship_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentScholarship" ADD CONSTRAINT "StudentScholarship_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ScholarshipType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A share is 1 to 100 percent, and a scholarship's days run forwards. Prisma does not model CHECKs: these live here only.
ALTER TABLE "ScholarshipType" ADD CONSTRAINT "ScholarshipType_percent_range" CHECK ("percent" BETWEEN 1 AND 100);
ALTER TABLE "StudentScholarship" ADD CONSTRAINT "StudentScholarship_percent_range" CHECK ("percent" BETWEEN 1 AND 100);
ALTER TABLE "StudentScholarship" ADD CONSTRAINT "StudentScholarship_days_forwards" CHECK ("startsOn" IS NULL OR "endsOn" IS NULL OR "startsOn" <= "endsOn");
-- A type's name is used once among a branch's live (not archived) types, whatever the capitals.
CREATE UNIQUE INDEX "ScholarshipType_live_name_key" ON "ScholarshipType"("branchId", lower("name")) WHERE "archivedAt" IS NULL;
