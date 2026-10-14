-- Results workflow, Slice P2b (plan "Build design - Slice P2"). ADDITIVE and safe on the live school: one column becomes nullable and one trigger is added; nothing
-- existing changes meaning and no row is touched. Run BEFORE the code that reads it (ADR 0003).
--
-- 1. ResultAudit.actorUserId may be NULL: that is "the system" (a term closing).
-- 2. When a session is CLOSED, every PUBLISHED result of its terms is LOCKED in the same statement, with a history row - whichever code closes the session (it is
--    closed from three places in the app), so a closed year can never keep an unlocked published result.

-- AlterTable
ALTER TABLE "ResultAudit" ALTER COLUMN "actorUserId" DROP NOT NULL;


CREATE FUNCTION "session_closed_locks_results"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'CLOSED' AND OLD."status" <> 'CLOSED' THEN
    WITH locked AS (
      UPDATE "Result" r SET "status" = 'LOCKED', "lockedAt" = now(), "updatedAt" = now()
      WHERE r."status" = 'PUBLISHED' AND r."periodId" IN (SELECT p."id" FROM "AcademicPeriod" p WHERE p."sessionId" = NEW."id")
      RETURNING r."id", r."branchId", r."total"
    )
    INSERT INTO "ResultAudit" ("id", "branchId", "resultId", "actorUserId", "action", "fromStatus", "toStatus", "fromTotal", "toTotal", "reason", "createdAt")
    SELECT md5(random()::text || clock_timestamp()::text || l."id"), l."branchId", l."id", NULL, 'LOCKED', 'PUBLISHED', 'LOCKED', l."total", l."total", 'The term closed', now()
    FROM locked l;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AcademicSession_closed_locks_results" AFTER UPDATE OF "status" ON "AcademicSession" FOR EACH ROW EXECUTE FUNCTION "session_closed_locks_results"();
