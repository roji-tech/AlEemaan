-- Results, Slice P2a (plan "Build design - Slice P2"). ADDITIVE and safe on the live school: two new tables and one enum, plus two composite unique indexes
-- on existing tables (StudentRecord and AcademicPeriod gain UNIQUE (branchId, id); ids are already unique, so this can never fail on existing rows). Nothing
-- existing changes meaning. Run BEFORE the code that reads it (ADR 0003). Ported from Octalve Edu's Phase 1.4 with `branchId` for `tenantId`, no row-level
-- security (AlEemaan's guard is withBranch, ADR 0015), and the fixes of Octalve's review (ISS-0003) built into the shape.
--
-- What the database refuses, whichever code writes: impossible numbers; a status without its dates, author and token; any change to WHO / WHAT / WHEN a result
-- is for, ever; any change to a result's content or snapshot once it has left DRAFT; deleting a result that has left DRAFT; and any change to or removal of a
-- ResultAudit row (TRUNCATE is deliberately NOT guarded, so test resets work - the row triggers are the guard, and that limit is stated in the plan).

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'LOCKED');

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "classArmId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "componentScores" JSONB NOT NULL,
    "examScore" DECIMAL(6,2) NOT NULL,
    "examMax" DECIMAL(6,2) NOT NULL,
    "caTotal" DECIMAL(6,2) NOT NULL,
    "total" DECIMAL(6,2) NOT NULL,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "gradeLetter" TEXT NOT NULL,
    "gradeRemark" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "enteredByUserId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "verificationHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultAudit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "ResultStatus",
    "toStatus" "ResultStatus",
    "fromTotal" DECIMAL(6,2),
    "toTotal" DECIMAL(6,2),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Result_verificationToken_key" ON "Result"("verificationToken");

-- CreateIndex
CREATE INDEX "Result_branchId_periodId_classArmId_idx" ON "Result"("branchId", "periodId", "classArmId");

-- CreateIndex
CREATE INDEX "Result_branchId_studentId_periodId_idx" ON "Result"("branchId", "studentId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_studentId_subjectId_periodId_key" ON "Result"("studentId", "subjectId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_branchId_id_key" ON "Result"("branchId", "id");

-- CreateIndex
CREATE INDEX "ResultAudit_branchId_resultId_idx" ON "ResultAudit"("branchId", "resultId");

-- CreateIndex
CREATE INDEX "ResultAudit_createdAt_idx" ON "ResultAudit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicPeriod_branchId_id_key" ON "AcademicPeriod"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRecord_branchId_id_key" ON "StudentRecord"("branchId", "id");

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES "Subject"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES "AcademicPeriod"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES "ClassArm"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_schemeId_fkey" FOREIGN KEY ("branchId", "schemeId") REFERENCES "AssessmentScheme"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_branchId_scaleId_fkey" FOREIGN KEY ("branchId", "scaleId") REFERENCES "GradeScale"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultAudit" ADD CONSTRAINT "ResultAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultAudit" ADD CONSTRAINT "ResultAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Numbers: the parts and the exam add up to the total, and the total fits the maximum.
ALTER TABLE "Result" ADD CONSTRAINT "Result_scores_valid" CHECK (
  "examMax" >= 0 AND "examScore" >= 0 AND "examScore" <= "examMax"
  AND "caTotal" >= 0 AND "maxScore" > 0
  AND "total" = "caTotal" + "examScore" AND "total" <= "maxScore"
);
ALTER TABLE "Result" ADD CONSTRAINT "Result_grade_filled" CHECK (length(btrim("gradeLetter")) BETWEEN 1 AND 4 AND length(btrim("gradeRemark")) BETWEEN 1 AND 40);
ALTER TABLE "Result" ADD CONSTRAINT "Result_components_array" CHECK (jsonb_typeof("componentScores") = 'array');

-- The status machine's footprint: each status has exactly the dates and people it needs, and no others.
ALTER TABLE "Result" ADD CONSTRAINT "Result_status_footprint" CHECK (
  CASE "status"
    WHEN 'DRAFT' THEN "submittedAt" IS NULL AND "submittedByUserId" IS NULL AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL AND "publishedAt" IS NULL AND "lockedAt" IS NULL
    WHEN 'SUBMITTED' THEN "submittedAt" IS NOT NULL AND "submittedByUserId" IS NOT NULL AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL AND "publishedAt" IS NULL AND "lockedAt" IS NULL
    WHEN 'APPROVED' THEN "submittedAt" IS NOT NULL AND "submittedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "publishedAt" IS NULL AND "lockedAt" IS NULL
    WHEN 'PUBLISHED' THEN "submittedAt" IS NOT NULL AND "submittedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "lockedAt" IS NULL
    WHEN 'LOCKED' THEN "submittedAt" IS NOT NULL AND "submittedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "lockedAt" IS NOT NULL
  END
);
-- A verification token exists exactly while a result is published (or locked): never on a draft, never kept after an unlock.
ALTER TABLE "Result" ADD CONSTRAINT "Result_token_iff_published" CHECK (
  ("status" IN ('PUBLISHED', 'LOCKED')) = ("verificationToken" IS NOT NULL AND "verificationHash" IS NOT NULL)
);

-- WHO / WHAT / WHEN never changes; the content and snapshot change only while the result is a DRAFT; only a DRAFT can be deleted.
CREATE FUNCTION "result_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
     OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId" OR NEW."periodId" IS DISTINCT FROM OLD."periodId" THEN
    RAISE EXCEPTION 'A result cannot change its branch, student, subject or period' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
       NEW."classArmId" IS DISTINCT FROM OLD."classArmId" OR NEW."schemeId" IS DISTINCT FROM OLD."schemeId" OR NEW."scaleId" IS DISTINCT FROM OLD."scaleId"
    OR NEW."componentScores" IS DISTINCT FROM OLD."componentScores" OR NEW."examScore" IS DISTINCT FROM OLD."examScore" OR NEW."examMax" IS DISTINCT FROM OLD."examMax"
    OR NEW."caTotal" IS DISTINCT FROM OLD."caTotal" OR NEW."total" IS DISTINCT FROM OLD."total" OR NEW."maxScore" IS DISTINCT FROM OLD."maxScore"
    OR NEW."gradeLetter" IS DISTINCT FROM OLD."gradeLetter" OR NEW."gradeRemark" IS DISTINCT FROM OLD."gradeRemark"
    OR NEW."enteredByUserId" IS DISTINCT FROM OLD."enteredByUserId") THEN
    RAISE EXCEPTION 'The content of a result that has left DRAFT cannot change; send it back to draft first' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Result_guard" BEFORE UPDATE ON "Result" FOR EACH ROW EXECUTE FUNCTION "result_guard"();

CREATE FUNCTION "result_delete_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft result can be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER "Result_delete_guard" BEFORE DELETE ON "Result" FOR EACH ROW EXECUTE FUNCTION "result_delete_guard"();

-- The history is append-only.
CREATE FUNCTION "result_audit_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ResultAudit is append-only' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "ResultAudit_append_only" BEFORE UPDATE OR DELETE ON "ResultAudit" FOR EACH ROW EXECUTE FUNCTION "result_audit_append_only"();
