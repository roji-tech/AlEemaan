-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('TERM', 'SEMESTER');

-- CreateTable
CREATE TABLE "AcademicSession" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "archivedAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "closeForced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicPeriod" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "PeriodKind" NOT NULL DEFAULT 'TERM',
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "name" TEXT NOT NULL DEFAULT 'Al-Eemaan Schools',
    "principal" TEXT,
    "phone" TEXT,
    "motto" TEXT,
    "address" TEXT,
    "email" TEXT,
    "website" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicSession_branchId_status_idx" ON "AcademicSession"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSession_branchId_label_key" ON "AcademicSession"("branchId", "label");

-- CreateIndex
CREATE INDEX "AcademicPeriod_branchId_sessionId_idx" ON "AcademicPeriod"("branchId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicPeriod_sessionId_ordinal_key" ON "AcademicPeriod"("sessionId", "ordinal");

-- AddForeignKey
ALTER TABLE "AcademicSession" ADD CONSTRAINT "AcademicSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPeriod" ADD CONSTRAINT "AcademicPeriod_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPeriod" ADD CONSTRAINT "AcademicPeriod_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
