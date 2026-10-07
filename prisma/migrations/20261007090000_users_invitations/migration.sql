-- Users pages and invitations (a port of Octalve Edu's 0.5.4). ADDITIVE ONLY — this is a LIVE school: no existing row is rewritten, no
-- existing column changes, nothing is dropped. Run this BEFORE deploying the code that reads "deactivatedAt"; the previous code keeps
-- working against the migrated database (it never selects the new column), so the migration is also its own rollback window.

-- A nullable column with no default is instant and rewrites nothing: every existing membership reads as ACTIVE (deactivatedAt IS NULL).
ALTER TABLE "Membership" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "branchId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_createdAt_idx" ON "Invitation"("createdAt");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- rules Prisma's schema language cannot express ---------------------------------------------------------------------------
-- One OPEN invitation per address (not accepted, not revoked), whatever the application does: two administrators inviting the same
-- person at the same instant cannot both succeed. Addresses are stored lower-cased by the application; the index is on lower() anyway.
CREATE UNIQUE INDEX "Invitation_one_live_per_address" ON "Invitation"(lower("email")) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
-- The invitation's own address is lower-case, like User.email (a CHECK on that table already says so).
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_email_lowercase" CHECK ("email" = lower("email"));
