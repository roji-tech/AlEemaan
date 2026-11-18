-- Problem reports from the Quick Tools drawer (task 0099): a new enum and a new table, nothing else changes.
-- Additive and safe on a live database: no existing table or row is touched except that "User" gains a foreign key target (no column is added to it).
-- Order: merge to prod, THEN run the "Migrate production" workflow (staging runs it by itself on a push to master). Until it runs, sending a report answers an error; nothing else depends on it.

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('PROBLEM', 'CONFUSING', 'IDEA', 'OTHER');

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "reporterName" TEXT,
    "reporterEmail" TEXT,
    "reporterRoles" TEXT,
    "branches" TEXT,
    "category" "ReportCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "userAgent" TEXT,
    "viewport" TEXT,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemReport_createdAt_idx" ON "ProblemReport"("createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_userId_idx" ON "ProblemReport"("userId");

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
