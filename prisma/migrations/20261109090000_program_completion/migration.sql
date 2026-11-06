-- Programs, slice P5 (task 0043, section 12): completing a place or a whole fixed-term program, and certificates with a public check page.
--
-- ADDITIVE ONLY: wording, signatories and the completion rule on Program (all with safe defaults), one column on ProgramParticipant, a status enum, two tables. Nothing that exists is changed,
-- and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI
-- session. Run it after 20261108090000_program_fees.

-- AlterTable: the wording of the program's certificates (placeholders {name} {program} {from} {to} {school}; plain text), up to two signatories as [{ name, title }], and the completion rule.
ALTER TABLE "Program" ADD COLUMN "certTitle" TEXT NOT NULL DEFAULT 'Certificate of Completion',
ADD COLUMN "certBody" TEXT NOT NULL DEFAULT 'This is to certify that {name} has completed {program} at {school}, from {from} to {to}.',
ADD COLUMN "certSignatories" JSONB,
ADD COLUMN "completionMinAverage" DECIMAL(5,2),
ADD COLUMN "completionRequirePassed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "noCertWhileOwing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: why a place was completed although the person did not meet the program's rule (kept).
ALTER TABLE "ProgramParticipant" ADD COLUMN "completionOverrideReason" TEXT;

-- CreateEnum
CREATE TYPE "ProgramCertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- CreateTable
CREATE TABLE "ProgramCertificate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "completedOn" DATE NOT NULL,
    -- The certificate as it was when issued: a later change to the wording or to a name never changes it.
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "signatories" JSONB NOT NULL DEFAULT '[]',
    "status" "ProgramCertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "replacesId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one counter per year for the whole school, so CERT-2026-0001 is unique across programs.
CREATE TABLE "ProgramCertificateCounter" (
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramCertificateCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCertificate_serialNo_key" ON "ProgramCertificate"("serialNo");
CREATE UNIQUE INDEX "ProgramCertificate_verifyToken_key" ON "ProgramCertificate"("verifyToken");
CREATE UNIQUE INDEX "ProgramCertificate_programId_id_key" ON "ProgramCertificate"("programId", "id");
CREATE INDEX "ProgramCertificate_programId_participantId_idx" ON "ProgramCertificate"("programId", "participantId");
-- At most one certificate per person and program that is in force; a withdrawn one makes room for a new one.
CREATE UNIQUE INDEX "ProgramCertificate_one_issued_key" ON "ProgramCertificate"("programId", "participantId") WHERE "status" = 'ISSUED';

-- AddForeignKey: a certificate is of a person of THIS program.
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES "ProgramParticipant"("programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "ProgramCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_certTitle_check" CHECK (char_length("certTitle") BETWEEN 1 AND 80);
ALTER TABLE "Program" ADD CONSTRAINT "Program_certBody_check" CHECK (char_length("certBody") BETWEEN 1 AND 600);
ALTER TABLE "Program" ADD CONSTRAINT "Program_certSignatories_check" CHECK ("certSignatories" IS NULL OR (jsonb_typeof("certSignatories") = 'array' AND jsonb_array_length("certSignatories") <= 2));
ALTER TABLE "Program" ADD CONSTRAINT "Program_completionMinAverage_check" CHECK ("completionMinAverage" IS NULL OR ("completionMinAverage" >= 0 AND "completionMinAverage" <= 100));
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_override_check" CHECK ("completionOverrideReason" IS NULL OR (char_length(btrim("completionOverrideReason")) BETWEEN 3 AND 500 AND "status" = 'COMPLETED'));
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_text_check" CHECK (char_length("title") BETWEEN 1 AND 80 AND char_length("bodyText") BETWEEN 1 AND 1200 AND char_length("personName") BETWEEN 1 AND 200);
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_token_check" CHECK ("verifyToken" ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_revoked_check" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL) AND ("status" <> 'REVOKED' OR char_length(btrim(coalesce("revokeReason", ''))) >= 3));
