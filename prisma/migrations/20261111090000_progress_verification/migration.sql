-- Progress records, slice R2 (task 0044): who writes, verification and the lock on an entry.
--
-- ADDITIVE ONLY: five columns on Program (all with defaults that keep today's behaviour: anyone assigned writes, no verification, four-eyes on, locks of 300 and 30 seconds), one enum, one table.
-- The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261110090000_progress_records.

-- CreateEnum
CREATE TYPE "ProgressWriters" AS ENUM ('TEACHERS', 'ASSIGNED', 'BOTH');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "progressFourEyes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "progressLockInactivity" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN "progressLockRelease" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "progressRequireVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "progressWriters" "ProgressWriters" NOT NULL DEFAULT 'BOTH';

-- CreateTable
CREATE TABLE "ProgressLock" (
    "entryId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "holderUserId" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressLock_pkey" PRIMARY KEY ("entryId")
);

-- CreateIndex
CREATE INDEX "ProgressLock_expiresAt_idx" ON "ProgressLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLock_programId_entryId_key" ON "ProgressLock"("programId", "entryId");

-- AddForeignKey
ALTER TABLE "ProgressLock" ADD CONSTRAINT "ProgressLock_programId_entryId_fkey" FOREIGN KEY ("programId", "entryId") REFERENCES "ProgressEntry"("programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressLockInactivity_check" CHECK ("progressLockInactivity" BETWEEN 60 AND 3600);
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressLockRelease_check" CHECK ("progressLockRelease" BETWEEN 0 AND 300);
ALTER TABLE "ProgressLock" ADD CONSTRAINT "ProgressLock_times_check" CHECK ("expiresAt" >= "heartbeatAt" AND ("releaseAt" IS NULL OR "releaseAt" >= "heartbeatAt"));
