-- Draft invitations (task 0101 D2). Additive: a new nullable column, and two columns loosened to allow null.
-- A draft is an invitation that has been saved but not sent: no token, no expiry, nothing e-mailed.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "sentAt" TIMESTAMP(3);

-- Every invitation made before drafts existed was sent when it was made.
UPDATE "Invitation" SET "sentAt" = "createdAt" WHERE "tokenHash" IS NOT NULL;

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "tokenHash" DROP NOT NULL;
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- A draft has no link at all, and a link has all three: the token, its expiry and when it was sent.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_draft_or_sent" CHECK (
  ("tokenHash" IS NULL AND "expiresAt" IS NULL AND "sentAt" IS NULL)
  OR ("tokenHash" IS NOT NULL AND "expiresAt" IS NOT NULL AND "sentAt" IS NOT NULL)
);
