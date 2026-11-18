-- Breaks inside a term or semester (task 0098; the maintainer, 2026-11-18: the mid-term or mid-semester holiday): a new table, nothing else changes.
-- Additive and safe on a live database: no existing table or row is touched. The new code reads this table when it lists a session's terms, so run this right after the release is merged
-- (staging runs it by itself on a push to master; production: merge to prod, THEN run the "Migrate production" workflow).
-- The composite key (branchId, periodId) makes the database refuse a break that points at another branch's term.

-- CreateTable
CREATE TABLE "AcademicBreak" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicBreak_branchId_periodId_idx" ON "AcademicBreak"("branchId", "periodId");

-- AddForeignKey
ALTER TABLE "AcademicBreak" ADD CONSTRAINT "AcademicBreak_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicBreak" ADD CONSTRAINT "AcademicBreak_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
