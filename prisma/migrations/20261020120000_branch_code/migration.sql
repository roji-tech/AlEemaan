-- Branch.code: the prefix of a branch's invoice and receipt numbers. ADDITIVE and safe on the live school: one column, one index, one check and one trigger; no existing
-- invoice, receipt or branch name changes. Run BEFORE the code that reads it (ADR 0003).
--
-- Why: the prefix used to be the first four letters of the branch NAME, and the four branches the setup wizard creates collide in pairs (Secondary (English) and Secondary
-- (Arabic) are both SECO, the two Primary branches PRIM). `Invoice.invoiceNo` is unique across the school and the sequence is per branch, so the second branch to issue its first
-- invoice of a year failed on the unique index, and receipts (no unique index) were silently duplicated.
--
-- 1. The column, empty for now so the backfill can see every row.
-- 2. Existing branches get the code they already had in effect (the first four letters or digits of the name, capitals); where two or more would be the same, the oldest keeps it
--    and the others get 2, 3, ... after it. A name with fewer than two letters or digits gets BR. Numbers already issued are not touched.
-- 3. Unique, and 2-6 capital letters or digits (the invoice number strips everything else and keeps six).
-- 4. A branch inserted WITHOUT a code (the setup wizard, the New branch button, a test, a console) gets one made the same way by a trigger, so no way of creating a branch can
--    leave it empty or repeat one. A code given on insert is kept, and the check and the unique index judge it. Concurrent inserts take the same advisory lock until commit, so
--    two new branches cannot pick the same code.

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "code" TEXT NOT NULL DEFAULT '';

-- Backfill
WITH derived AS (
  SELECT "id", "createdAt",
         CASE WHEN length(letters) >= 2 THEN letters ELSE 'BR' END AS base
  FROM (SELECT "id", "createdAt", upper(left(regexp_replace("name", '[^A-Za-z0-9]', '', 'g'), 4)) AS letters FROM "Branch") x
),
ranked AS (
  SELECT "id", base, row_number() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS n FROM derived
)
UPDATE "Branch" b
SET "code" = CASE WHEN r.n = 1 THEN r.base ELSE r.base || r.n::text END
FROM ranked r
WHERE b."id" = r."id";

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_code_shape" CHECK ("code" ~ '^[A-Z0-9]{2,6}$');

CREATE FUNCTION "branch_assign_code"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  letters text;
  base text;
  candidate text;
  n integer := 1;
BEGIN
  IF NEW."code" IS NULL OR NEW."code" = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('Branch_assign_code'));
    letters := upper(left(regexp_replace(NEW."name", '[^A-Za-z0-9]', '', 'g'), 4));
    base := CASE WHEN length(letters) >= 2 THEN letters ELSE 'BR' END;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM "Branch" WHERE "code" = candidate) LOOP
      n := n + 1;
      candidate := base || n::text;
    END LOOP;
    NEW."code" := candidate;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Branch_assign_code" BEFORE INSERT ON "Branch" FOR EACH ROW EXECUTE FUNCTION "branch_assign_code"();
