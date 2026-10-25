-- Question bank core (Task 0032 slice 2): what the bank needs to store images, keep every version of a question, and keep the rule "a question may appear later, never
-- disappear" in the database, not only in the service. ADDITIVE and safe on the live school: one new table, two new columns on an EMPTY table, new checks and triggers on
-- question bank tables only; nothing existing changes meaning and no row is touched. Run BEFORE the code that reads it (ADR 0003).
--
-- 1. QuestionBankImage.store (which backend holds the file) and .contentType (what OUR record says it is; the store is never asked). Both are NOT NULL with no default: no code
--    wrote an image before this slice, so the table is empty everywhere, and if a row did exist the SET NOT NULL below would fail loudly instead of inventing a backend. The
--    storage key is unique, so two rows can never point at one stored file (deleting one would delete the other's picture).
-- 2. QuestionBankItemVersion: what the question looked like at each version ("a fix creates a new version, old versions are kept"). Append-only, like the review and audit tables.
-- 3. Visibility only moves forward, in the database: TEACHERS_ONLY -> TEACHERS_ONLY_UNTIL -> PRACTICE, never back; a date that has passed cannot be pushed into the future; a date
--    that is set or moved must be in the future (an already-passed date is PRACTICE, said plainly). TEACHERS_ONLY_UNTIL has a date and nothing else does. Retiring is a status
--    change, not a visibility change, so it is not affected.
-- 4. An approved or retired item says who approved it and when, and a retired item says why.

-- 1. Images
ALTER TABLE "QuestionBankImage" ADD COLUMN "store" TEXT, ADD COLUMN "contentType" TEXT;
ALTER TABLE "QuestionBankImage" ALTER COLUMN "store" SET NOT NULL, ALTER COLUMN "contentType" SET NOT NULL;
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_store" CHECK ("store" IN ('s3', 'r2', 'cloudinary', 'memory'));
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_contentType" CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp'));
CREATE UNIQUE INDEX "QuestionBankImage_storageKey_key" ON "QuestionBankImage"("storageKey");

-- 2. Versions
CREATE TABLE "QuestionBankItemVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankItemVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionBankItemVersion_itemId_version_key" ON "QuestionBankItemVersion"("itemId", "version");
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_sane" CHECK ("version" >= 1 AND jsonb_typeof("snapshot") = 'object');
CREATE TRIGGER "QuestionBankItemVersion_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankItemVersion" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();

-- 3. Visibility
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_until" CHECK (("visibility" = 'TEACHERS_ONLY_UNTIL') = ("visibleFrom" IS NOT NULL));

CREATE FUNCTION "question_bank_visibility_forward"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_rank integer;
  new_rank integer;
  -- "visibleFrom" is a TIMESTAMP without a time zone that holds UTC (that is how Prisma writes it); now() is compared in the session's zone, so on a server set to any zone but UTC the
  -- two were an hour or more apart. Compare like with like.
  utc_now timestamp := (now() AT TIME ZONE 'UTC');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."visibility" = OLD."visibility" AND NEW."visibleFrom" IS NOT DISTINCT FROM OLD."visibleFrom" THEN
    RETURN NEW; -- nothing about visibility changes
  END IF;

  -- a date that is set or moved is in the future (a date that has passed is PRACTICE, and is set as PRACTICE)
  IF NEW."visibility" = 'TEACHERS_ONLY_UNTIL'
     AND (TG_OP = 'INSERT' OR OLD."visibility" <> 'TEACHERS_ONLY_UNTIL' OR NEW."visibleFrom" IS DISTINCT FROM OLD."visibleFrom")
     AND NEW."visibleFrom" <= utc_now THEN
    RAISE EXCEPTION 'The date a question becomes visible must be in the future' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_rank := CASE OLD."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    new_rank := CASE NEW."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    IF new_rank < old_rank THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: visibility only moves forward' USING ERRCODE = 'check_violation';
    END IF;
    -- its date has passed, so pupils can already see it: it cannot be pushed back (the check above already refused a new date in the past)
    IF OLD."visibility" = 'TEACHERS_ONLY_UNTIL' AND OLD."visibleFrom" <= utc_now AND NEW."visibility" = 'TEACHERS_ONLY_UNTIL' THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: its date has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "QuestionBankItem_visibility_forward" BEFORE INSERT OR UPDATE OF "visibility", "visibleFrom" ON "QuestionBankItem" FOR EACH ROW EXECUTE FUNCTION "question_bank_visibility_forward"();

-- 4. Approval
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_decided" CHECK (
  ("status" NOT IN ('APPROVED', 'RETIRED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
  AND ("status" <> 'RETIRED' OR length(btrim(COALESCE("retiredReason", ''), E' \t\r\n\f\v ')) > 0)
);
