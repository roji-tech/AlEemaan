-- CreateEnum
CREATE TYPE "FeeRecurrence" AS ENUM ('THIS_TERM', 'EVERY_TERM', 'EVERY_SESSION');

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "recurrence" "FeeRecurrence" NOT NULL DEFAULT 'THIS_TERM',
ALTER COLUMN "periodId" DROP NOT NULL;


-- A line is for one term exactly when it does not recur: THIS_TERM has a period, EVERY_TERM and EVERY_SESSION have none. Every existing row is THIS_TERM with its period.
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_recurrence_period" CHECK (("recurrence" = 'THIS_TERM') = ("periodId" IS NOT NULL));
