-- Slice P2e — Settings + Approvals Layer, CA/Exam Scheme Levels, Report-Card Layouts, Verification Fields, Self-Approval Toggle
-- Additive only.

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('GLOBAL', 'BRANCH');

-- CreateEnum
CREATE TYPE "SettingStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalVisibility" AS ENUM ('VISIBLE', 'HIDDEN_TO_SUBJECT');

-- CreateEnum
CREATE TYPE "SchemeScopeLevel" AS ENUM ('GLOBAL', 'BRANCH', 'CLASS_GROUP', 'TEACHER_SUBJECT');

-- CreateEnum
CREATE TYPE "ReportCardLayoutType" AS ENUM ('DEFAULT', 'LEGACY');

-- CreateEnum
CREATE TYPE "PupilNameFormat" AS ENUM ('FULL', 'FIRST_LAST_INITIAL', 'INITIALS');

-- CreateTable
CREATE TABLE "SettingValue" (
    "id" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "branchId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "SettingStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingApproval" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "scope" "SettingScope" NOT NULL,
    "branchId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SettingStatus" NOT NULL DEFAULT 'PENDING',
    "deciderUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "visibility" "ApprovalVisibility" NOT NULL DEFAULT 'VISIBLE',
    "proposedValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingAudit" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "branchId" TEXT,
    "actorUserId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSchemeScope" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "level" "SchemeScopeLevel" NOT NULL,
    "branchId" TEXT,
    "classGroupId" TEXT,
    "teacherUserId" TEXT,
    "subjectId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSchemeScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSchemeDraft" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "caParts" JSONB NOT NULL,
    "examMax" DECIMAL(6,2) NOT NULL,
    "totalMax" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "reason" TEXT NOT NULL,
    "status" "SettingStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "isSharedWithBranch" BOOLEAN NOT NULL DEFAULT false,
    "approvalId" TEXT,
    "approvedSchemeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSchemeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSelfApprovalGrant" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "grantedBySuperadminId" TEXT NOT NULL,
    "unseenReviewerUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminSelfApprovalGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardLayout" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportCardLayoutType" NOT NULL DEFAULT 'DEFAULT',
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportCardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationPageConfig" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "showPupilName" BOOLEAN NOT NULL DEFAULT true,
    "pupilNameFormat" "PupilNameFormat" NOT NULL DEFAULT 'FIRST_LAST_INITIAL',
    "showSubject" BOOLEAN NOT NULL DEFAULT true,
    "showMarks" BOOLEAN NOT NULL DEFAULT false,
    "showGrade" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationPageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingValue_branchId_key_idx" ON "SettingValue"("branchId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SettingValue_scope_branchId_key_key" ON "SettingValue"("scope", "branchId", "key");

-- CreateIndex
CREATE INDEX "SettingApproval_branchId_status_idx" ON "SettingApproval"("branchId", "status");

-- CreateIndex
CREATE INDEX "SettingApproval_targetType_targetId_idx" ON "SettingApproval"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "SettingAudit_branchId_settingKey_idx" ON "SettingAudit"("branchId", "settingKey");

-- CreateIndex
CREATE INDEX "SettingAudit_createdAt_idx" ON "SettingAudit"("createdAt");

-- CreateIndex
CREATE INDEX "AssessmentSchemeScope_level_branchId_idx" ON "AssessmentSchemeScope"("level", "branchId");

-- CreateIndex
CREATE INDEX "AssessmentSchemeScope_classGroupId_idx" ON "AssessmentSchemeScope"("classGroupId");

-- CreateIndex
CREATE INDEX "AssessmentSchemeScope_teacherUserId_subjectId_idx" ON "AssessmentSchemeScope"("teacherUserId", "subjectId");

-- CreateIndex
CREATE INDEX "AssessmentSchemeDraft_branchId_teacherUserId_idx" ON "AssessmentSchemeDraft"("branchId", "teacherUserId");

-- CreateIndex
CREATE INDEX "AssessmentSchemeDraft_status_idx" ON "AssessmentSchemeDraft"("status");

-- CreateIndex
CREATE INDEX "AdminSelfApprovalGrant_branchId_idx" ON "AdminSelfApprovalGrant"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSelfApprovalGrant_branchId_adminUserId_key" ON "AdminSelfApprovalGrant"("branchId", "adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardLayout_code_key" ON "ReportCardLayout"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationPageConfig_branchId_key" ON "VerificationPageConfig"("branchId");

-- AddForeignKey
ALTER TABLE "SettingValue" ADD CONSTRAINT "SettingValue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingApproval" ADD CONSTRAINT "SettingApproval_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingApproval" ADD CONSTRAINT "SettingApproval_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingApproval" ADD CONSTRAINT "SettingApproval_deciderUserId_fkey" FOREIGN KEY ("deciderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingAudit" ADD CONSTRAINT "SettingAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeScope" ADD CONSTRAINT "AssessmentSchemeScope_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "AssessmentScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeScope" ADD CONSTRAINT "AssessmentSchemeScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeScope" ADD CONSTRAINT "AssessmentSchemeScope_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeScope" ADD CONSTRAINT "AssessmentSchemeScope_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeScope" ADD CONSTRAINT "AssessmentSchemeScope_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSelfApprovalGrant" ADD CONSTRAINT "AdminSelfApprovalGrant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSelfApprovalGrant" ADD CONSTRAINT "AdminSelfApprovalGrant_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSelfApprovalGrant" ADD CONSTRAINT "AdminSelfApprovalGrant_grantedBySuperadminId_fkey" FOREIGN KEY ("grantedBySuperadminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSelfApprovalGrant" ADD CONSTRAINT "AdminSelfApprovalGrant_unseenReviewerUserId_fkey" FOREIGN KEY ("unseenReviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationPageConfig" ADD CONSTRAINT "VerificationPageConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
