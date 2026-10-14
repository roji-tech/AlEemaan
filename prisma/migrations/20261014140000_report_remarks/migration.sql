-- Report remarks, Slice P2c (plan "Build design - Slice P2"). ADDITIVE and safe on the live school: one new table; nothing existing changes. Run BEFORE the code that
-- reads it (ADR 0003). A student's report card carries the teacher's and the principal's remark for the term: one row per student and term, in the student's branch
-- (composite keys). "Editable until a result of that term is published" is a service rule, not a database one - stated in the plan.

-- CreateTable
CREATE TABLE "ReportRemark" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "teacherRemark" TEXT,
    "principalRemark" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportRemark_branchId_periodId_idx" ON "ReportRemark"("branchId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRemark_studentId_periodId_key" ON "ReportRemark"("studentId", "periodId");

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_lengths" CHECK (
  ("teacherRemark" IS NULL OR length(btrim("teacherRemark")) BETWEEN 1 AND 500)
  AND ("principalRemark" IS NULL OR length(btrim("principalRemark")) BETWEEN 1 AND 500)
);
