-- Additive migration for Paper Work roll call and turn-in tracking (Task 0032 Slice 8)

-- CreateEnum
CREATE TYPE "TurnInStatus" AS ENUM ('PENDING', 'HANDED_IN', 'LATE');

-- CreateTable FormTurnIn
CREATE TABLE "FormTurnIn" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "TurnInStatus" NOT NULL DEFAULT 'PENDING',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTurnIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable FormTurnInAudit
CREATE TABLE "FormTurnInAudit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "turnInId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "TurnInStatus" NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actorUserId" TEXT,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTurnInAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormTurnIn_branchId_id_key" ON "FormTurnIn"("branchId", "id");
CREATE UNIQUE INDEX "FormTurnIn_branchId_formId_studentId_key" ON "FormTurnIn"("branchId", "formId", "studentId");
CREATE INDEX "FormTurnIn_branchId_formId_status_idx" ON "FormTurnIn"("branchId", "formId", "status");
CREATE INDEX "FormTurnIn_branchId_studentId_idx" ON "FormTurnIn"("branchId", "studentId");

CREATE UNIQUE INDEX "FormTurnInAudit_branchId_id_key" ON "FormTurnInAudit"("branchId", "id");
CREATE INDEX "FormTurnInAudit_branchId_formId_idx" ON "FormTurnInAudit"("branchId", "formId");
CREATE INDEX "FormTurnInAudit_branchId_turnInId_idx" ON "FormTurnInAudit"("branchId", "turnInId");
CREATE INDEX "FormTurnInAudit_branchId_createdAt_idx" ON "FormTurnInAudit"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES "Form"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_branchId_turnInId_fkey" FOREIGN KEY ("branchId", "turnInId") REFERENCES "FormTurnIn"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_note_len" CHECK ("note" IS NULL OR (char_length("note") >= 1 AND char_length("note") <= 500));
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_action_len" CHECK (char_length("action") >= 1 AND char_length("action") <= 50);
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_note_len" CHECK ("note" IS NULL OR (char_length("note") >= 1 AND char_length("note") <= 500));

-- Trigger: append-only audit
CREATE TRIGGER "FormTurnInAudit_append_only" BEFORE UPDATE OR DELETE ON "FormTurnInAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
