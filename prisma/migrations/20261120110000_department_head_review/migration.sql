-- CreateTable
CREATE TABLE "ResultDepartmentReview" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultDepartmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultDepartmentReview_branchId_departmentId_idx" ON "ResultDepartmentReview"("branchId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultDepartmentReview_branchId_resultId_key" ON "ResultDepartmentReview"("branchId", "resultId");

-- AddForeignKey
ALTER TABLE "ResultDepartmentReview" ADD CONSTRAINT "ResultDepartmentReview_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultDepartmentReview" ADD CONSTRAINT "ResultDepartmentReview_branchId_resultId_fkey" FOREIGN KEY ("branchId", "resultId") REFERENCES "Result"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultDepartmentReview" ADD CONSTRAINT "ResultDepartmentReview_branchId_departmentId_fkey" FOREIGN KEY ("branchId", "departmentId") REFERENCES "Department"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

