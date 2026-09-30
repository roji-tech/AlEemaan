-- Synced to Octalve Edu's built-and-verified auth (domain-implementation-plan.md §0.5.1.6).
--
-- Written to be SAFE ON A DATABASE WITH REAL ACCOUNTS AND LIVE SESSIONS: nobody is
-- signed out, no session is lengthened, and nothing is silently merged.

-- 1. Two-level session expiry.
--    `expires` stays the idle expiry. `absoluteExpires` is the new hard cap.
--    Backfill from each row's existing `expires`: an existing session ends exactly
--    when it always would have (never later), so this can neither log anyone out
--    early nor extend a session beyond what its holder was already promised.
ALTER TABLE "Session" ADD COLUMN "absoluteExpires" TIMESTAMP(3);
UPDATE "Session" SET "absoluteExpires" = "expires";
ALTER TABLE "Session" ALTER COLUMN "absoluteExpires" SET NOT NULL;

-- 2. Email case-insensitivity enforced in Postgres itself, not only in application
--    code: a seed script or direct SQL import can't bypass it. (Prisma's schema
--    language cannot express CHECK constraints.)
--
--    Two accounts that differ only by case would collide once normalised. Refuse to
--    guess which one survives — abort with a message a human can act on, before any
--    row is touched. (Prisma runs a migration in one transaction, so nothing is left
--    half-applied.)
DO $$
DECLARE
  clash text;
BEGIN
  SELECT string_agg(DISTINCT lower("email"), ', ') INTO clash
  FROM "User"
  WHERE "email" IS NOT NULL
  GROUP BY lower("email")
  HAVING count(*) > 1
  LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot enforce lowercase emails: more than one account exists for "%" differing only by letter case. Merge or delete the duplicates, then re-run the migration.', clash;
  END IF;
END $$;

UPDATE "User" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");

ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));
