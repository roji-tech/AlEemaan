-- Task 0116: a class's own grade scale (the maintainer, 2026-11-20: "make the scale editable per class per branch"). Additive: one new table, no row.
--
-- One row per class (unique on branch + class): "this class grades on this scale". It wins over the class's result template's scale and the branch's default scale; no row means follow
-- those. The branch is the same for the row, the class and the scale (composite keys); the scale is archived, never deleted, so no cascade from it. A class that is in no template can have a row.


-- CreateTable
CREATE TABLE "ClassGradeScale" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "gradeScaleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGradeScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassGradeScale_gradeScaleId_idx" ON "ClassGradeScale"("gradeScaleId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassGradeScale_branchId_classGroupId_key" ON "ClassGradeScale"("branchId", "classGroupId");

-- AddForeignKey
ALTER TABLE "ClassGradeScale" ADD CONSTRAINT "ClassGradeScale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGradeScale" ADD CONSTRAINT "ClassGradeScale_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGradeScale" ADD CONSTRAINT "ClassGradeScale_branchId_gradeScaleId_fkey" FOREIGN KEY ("branchId", "gradeScaleId") REFERENCES "GradeScale"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

