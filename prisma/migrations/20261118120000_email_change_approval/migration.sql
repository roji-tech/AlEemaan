-- Email change needs approval (task 0088). ADDITIVE: one enum and one table; no existing row changes. Run BEFORE the code that reads it (ADR 0003).
--
-- A member's request to change their email address now waits for an administrator of their branch (or a superadmin); an administrator's waits for a superadmin;
-- a superadmin's needs nobody. The link to the new address is only mailed once the request is approved. Requests that were already mailed a link before this
-- migration keep working: they live in "EmailChangeToken", which is not touched.

-- CreateEnum
CREATE TYPE "EmailChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "status" "EmailChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requiredLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deciderUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,

    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailChangeRequest_userId_status_idx" ON "EmailChangeRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_status_createdAt_idx" ON "EmailChangeRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_deciderUserId_fkey" FOREIGN KEY ("deciderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
