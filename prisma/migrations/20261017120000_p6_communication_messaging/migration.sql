-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationDispatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subjectTemplate" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "variables" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "templateId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianLinkToken" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAuditLog" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "actorUserId" TEXT,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_branchId_id_key" ON "NotificationTemplate"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_branchId_code_channel_key" ON "NotificationTemplate"("branchId", "code", "channel");

-- CreateIndex
CREATE INDEX "NotificationTemplate_branchId_channel_idx" ON "NotificationTemplate"("branchId", "channel");

-- CreateIndex
CREATE INDEX "NotificationTemplate_branchId_code_idx" ON "NotificationTemplate"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDispatch_branchId_id_key" ON "NotificationDispatch"("branchId", "id");

-- CreateIndex
CREATE INDEX "NotificationDispatch_branchId_status_idx" ON "NotificationDispatch"("branchId", "status");

-- CreateIndex
CREATE INDEX "NotificationDispatch_branchId_channel_idx" ON "NotificationDispatch"("branchId", "channel");

-- CreateIndex
CREATE INDEX "NotificationDispatch_branchId_createdAt_idx" ON "NotificationDispatch"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianLinkToken_branchId_id_key" ON "GuardianLinkToken"("branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianLinkToken_branchId_tokenHash_key" ON "GuardianLinkToken"("branchId", "tokenHash");

-- CreateIndex
CREATE INDEX "GuardianLinkToken_branchId_studentId_idx" ON "GuardianLinkToken"("branchId", "studentId");

-- CreateIndex
CREATE INDEX "GuardianLinkToken_branchId_expiresAt_idx" ON "GuardianLinkToken"("branchId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationAuditLog_branchId_id_key" ON "NotificationAuditLog"("branchId", "id");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_branchId_event_idx" ON "NotificationAuditLog"("branchId", "event");

-- CreateIndex
CREATE INDEX "NotificationAuditLog_branchId_createdAt_idx" ON "NotificationAuditLog"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES "NotificationTemplate"("branchId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLinkToken" ADD CONSTRAINT "GuardianLinkToken_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLinkToken" ADD CONSTRAINT "GuardianLinkToken_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES "StudentRecord"("branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAuditLog" ADD CONSTRAINT "NotificationAuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
