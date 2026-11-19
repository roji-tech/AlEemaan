-- Task 0116: result templates (a look, a marks structure and a grade scale, assigned class by class). Additive: two new tables.
--
-- 1. A live template name is unique per branch ignoring case, and exactly one live template per branch is the default: partial unique indexes (Prisma cannot express a WHERE; the
--    precedent is ClassGroup_live_name_key).
-- 2. Backfill: every existing branch gets one template named "Default" with no layout, scheme or scale of its own, which means "as the branch does today". No class is assigned, so nothing
--    prints or grades differently until someone uses the feature. A branch created later gets its default the first time anyone asks (the application does it, idempotently).

-- CreateTable
CREATE TABLE "ResultTemplate" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layoutCode" TEXT,
    "layoutOptions" JSONB,
    "schemeId" TEXT,
    "gradeScaleId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultTemplateClass" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultTemplateClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultTemplate_branchId_idx" ON "ResultTemplate"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplate_branchId_id_key" ON "ResultTemplate"("branchId", "id");

-- CreateIndex
CREATE INDEX "ResultTemplateClass_templateId_idx" ON "ResultTemplateClass"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplateClass_branchId_classGroupId_key" ON "ResultTemplateClass"("branchId", "classGroupId");

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_branchId_schemeId_fkey" FOREIGN KEY ("branchId", "schemeId") REFERENCES "AssessmentScheme"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_branchId_gradeScaleId_fkey" FOREIGN KEY ("branchId", "gradeScaleId") REFERENCES "GradeScale"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateClass" ADD CONSTRAINT "ResultTemplateClass_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateClass" ADD CONSTRAINT "ResultTemplateClass_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES "ResultTemplate"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplateClass" ADD CONSTRAINT "ResultTemplateClass_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES "ClassGroup"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial unique indexes
CREATE UNIQUE INDEX "ResultTemplate_live_name_key" ON "ResultTemplate" ("branchId", lower("name")) WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ResultTemplate_one_default_key" ON "ResultTemplate" ("branchId") WHERE "isDefault" AND "archivedAt" IS NULL;

-- Backfill: a "Default" template for every existing branch
INSERT INTO "ResultTemplate" ("id", "branchId", "name", "isDefault")
SELECT 'rtd_' || md5(b."id"), b."id", 'Default', true
FROM "Branch" b
WHERE NOT EXISTS (SELECT 1 FROM "ResultTemplate" t WHERE t."branchId" = b."id" AND t."isDefault" AND t."archivedAt" IS NULL);
