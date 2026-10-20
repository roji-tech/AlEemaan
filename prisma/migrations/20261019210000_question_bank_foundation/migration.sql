-- Question bank, foundation (Task 0032 slice 1; design note docs/development-history/forms-and-question-bank-design.md). ADDITIVE and safe on the live school: six enums
-- and seven new tables. NO existing table is changed (the relation fields added to Branch and User in the Prisma schema produce no SQL). Run BEFORE the code that reads
-- it. Generated with `prisma migrate diff` from dev's schema, then the checks, the unique index and the triggers below were added by hand.
--
-- What the database refuses, whichever code writes: a fifth image on an item (the superadmin's limit of 3 or 4 is a service rule; 4 is the hard stop); an image with no
-- alt text that is not marked decorative; a rating or free-text question in the assessment bank, or a correct answer on a questionnaire item; a subject reviewer without
-- a subject (or a general one with one); a duplicate reviewer row; and any change to or removal of a QuestionBankReview or QuestionBankAudit row (TRUNCATE is
-- deliberately NOT guarded, so test resets work, the same limit as ResultAudit).

-- CreateEnum
CREATE TYPE "BankKind" AS ENUM ('ASSESSMENT', 'QUESTIONNAIRE');

-- CreateEnum
CREATE TYPE "BankQuestionType" AS ENUM ('SINGLE', 'MULTI', 'TRUE_FALSE', 'SHORT', 'RATING', 'TEXT');

-- CreateEnum
CREATE TYPE "BankVisibility" AS ENUM ('PRACTICE', 'TEACHERS_ONLY', 'TEACHERS_ONLY_UNTIL');

-- CreateEnum
CREATE TYPE "BankItemStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BankReviewOutcome" AS ENUM ('APPROVED', 'EDITED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BankReviewerScope" AS ENUM ('GENERAL', 'SUBJECT');

-- CreateTable
CREATE TABLE "QuestionBankItem" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "bank" "BankKind" NOT NULL DEFAULT 'ASSESSMENT',
    "type" "BankQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "difficulty" INTEGER,
    "topic" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "subjectLabel" TEXT,
    "subjectKey" TEXT,
    "visibility" "BankVisibility" NOT NULL DEFAULT 'TEACHERS_ONLY',
    "visibleFrom" TIMESTAMP(3),
    "status" "BankItemStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankImage" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "decorative" BOOLEAN NOT NULL DEFAULT false,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankClassTag" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,

    CONSTRAINT "QuestionBankClassTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankReview" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "outcome" "BankReviewOutcome" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankReviewer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "scope" "BankReviewerScope" NOT NULL,
    "subjectLabel" TEXT,
    "subjectKey" TEXT,
    "isExamApprover" BOOLEAN NOT NULL DEFAULT false,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOverlapFlag" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "similarToItemId" TEXT,
    "similarToAssessmentQuestionId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionOverlapFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankAudit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "itemId" TEXT,
    "actorUserId" TEXT,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ref" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionBankItem_branchId_status_idx" ON "QuestionBankItem"("branchId", "status");

-- CreateIndex
CREATE INDEX "QuestionBankItem_status_visibility_idx" ON "QuestionBankItem"("status", "visibility");

-- CreateIndex
CREATE INDEX "QuestionBankItem_bank_subjectKey_idx" ON "QuestionBankItem"("bank", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankImage_itemId_sortOrder_key" ON "QuestionBankImage"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionBankClassTag_labelKey_idx" ON "QuestionBankClassTag"("labelKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankClassTag_itemId_labelKey_key" ON "QuestionBankClassTag"("itemId", "labelKey");

-- CreateIndex
CREATE INDEX "QuestionBankReview_itemId_createdAt_idx" ON "QuestionBankReview"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionBankReviewer_userId_idx" ON "QuestionBankReviewer"("userId");

-- CreateIndex
CREATE INDEX "QuestionBankReviewer_branchId_scope_idx" ON "QuestionBankReviewer"("branchId", "scope");

-- CreateIndex
CREATE INDEX "QuestionOverlapFlag_itemId_idx" ON "QuestionOverlapFlag"("itemId");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_branchId_createdAt_idx" ON "QuestionBankAudit"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_itemId_idx" ON "QuestionBankAudit"("itemId");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_createdAt_idx" ON "QuestionBankAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankClassTag" ADD CONSTRAINT "QuestionBankClassTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReview" ADD CONSTRAINT "QuestionBankReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReview" ADD CONSTRAINT "QuestionBankReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_similarToItemId_fkey" FOREIGN KEY ("similarToItemId") REFERENCES "QuestionBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Row rules.
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_sane" CHECK (
  "points" >= 0 AND "version" >= 1
  AND ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5)
  AND length(btrim("prompt", E' \t\r\n\f\v\u00a0')) > 0
  AND (("subjectLabel" IS NULL) = ("subjectKey" IS NULL))
  AND ("subjectKey" IS NULL OR length("subjectKey") > 0)
);
-- Rating and free text exist only in the questionnaire bank, and a questionnaire item has no correct answer (design note section 4).
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_kind_types" CHECK (
  ("type" NOT IN ('RATING', 'TEXT') OR "bank" = 'QUESTIONNAIRE')
  AND ("bank" <> 'QUESTIONNAIRE' OR "correctAnswer" IS NULL)
);
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_sane" CHECK (
  "bytes" > 0 AND "width" > 0 AND "height" > 0 AND "sortOrder" >= 0
  AND ("decorative" OR length(btrim("alt", E' \t\r\n\f\v\u00a0')) > 0)
);
ALTER TABLE "QuestionBankClassTag" ADD CONSTRAINT "QuestionBankClassTag_sane" CHECK (length("labelKey") > 0 AND length(btrim("label", E' \t\r\n\f\v\u00a0')) > 0);
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_scope" CHECK (
  ("scope" = 'SUBJECT' AND "subjectKey" IS NOT NULL AND length("subjectKey") > 0 AND "subjectLabel" IS NOT NULL)
  OR ("scope" = 'GENERAL' AND "subjectKey" IS NULL AND "subjectLabel" IS NULL)
);
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_score" CHECK ("score" >= 0 AND "score" <= 1);
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_entity" CHECK ("entity" IN ('ITEM', 'REVIEWER', 'SETTING'));

-- One row per person, branch, scope and subject. The columns are nullable (a NULL never equals a NULL), so the index compares their COALESCEd values.
CREATE UNIQUE INDEX "QuestionBankReviewer_once" ON "QuestionBankReviewer"("userId", COALESCE("branchId", ''), "scope", COALESCE("subjectKey", ''));

-- At most 4 images per item. The parent row is locked first so two concurrent inserts cannot both see room for the last slot.
CREATE FUNCTION "question_bank_image_limit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."itemId" = OLD."itemId" THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "QuestionBankItem" WHERE "id" = NEW."itemId" FOR UPDATE;
  IF (SELECT count(*) FROM "QuestionBankImage" WHERE "itemId" = NEW."itemId") >= 4 THEN
    RAISE EXCEPTION 'A question bank item can have at most 4 images' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "QuestionBankImage_limit" BEFORE INSERT OR UPDATE OF "itemId" ON "QuestionBankImage" FOR EACH ROW EXECUTE FUNCTION "question_bank_image_limit"();

-- The review history and the audit trail are append-only.
CREATE FUNCTION "question_bank_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "QuestionBankReview_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankReview" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
CREATE TRIGGER "QuestionBankAudit_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
