-- Branch administrators and superadmins (plan S1, S4). ADDITIVE and safe on the live school: old code ignores the column.
-- Run this BEFORE the code that reads it (ADR 0003).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Backfill, in the same migration: until now an ADMIN membership administered every branch, so every person who holds an ACTIVE one keeps
-- exactly that authority as a superadmin; nothing changes for the school on day one. A deactivated membership is no membership (ADR 0002).
-- Idempotent: running it again sets the same rows to the same value.
UPDATE "User" SET "isSuperAdmin" = true
WHERE id IN (SELECT "userId" FROM "Membership" WHERE role = 'ADMIN' AND "deactivatedAt" IS NULL);
