-- The baseline (task 0051, 2026-11-11): the whole migration history as ONE migration.
--
-- It is the final schema of the 52 migrations that existed before it (20260928081559_init ... 20261113090000_progress_display), written out by pg_dump --schema-only from a database those 52
-- had been applied to, one file at a time, as Prisma does. Every table, column, constraint, index, trigger and function is in it; the 52 migrations wrote no data, so nothing is lost. What it
-- does NOT keep is the comments that explained each hand-written statement and the order they were made in: those are in the git history (the last commit that still has the 52 files is
-- b47df0e, `git show b47df0e:prisma/migrations/<name>/migration.sql`) and in the task records under docs/tasks.
--
-- This rewrites a history that a hosted database may already have applied part of (docs/HANDOVER.md describes a hosted database that the maintainer migrates by hand, and the Vercel project has
-- a DATABASE_URL for Production and Preview; whether any of the 52 ran there was not checked). It was done at the
-- maintainer's word ("everything is scrappable"). An applied migration is never edited or merged; a database that applied the old 52 must be dropped or reset, NOT migrated: `prisma migrate
-- deploy` on it would run this file on top of tables that already exist and fail. Do not do this again once a database that matters exists.
--
-- Two edits were made to the dump: the psql-only lines and the settings that would outlive the migration were removed. The enum values added by the old migrations (for example
-- "StandingSubject" PARTICIPANT) are simply part of the type here; a later migration must not add a value and use it in the same file (a new enum value cannot be used in the transaction that
-- adds it).
-- Also: the string literals that hold a carriage return, a form feed or a non-breaking space (the trim sets of some CHECK constraints) are written as E'...' escapes, as the original
-- migrations wrote them, so that no tool that normalises line endings or invisible characters can change them.

SET check_function_bodies = false;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET check_function_bodies = false;

--
-- Name: AnnouncementStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AnnouncementStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: ApprovalScopeKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalScopeKind" AS ENUM (
    'GENERAL',
    'SECTION',
    'CLASS'
);

--
-- Name: ApprovalVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalVisibility" AS ENUM (
    'VISIBLE',
    'HIDDEN_TO_SUBJECT'
);

--
-- Name: AssignmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssignmentStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: AttendanceSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceSource" AS ENUM (
    'ONLINE',
    'OFFLINE_SYNC'
);

--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'PRESENT',
    'LATE',
    'ABSENT',
    'EXCUSED'
);

--
-- Name: BankItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankItemStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'RETIRED'
);

--
-- Name: BankKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankKind" AS ENUM (
    'ASSESSMENT',
    'QUESTIONNAIRE'
);

--
-- Name: BankQuestionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankQuestionType" AS ENUM (
    'SINGLE',
    'MULTI',
    'TRUE_FALSE',
    'SHORT',
    'RATING',
    'TEXT'
);

--
-- Name: BankReviewOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankReviewOutcome" AS ENUM (
    'APPROVED',
    'EDITED',
    'REJECTED',
    'RETIRED'
);

--
-- Name: BankReviewerScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankReviewerScope" AS ENUM (
    'GENERAL',
    'SUBJECT'
);

--
-- Name: BankVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankVisibility" AS ENUM (
    'PRACTICE',
    'TEACHERS_ONLY',
    'TEACHERS_ONLY_UNTIL'
);

--
-- Name: DecisionMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DecisionMode" AS ENUM (
    'AUTOMATIC',
    'OVERRIDDEN'
);

--
-- Name: DiscountWorkflowMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DiscountWorkflowMode" AS ENUM (
    'MANUAL_OVERRIDE',
    'SCHOLARSHIP',
    'SIBLING_DISCOUNT',
    'STAFF_CHILD'
);

--
-- Name: EnrollmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EnrollmentStatus" AS ENUM (
    'ACTIVE',
    'PROMOTED',
    'REPEATED',
    'WITHDRAWN',
    'TRANSFERRED',
    'ALUMNI',
    'EXPELLED'
);

--
-- Name: FormAudienceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormAudienceKind" AS ENUM (
    'MEMBERS',
    'PUBLIC'
);

--
-- Name: FormKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormKind" AS ENUM (
    'PRACTICE_SET',
    'QUESTIONNAIRE',
    'PAPER_WORK'
);

--
-- Name: FormMarkingMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormMarkingMethod" AS ENUM (
    'AUTO',
    'MANUAL'
);

--
-- Name: FormMarkingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormMarkingStatus" AS ENUM (
    'NOT_REQUIRED',
    'PENDING',
    'PARTIALLY_MARKED',
    'MARKED'
);

--
-- Name: FormResponseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormResponseStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED'
);

--
-- Name: FormStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'CLOSED',
    'ARCHIVED'
);

--
-- Name: Gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Gender" AS ENUM (
    'MALE',
    'FEMALE'
);

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'UNPAID',
    'PARTIALLY_PAID',
    'PAID',
    'WAIVED',
    'CANCELLED'
);

--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'EMAIL',
    'SMS',
    'WHATSAPP',
    'IN_APP'
);

--
-- Name: NotificationDispatchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationDispatchStatus" AS ENUM (
    'QUEUED',
    'PROCESSING',
    'SENT',
    'FAILED',
    'RETRYING'
);

--
-- Name: ParticipantKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ParticipantKind" AS ENUM (
    'STUDENT',
    'STAFF',
    'GUARDIAN',
    'ADULT',
    'CHILD'
);

--
-- Name: PaymentProvider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentProvider" AS ENUM (
    'MANUAL',
    'PAYSTACK',
    'FLUTTERWAVE'
);

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);

--
-- Name: PeriodKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PeriodKind" AS ENUM (
    'TERM',
    'SEMESTER'
);

--
-- Name: Permission; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Permission" AS ENUM (
    'CAN_APPROVE_RESULTS',
    'CAN_MANAGE_FINANCE',
    'CAN_PUBLISH_CONTENT',
    'CAN_MANAGE_USERS',
    'CAN_VIEW_FORM_RESULTS'
);

--
-- Name: PracticeFeedbackMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PracticeFeedbackMode" AS ENUM (
    'EACH',
    'END'
);

--
-- Name: PrintTargetKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PrintTargetKind" AS ENUM (
    'QUESTION_BANK_ITEM',
    'FORM',
    'QUIZ',
    'PRACTICE_SESSION',
    'FORM_RESPONSE'
);

--
-- Name: ProgramAssessmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramAssessmentStatus" AS ENUM (
    'DRAFT',
    'OPEN',
    'MARKED',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: ProgramCertificateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramCertificateStatus" AS ENUM (
    'ISSUED',
    'REVOKED'
);

--
-- Name: ProgramFeeBilledTo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeBilledTo" AS ENUM (
    'PARTICIPANT',
    'GUARDIAN'
);

--
-- Name: ProgramFeeFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeFrequency" AS ENUM (
    'ONCE',
    'MONTHLY',
    'YEARLY'
);

--
-- Name: ProgramFeeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeStatus" AS ENUM (
    'ACTIVE',
    'ARCHIVED'
);

--
-- Name: ProgramKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramKind" AS ENUM (
    'ONGOING',
    'FIXED_TERM'
);

--
-- Name: ProgramPlaceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramPlaceStatus" AS ENUM (
    'ACTIVE',
    'WITHDRAWN',
    'COMPLETED'
);

--
-- Name: ProgramScoreCode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramScoreCode" AS ENUM (
    'ABSENT',
    'EXCUSED',
    'EXEMPT',
    'NOT_SITTING'
);

--
-- Name: ProgramStaffRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStaffRole" AS ENUM (
    'ADMIN',
    'SUPERVISOR',
    'TEACHER',
    'RECORDER'
);

--
-- Name: ProgramStaffStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStaffStatus" AS ENUM (
    'ACTIVE',
    'ENDED'
);

--
-- Name: ProgramStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COMPLETED',
    'ARCHIVED'
);

--
-- Name: ProgressEntryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressEntryStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'VERIFIED'
);

--
-- Name: ProgressGuardianDetail; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressGuardianDetail" AS ENUM (
    'SUMMARY',
    'FULL'
);

--
-- Name: ProgressWriters; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressWriters" AS ENUM (
    'TEACHERS',
    'ASSIGNED',
    'BOTH'
);

--
-- Name: PromotionBatchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromotionBatchStatus" AS ENUM (
    'PREVIEW',
    'COMMITTED',
    'REVERTED'
);

--
-- Name: PromotionDecision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromotionDecision" AS ENUM (
    'PROMOTED',
    'REPEATED',
    'GRADUATED',
    'WITHDRAWN'
);

--
-- Name: PupilNameFormat; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PupilNameFormat" AS ENUM (
    'FULL',
    'FIRST_LAST_INITIAL',
    'INITIALS'
);

--
-- Name: QuestionReportOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionReportOutcome" AS ENUM (
    'FIXED',
    'NOT_AN_ERROR',
    'NEEDS_DISCUSSION'
);

--
-- Name: QuestionReportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionReportStatus" AS ENUM (
    'OPEN',
    'RESOLVED',
    'DISMISSED'
);

--
-- Name: QuestionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionType" AS ENUM (
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
    'SHORT_ANSWER'
);

--
-- Name: QuizStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuizStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: ReportCardLayoutType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReportCardLayoutType" AS ENUM (
    'DEFAULT',
    'LEGACY'
);

--
-- Name: ResultStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResultStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'PUBLISHED',
    'LOCKED'
);

--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
    'PARENT'
);

--
-- Name: SchemeScopeLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SchemeScopeLevel" AS ENUM (
    'GLOBAL',
    'BRANCH',
    'CLASS_GROUP',
    'TEACHER_SUBJECT'
);

--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'CLOSED'
);

--
-- Name: SettingScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SettingScope" AS ENUM (
    'GLOBAL',
    'BRANCH'
);

--
-- Name: SettingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SettingStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED'
);

--
-- Name: StaffCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StaffCategory" AS ENUM (
    'TEACHING',
    'NON_TEACHING'
);

--
-- Name: StandingEventAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingEventAction" AS ENUM (
    'SUSPENDED',
    'EXPELLED',
    'TERMINATED',
    'LIFTED',
    'REINSTATED'
);

--
-- Name: StandingScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingScope" AS ENUM (
    'BRANCH',
    'SCHOOL'
);

--
-- Name: StandingState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingState" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'EXPELLED',
    'TERMINATED'
);

--
-- Name: StandingSubject; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingSubject" AS ENUM (
    'STUDENT',
    'STAFF',
    'PARTICIPANT'
);

--
-- Name: SubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubmissionStatus" AS ENUM (
    'PENDING',
    'SUBMITTED',
    'LATE',
    'GRADED',
    'RESUBMIT_REQUESTED'
);

--
-- Name: TurnInStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TurnInStatus" AS ENUM (
    'PENDING',
    'HANDED_IN',
    'LATE'
);

--
-- Name: assessment_component_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assessment_component_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  locked timestamp(3);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT "lockedAt" INTO locked FROM "AssessmentScheme" WHERE "id" = COALESCE(NEW."schemeId", OLD."schemeId");
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'assessment scheme % is locked: its components cannot change', COALESCE(NEW."schemeId", OLD."schemeId") USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

--
-- Name: assessment_scheme_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assessment_scheme_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."totalMax", NEW."examMax", NEW."version", NEW."classGroupId", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."totalMax", OLD."examMax", OLD."version", OLD."classGroupId", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'assessment scheme % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

--
-- Name: grade_band_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_band_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  locked timestamp(3);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT "lockedAt" INTO locked FROM "GradeScale" WHERE "id" = COALESCE(NEW."scaleId", OLD."scaleId");
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'grade scale % is locked: its bands cannot change', COALESCE(NEW."scaleId", OLD."scaleId") USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

--
-- Name: grade_scale_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_scale_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."version", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."version", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'grade scale % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

--
-- Name: program_attendance_change_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.program_attendance_change_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'ProgramAttendanceChange is append-only';
END;
$$;

--
-- Name: program_score_change_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.program_score_change_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'ProgramScoreChange is append-only';
END;
$$;

--
-- Name: progress_entry_revision_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.progress_entry_revision_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'ProgressEntryRevision is append-only';
END;
$$;

--
-- Name: progress_template_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.progress_template_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'ProgressTemplate is immutable';
END;
$$;

--
-- Name: question_bank_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

--
-- Name: question_bank_image_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_image_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."itemId" = OLD."itemId" THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "QuestionBankItem" WHERE "id" = NEW."itemId" FOR UPDATE;
  IF (SELECT count(*) FROM "QuestionBankImage" WHERE "itemId" = NEW."itemId") >= 4 THEN
    RAISE EXCEPTION 'A question bank item can have at most 4 images' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

--
-- Name: question_bank_visibility_forward(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_visibility_forward() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: result_audit_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_audit_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'ResultAudit is append-only' USING ERRCODE = 'check_violation';
END $$;

--
-- Name: result_delete_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_delete_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft result can be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

--
-- Name: result_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.result_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
     OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId" OR NEW."periodId" IS DISTINCT FROM OLD."periodId" THEN
    RAISE EXCEPTION 'A result cannot change its branch, student, subject or period' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
       NEW."classArmId" IS DISTINCT FROM OLD."classArmId" OR NEW."schemeId" IS DISTINCT FROM OLD."schemeId" OR NEW."scaleId" IS DISTINCT FROM OLD."scaleId"
    OR NEW."componentScores" IS DISTINCT FROM OLD."componentScores" OR NEW."examScore" IS DISTINCT FROM OLD."examScore" OR NEW."examMax" IS DISTINCT FROM OLD."examMax"
    OR NEW."caTotal" IS DISTINCT FROM OLD."caTotal" OR NEW."total" IS DISTINCT FROM OLD."total" OR NEW."maxScore" IS DISTINCT FROM OLD."maxScore"
    OR NEW."gradeLetter" IS DISTINCT FROM OLD."gradeLetter" OR NEW."gradeRemark" IS DISTINCT FROM OLD."gradeRemark"
    OR NEW."enteredByUserId" IS DISTINCT FROM OLD."enteredByUserId") THEN
    RAISE EXCEPTION 'The content of a result that has left DRAFT cannot change; send it back to draft first' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

--
-- Name: session_closed_locks_results(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_closed_locks_results() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: standing_event_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.standing_event_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'StandingEvent is append-only';
END;
$$;

--
-- Name: AcademicPeriod; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AcademicPeriod" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "sessionId" text NOT NULL,
    kind public."PeriodKind" DEFAULT 'TERM'::public."PeriodKind" NOT NULL,
    ordinal integer NOT NULL,
    label text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date,
    "isCurrent" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AcademicSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AcademicSession" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    label text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    status public."SessionStatus" DEFAULT 'PLANNED'::public."SessionStatus" NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "closeAt" timestamp(3) without time zone,
    "closeForced" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AdminSelfApprovalGrant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminSelfApprovalGrant" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "adminUserId" text NOT NULL,
    "grantedBySuperadminId" text NOT NULL,
    "unseenReviewerUserId" text,
    "grantedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revokedAt" timestamp(3) without time zone
);

--
-- Name: AdmissionCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdmissionCounter" (
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

--
-- Name: Announcement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Announcement" (
    id text NOT NULL,
    "branchId" text,
    "classArmId" text,
    title text NOT NULL,
    body text NOT NULL,
    "targetRoles" public."Role"[] DEFAULT ARRAY[]::public."Role"[],
    status public."AnnouncementStatus" DEFAULT 'PUBLISHED'::public."AnnouncementStatus" NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "authorUserId" text NOT NULL,
    "publishedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AssessmentComponent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentComponent" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "schemeId" text NOT NULL,
    name text NOT NULL,
    "maxScore" numeric(6,2) NOT NULL,
    "sortOrder" integer NOT NULL,
    CONSTRAINT "AssessmentComponent_max_positive" CHECK (("maxScore" > (0)::numeric)),
    CONSTRAINT "AssessmentComponent_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 40))),
    CONSTRAINT "AssessmentComponent_sort_range" CHECK ((("sortOrder" >= 0) AND ("sortOrder" <= 99)))
);

--
-- Name: AssessmentScheme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentScheme" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "classGroupId" text,
    name text NOT NULL,
    "totalMax" numeric(6,2) DEFAULT 100 NOT NULL,
    "examMax" numeric(6,2) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "supersedesId" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    hosted boolean DEFAULT false NOT NULL,
    CONSTRAINT "AssessmentScheme_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT "AssessmentScheme_totals" CHECK ((("totalMax" > (0)::numeric) AND ("examMax" >= (0)::numeric) AND ("examMax" <= "totalMax"))),
    CONSTRAINT "AssessmentScheme_version_positive" CHECK ((version >= 1))
);

--
-- Name: AssessmentSchemeDraft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentSchemeDraft" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "teacherUserId" text NOT NULL,
    "subjectId" text NOT NULL,
    name text NOT NULL,
    "caParts" jsonb NOT NULL,
    "examMax" numeric(6,2) NOT NULL,
    "totalMax" numeric(6,2) DEFAULT 100 NOT NULL,
    reason text NOT NULL,
    status public."SettingStatus" DEFAULT 'DRAFT'::public."SettingStatus" NOT NULL,
    "rejectionReason" text,
    "isSharedWithBranch" boolean DEFAULT false NOT NULL,
    "approvalId" text,
    "approvedSchemeId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AssessmentSchemeScope; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentSchemeScope" (
    id text NOT NULL,
    "schemeId" text NOT NULL,
    level public."SchemeScopeLevel" NOT NULL,
    "branchId" text,
    "classGroupId" text,
    "teacherUserId" text,
    "subjectId" text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isShared" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Assignment" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    "classArmId" text,
    title text NOT NULL,
    description text,
    instructions text,
    "dueDate" timestamp(3) without time zone,
    "totalPoints" integer DEFAULT 100 NOT NULL,
    status public."AssignmentStatus" DEFAULT 'DRAFT'::public."AssignmentStatus" NOT NULL,
    "allowLate" boolean DEFAULT true NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AssignmentSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssignmentSubmission" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "assignmentId" text NOT NULL,
    "studentId" text NOT NULL,
    content text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."SubmissionStatus" DEFAULT 'PENDING'::public."SubmissionStatus" NOT NULL,
    score double precision,
    feedback text,
    "gradedById" text,
    "gradedAt" timestamp(3) without time zone,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AttendanceGrant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttendanceGrant" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "staffRecordId" text NOT NULL,
    "classArmId" text NOT NULL,
    "grantedByUserId" text,
    "grantedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AttendanceRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttendanceRecord" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    date date NOT NULL,
    status public."AttendanceStatus" DEFAULT 'PRESENT'::public."AttendanceStatus" NOT NULL,
    remarks text,
    source public."AttendanceSource" DEFAULT 'ONLINE'::public."AttendanceSource" NOT NULL,
    "markedByUserId" text,
    "markedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text NOT NULL,
    "beforeValue" jsonb,
    "afterValue" jsonb,
    reason text,
    "correlationId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Branch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Branch" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ClassArm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassArm" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "classGroupId" text NOT NULL,
    name text NOT NULL,
    capacity integer,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "classTeacherId" text,
    CONSTRAINT "ClassArm_capacity_positive" CHECK (((capacity IS NULL) OR (capacity > 0))),
    CONSTRAINT "ClassArm_name_not_blank" CHECK ((length(btrim(name)) > 0))
);

--
-- Name: ClassGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassGroup" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sectionId" text,
    CONSTRAINT "ClassGroup_name_not_blank" CHECK ((length(btrim(name)) > 0))
);

--
-- Name: EmailChangeToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailChangeToken" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    "newEmail" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone
);

--
-- Name: FeeStructure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FeeStructure" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "periodId" text NOT NULL,
    "classGroupId" text,
    name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Form" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    kind public."FormKind" DEFAULT 'PRACTICE_SET'::public."FormKind" NOT NULL,
    title text NOT NULL,
    instructions text,
    status public."FormStatus" DEFAULT 'DRAFT'::public."FormStatus" NOT NULL,
    "opensAt" timestamp(3) without time zone,
    "closesAt" timestamp(3) without time zone,
    "maxDurationMinutes" integer,
    "createdById" text NOT NULL,
    "closedById" text,
    "closedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isAnonymous" boolean DEFAULT false NOT NULL,
    "shareToken" text,
    CONSTRAINT "Form_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(title) <= 200)))
);

--
-- Name: FormAnswer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormAnswer" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "responseId" text NOT NULL,
    "formQuestionId" text NOT NULL,
    value jsonb NOT NULL,
    "isCorrect" boolean,
    score double precision DEFAULT 0,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "markingStatus" public."FormMarkingStatus" DEFAULT 'NOT_REQUIRED'::public."FormMarkingStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    feedback text
);

--
-- Name: FormAudience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormAudience" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "formId" text NOT NULL,
    kind public."FormAudienceKind" DEFAULT 'MEMBERS'::public."FormAudienceKind" NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    "classGroupIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: FormMarkingAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormMarkingAudit" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "responseId" text NOT NULL,
    "answerId" text,
    "formId" text NOT NULL,
    "studentId" text,
    "scoreAwarded" double precision NOT NULL,
    "maxScore" double precision NOT NULL,
    feedback character varying(2000),
    action character varying(50) NOT NULL,
    "actorUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FormMarkingAudit_action_len" CHECK (((char_length((action)::text) >= 1) AND (char_length((action)::text) <= 50))),
    CONSTRAINT "FormMarkingAudit_feedback_len" CHECK (((feedback IS NULL) OR (char_length((feedback)::text) <= 2000))),
    CONSTRAINT "FormMarkingAudit_score_valid" CHECK ((("scoreAwarded" >= (0)::double precision) AND ("maxScore" >= (0)::double precision)))
);

--
-- Name: FormParticipation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormParticipation" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "formId" text NOT NULL,
    "respondentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: FormQuestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormQuestion" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "formId" text NOT NULL,
    "sourceItemId" text,
    "sourceVersion" integer,
    prompt text NOT NULL,
    "questionType" public."BankQuestionType" DEFAULT 'SINGLE'::public."BankQuestionType" NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" text,
    explanation text,
    points integer DEFAULT 1 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "markingMethod" public."FormMarkingMethod" DEFAULT 'AUTO'::public."FormMarkingMethod" NOT NULL,
    CONSTRAINT "FormQuestion_points_check" CHECK ((points >= 0)),
    CONSTRAINT "FormQuestion_prompt_check" CHECK (((char_length(btrim(prompt)) >= 1) AND (char_length(prompt) <= 20000)))
);

--
-- Name: FormResponse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormResponse" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "formId" text NOT NULL,
    "respondentId" text,
    "studentId" text,
    status public."FormResponseStatus" DEFAULT 'IN_PROGRESS'::public."FormResponseStatus" NOT NULL,
    score double precision DEFAULT 0,
    "maxScore" double precision DEFAULT 0,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "markingStatus" public."FormMarkingStatus" DEFAULT 'NOT_REQUIRED'::public."FormMarkingStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    CONSTRAINT "FormResponse_score_check" CHECK ((score >= (0)::double precision))
);

--
-- Name: FormTurnIn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormTurnIn" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "formId" text NOT NULL,
    "studentId" text NOT NULL,
    status public."TurnInStatus" DEFAULT 'PENDING'::public."TurnInStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    "requestedAt" timestamp(3) without time zone,
    note character varying(500),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FormTurnIn_note_len" CHECK (((note IS NULL) OR ((char_length((note)::text) >= 1) AND (char_length((note)::text) <= 500))))
);

--
-- Name: FormTurnInAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormTurnInAudit" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "turnInId" text NOT NULL,
    "formId" text NOT NULL,
    "studentId" text NOT NULL,
    status public."TurnInStatus" NOT NULL,
    action character varying(50) NOT NULL,
    "actorUserId" text,
    note character varying(500),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FormTurnInAudit_action_len" CHECK (((char_length((action)::text) >= 1) AND (char_length((action)::text) <= 50))),
    CONSTRAINT "FormTurnInAudit_note_len" CHECK (((note IS NULL) OR ((char_length((note)::text) >= 1) AND (char_length((note)::text) <= 500))))
);

--
-- Name: GradeBand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GradeBand" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "scaleId" text NOT NULL,
    "minScore" numeric(5,2) NOT NULL,
    "maxScore" numeric(5,2) NOT NULL,
    letter text NOT NULL,
    remark text NOT NULL,
    "sortOrder" integer NOT NULL,
    CONSTRAINT "GradeBand_letter_not_blank" CHECK (((length(btrim(letter)) >= 1) AND (length(btrim(letter)) <= 4))),
    CONSTRAINT "GradeBand_range" CHECK ((("minScore" >= (0)::numeric) AND ("maxScore" <= (100)::numeric) AND ("minScore" < "maxScore"))),
    CONSTRAINT "GradeBand_remark_not_blank" CHECK (((length(btrim(remark)) >= 1) AND (length(btrim(remark)) <= 40))),
    CONSTRAINT "GradeBand_sort_range" CHECK ((("sortOrder" >= 0) AND ("sortOrder" <= 99)))
);

--
-- Name: GradeScale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GradeScale" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "supersedesId" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "GradeScale_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT "GradeScale_version_positive" CHECK ((version >= 1))
);

--
-- Name: GuardianLinkToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuardianLinkToken" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "tokenHash" text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    action text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invitation" (
    id text NOT NULL,
    email text NOT NULL,
    role public."Role" NOT NULL,
    "branchId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "invitedById" text,
    "acceptedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    CONSTRAINT "Invitation_email_lowercase" CHECK ((email = lower(email)))
);

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "periodId" text NOT NULL,
    "invoiceNo" text NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    "amountPaid" numeric(12,2) DEFAULT 0 NOT NULL,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "dueDate" date,
    "lineItems" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "payInFull" boolean DEFAULT false NOT NULL
);

--
-- Name: InvoiceCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InvoiceCounter" (
    "branchId" text NOT NULL,
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

--
-- Name: InvoiceDiscount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InvoiceDiscount" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    mode public."DiscountWorkflowMode" DEFAULT 'MANUAL_OVERRIDE'::public."DiscountWorkflowMode" NOT NULL,
    "appliedByUserId" text NOT NULL,
    "approvedByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: LearningMaterial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LearningMaterial" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    title text NOT NULL,
    description text,
    content text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Membership" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "branchId" text NOT NULL,
    role public."Role" NOT NULL,
    permissions public."Permission"[] DEFAULT ARRAY[]::public."Permission"[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deactivatedAt" timestamp(3) without time zone,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "Membership_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'TERMINATED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

--
-- Name: MfaChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaChallenge" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    remember boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MfaCredential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaCredential" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "secretEnc" text NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "lastUsedStep" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MfaRecoveryCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaRecoveryCode" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "codeHash" text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: NotificationAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationAuditLog" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "dispatchId" text,
    "actorUserId" text,
    event text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    recipient text NOT NULL,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: NotificationDispatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationDispatch" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "templateId" text,
    channel public."NotificationChannel" NOT NULL,
    "recipientAddress" text NOT NULL,
    "recipientUserId" text,
    status public."NotificationDispatchStatus" DEFAULT 'QUEUED'::public."NotificationDispatchStatus" NOT NULL,
    subject text,
    body text NOT NULL,
    metadata jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "sentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: NotificationTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationTemplate" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    "subjectTemplate" text,
    "bodyTemplate" text NOT NULL,
    variables jsonb,
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PasswordResetToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasswordResetToken" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone
);

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    provider public."PaymentProvider" DEFAULT 'PAYSTACK'::public."PaymentProvider" NOT NULL,
    "providerRef" text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "verifiedServerSide" boolean DEFAULT false NOT NULL,
    channel text,
    "paidAt" timestamp(3) without time zone,
    "receiptNo" text,
    metadata jsonb,
    "recordedByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PaymentWebhookEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PaymentWebhookEvent" (
    id text NOT NULL,
    provider public."PaymentProvider" DEFAULT 'PAYSTACK'::public."PaymentProvider" NOT NULL,
    "eventId" text NOT NULL,
    "eventType" text,
    "signatureValid" boolean NOT NULL,
    "processedAt" timestamp(3) without time zone,
    "rawPayloadHash" text NOT NULL,
    error text,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PracticeAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PracticeAttempt" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "bankItemId" text NOT NULL,
    version integer NOT NULL,
    answer jsonb NOT NULL,
    correct boolean NOT NULL,
    "answeredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PracticeSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PracticeSession" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "classGroupId" text,
    "subjectLabel" text,
    "subjectKey" text,
    topic text,
    size integer NOT NULL,
    "feedbackMode" public."PracticeFeedbackMode" DEFAULT 'EACH'::public."PracticeFeedbackMode" NOT NULL,
    "itemIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Program; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Program" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    kind public."ProgramKind" NOT NULL,
    status public."ProgramStatus" DEFAULT 'DRAFT'::public."ProgramStatus" NOT NULL,
    "startsOn" date,
    "endsOn" date,
    "ownBranchId" text,
    "createdByUserId" text NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "attendanceEnabled" boolean DEFAULT true NOT NULL,
    "lowAttendancePercent" integer DEFAULT 75 NOT NULL,
    "assessmentsEnabled" boolean DEFAULT false NOT NULL,
    "gradeBands" jsonb,
    "feesEnabled" boolean DEFAULT false NOT NULL,
    "certTitle" text DEFAULT 'Certificate of Completion'::text NOT NULL,
    "certBody" text DEFAULT 'This is to certify that {name} has completed {program} at {school}, from {from} to {to}.'::text NOT NULL,
    "certSignatories" jsonb,
    "completionMinAverage" numeric(5,2),
    "completionRequirePassed" boolean DEFAULT false NOT NULL,
    "noCertWhileOwing" boolean DEFAULT false NOT NULL,
    "progressEnabled" boolean DEFAULT false NOT NULL,
    "progressTemplate" text,
    "progressFourEyes" boolean DEFAULT true NOT NULL,
    "progressLockInactivity" integer DEFAULT 300 NOT NULL,
    "progressLockRelease" integer DEFAULT 30 NOT NULL,
    "progressRequireVerification" boolean DEFAULT false NOT NULL,
    "progressWriters" public."ProgressWriters" DEFAULT 'BOTH'::public."ProgressWriters" NOT NULL,
    "progressGuardianDetail" public."ProgressGuardianDetail" DEFAULT 'SUMMARY'::public."ProgressGuardianDetail" NOT NULL,
    "progressGuardianView" boolean DEFAULT true NOT NULL,
    "progressStudentView" boolean DEFAULT true NOT NULL,
    "progressHijriAdjust" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "Program_certBody_check" CHECK (((char_length("certBody") >= 1) AND (char_length("certBody") <= 600))),
    CONSTRAINT "Program_certSignatories_check" CHECK ((("certSignatories" IS NULL) OR ((jsonb_typeof("certSignatories") = 'array'::text) AND (jsonb_array_length("certSignatories") <= 2)))),
    CONSTRAINT "Program_certTitle_check" CHECK (((char_length("certTitle") >= 1) AND (char_length("certTitle") <= 80))),
    CONSTRAINT "Program_completionMinAverage_check" CHECK ((("completionMinAverage" IS NULL) OR (("completionMinAverage" >= (0)::numeric) AND ("completionMinAverage" <= (100)::numeric)))),
    CONSTRAINT "Program_dates_check" CHECK ((((kind = 'FIXED_TERM'::public."ProgramKind") AND ("startsOn" IS NOT NULL) AND ("endsOn" IS NOT NULL) AND ("endsOn" > "startsOn")) OR ((kind = 'ONGOING'::public."ProgramKind") AND ("endsOn" IS NULL)))),
    CONSTRAINT "Program_gradeBands_check" CHECK ((("gradeBands" IS NULL) OR (jsonb_typeof("gradeBands") = 'array'::text))),
    CONSTRAINT "Program_lowAttendancePercent_check" CHECK ((("lowAttendancePercent" >= 1) AND ("lowAttendancePercent" <= 100))),
    CONSTRAINT "Program_progressHijriAdjust_check" CHECK ((("progressHijriAdjust" >= '-2'::integer) AND ("progressHijriAdjust" <= 2))),
    CONSTRAINT "Program_progressLockInactivity_check" CHECK ((("progressLockInactivity" >= 60) AND ("progressLockInactivity" <= 3600))),
    CONSTRAINT "Program_progressLockRelease_check" CHECK ((("progressLockRelease" >= 0) AND ("progressLockRelease" <= 300)))
);

--
-- Name: ProgramAssessment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAssessment" (
    id text NOT NULL,
    "programId" text NOT NULL,
    title text NOT NULL,
    kind text DEFAULT ''::text NOT NULL,
    date date NOT NULL,
    "maxScore" numeric(7,2) NOT NULL,
    "passMark" numeric(7,2),
    weight numeric(5,2) DEFAULT 1 NOT NULL,
    required boolean DEFAULT false NOT NULL,
    status public."ProgramAssessmentStatus" DEFAULT 'DRAFT'::public."ProgramAssessmentStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    CONSTRAINT "ProgramAssessment_kind_check" CHECK ((char_length(kind) <= 40)),
    CONSTRAINT "ProgramAssessment_max_check" CHECK ((("maxScore" > (0)::numeric) AND ("maxScore" <= (1000)::numeric))),
    CONSTRAINT "ProgramAssessment_pass_check" CHECK ((("passMark" IS NULL) OR (("passMark" >= (0)::numeric) AND ("passMark" <= "maxScore")))),
    CONSTRAINT "ProgramAssessment_published_check" CHECK ((((status = 'PUBLISHED'::public."ProgramAssessmentStatus") = ("publishedAt" IS NOT NULL)) OR (status = 'ARCHIVED'::public."ProgramAssessmentStatus"))),
    CONSTRAINT "ProgramAssessment_title_check" CHECK ((((char_length(title) >= 1) AND (char_length(title) <= 120)) AND (title = btrim(title)))),
    CONSTRAINT "ProgramAssessment_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric)))
);

--
-- Name: ProgramAssessmentGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAssessmentGroup" (
    "assessmentId" text NOT NULL,
    "groupId" text NOT NULL,
    "programId" text NOT NULL
);

--
-- Name: ProgramAttendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAttendance" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "branchId" text NOT NULL,
    status public."AttendanceStatus" NOT NULL,
    remarks text,
    "markedByUserId" text NOT NULL,
    "markedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ProgramAttendance_remarks_check" CHECK ((COALESCE(char_length(remarks), 0) <= 200)),
    CONSTRAINT "ProgramAttendance_version_check" CHECK ((version >= 1))
);

--
-- Name: ProgramAttendanceChange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAttendanceChange" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "sessionId" text NOT NULL,
    "participantId" text NOT NULL,
    "beforeStatus" public."AttendanceStatus" NOT NULL,
    "afterStatus" public."AttendanceStatus" NOT NULL,
    "beforeRemarks" text,
    "afterRemarks" text,
    reason text,
    "changedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramAttendanceChange_reason_check" CHECK ((COALESCE(char_length(reason), 0) <= 500))
);

--
-- Name: ProgramAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAudit" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text,
    "beforeValue" jsonb,
    "afterValue" jsonb,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ProgramBranch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramBranch" (
    "programId" text NOT NULL,
    "branchId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ProgramCertificate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramCertificate" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "serialNo" text NOT NULL,
    "verifyToken" text NOT NULL,
    "issuedOn" date NOT NULL,
    "completedOn" date NOT NULL,
    title text NOT NULL,
    "bodyText" text NOT NULL,
    "personName" text NOT NULL,
    "programName" text NOT NULL,
    "schoolName" text NOT NULL,
    signatories jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."ProgramCertificateStatus" DEFAULT 'ISSUED'::public."ProgramCertificateStatus" NOT NULL,
    "replacesId" text,
    "revokedAt" timestamp(3) without time zone,
    "revokedByUserId" text,
    "revokeReason" text,
    "issuedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramCertificate_revoked_check" CHECK ((((status = 'REVOKED'::public."ProgramCertificateStatus") = ("revokedAt" IS NOT NULL)) AND ((status <> 'REVOKED'::public."ProgramCertificateStatus") OR (char_length(btrim(COALESCE("revokeReason", ''::text))) >= 3)))),
    CONSTRAINT "ProgramCertificate_text_check" CHECK ((((char_length(title) >= 1) AND (char_length(title) <= 80)) AND ((char_length("bodyText") >= 1) AND (char_length("bodyText") <= 1200)) AND ((char_length("personName") >= 1) AND (char_length("personName") <= 200)))),
    CONSTRAINT "ProgramCertificate_token_check" CHECK (("verifyToken" ~ '^[A-Za-z0-9_-]{43}$'::text))
);

--
-- Name: ProgramCertificateCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramCertificateCounter" (
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

--
-- Name: ProgramFeeExemption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramFeeExemption" (
    "feeItemId" text NOT NULL,
    "participantId" text NOT NULL,
    "programId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ProgramFeeItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramFeeItem" (
    id text NOT NULL,
    "programId" text NOT NULL,
    name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    frequency public."ProgramFeeFrequency" DEFAULT 'ONCE'::public."ProgramFeeFrequency" NOT NULL,
    "dueDay" integer,
    audience jsonb DEFAULT '{}'::jsonb NOT NULL,
    "discountPercent" numeric(5,2),
    "billedTo" public."ProgramFeeBilledTo" DEFAULT 'PARTICIPANT'::public."ProgramFeeBilledTo" NOT NULL,
    status public."ProgramFeeStatus" DEFAULT 'ACTIVE'::public."ProgramFeeStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramFeeItem_amount_check" CHECK (((amount >= 0.01) AND (amount <= (10000000)::numeric))),
    CONSTRAINT "ProgramFeeItem_audience_check" CHECK ((jsonb_typeof(audience) = 'object'::text)),
    CONSTRAINT "ProgramFeeItem_discount_check" CHECK ((("discountPercent" IS NULL) OR (("discountPercent" >= (0)::numeric) AND ("discountPercent" <= (100)::numeric)))),
    CONSTRAINT "ProgramFeeItem_dueDay_check" CHECK ((("dueDay" IS NULL) OR (("dueDay" >= 1) AND ("dueDay" <= 28)))),
    CONSTRAINT "ProgramFeeItem_name_check" CHECK ((((char_length(name) >= 1) AND (char_length(name) <= 80)) AND (name = btrim(name))))
);

--
-- Name: ProgramGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramGroup" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "parentId" text,
    "levelIndex" integer NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramGroup_level_check" CHECK ((("levelIndex" >= 0) AND ("levelIndex" <= 3))),
    CONSTRAINT "ProgramGroup_top_has_no_parent_check" CHECK ((("parentId" IS NULL) = ("levelIndex" = 0)))
);

--
-- Name: ProgramInvoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramInvoice" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "branchId" text NOT NULL,
    "participantId" text NOT NULL,
    "periodKey" text NOT NULL,
    "invoiceNo" text NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    "amountPaid" numeric(12,2) DEFAULT 0 NOT NULL,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "dueDate" date,
    "payInFull" boolean DEFAULT false NOT NULL,
    "lineItems" jsonb NOT NULL,
    "billingName" text,
    "billingPhone" text,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramInvoice_amounts_check" CHECK ((("totalAmount" >= (0)::numeric) AND ("amountPaid" >= (0)::numeric) AND ("amountPaid" <= "totalAmount"))),
    CONSTRAINT "ProgramInvoice_lines_check" CHECK ((jsonb_typeof("lineItems") = 'array'::text)),
    CONSTRAINT "ProgramInvoice_period_check" CHECK (("periodKey" ~ '^(once|[0-9]{4}|[0-9]{4}-(0[1-9]|1[0-2]))$'::text))
);

--
-- Name: ProgramInvoiceCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramInvoiceCounter" (
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

--
-- Name: ProgramInvoiceDiscount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramInvoiceDiscount" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    "appliedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramInvoiceDiscount_amount_check" CHECK ((amount > (0)::numeric)),
    CONSTRAINT "ProgramInvoiceDiscount_reason_check" CHECK (((char_length(btrim(reason)) >= 3) AND (char_length(btrim(reason)) <= 500)))
);

--
-- Name: ProgramLevelLabel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramLevelLabel" (
    "programId" text NOT NULL,
    "levelIndex" integer NOT NULL,
    name text NOT NULL,
    CONSTRAINT "ProgramLevelLabel_level_check" CHECK ((("levelIndex" >= 0) AND ("levelIndex" <= 3)))
);

--
-- Name: ProgramParticipant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramParticipant" (
    id text NOT NULL,
    "programId" text NOT NULL,
    kind public."ParticipantKind" NOT NULL,
    "studentId" text,
    "staffRecordId" text,
    "firstName" text,
    "lastName" text,
    gender public."Gender",
    "dateOfBirth" date,
    phone text,
    email text,
    "guardianName" text,
    "guardianPhone" text,
    "groupId" text NOT NULL,
    "branchId" text NOT NULL,
    status public."ProgramPlaceStatus" DEFAULT 'ACTIVE'::public."ProgramPlaceStatus" NOT NULL,
    "joinedOn" date NOT NULL,
    "endedOn" date,
    "endedReason" text,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completionOverrideReason" text,
    CONSTRAINT "ProgramParticipant_child_check" CHECK (((kind <> 'CHILD'::public."ParticipantKind") OR (("dateOfBirth" IS NOT NULL) AND (COALESCE(char_length(btrim("guardianName")), 0) > 0) AND (COALESCE(char_length(btrim("guardianPhone")), 0) > 0)))),
    CONSTRAINT "ProgramParticipant_dates_check" CHECK (((("endedOn" IS NULL) OR ("endedOn" >= "joinedOn")) AND ((status <> 'ACTIVE'::public."ProgramPlaceStatus") OR ("endedOn" IS NULL)))),
    CONSTRAINT "ProgramParticipant_kind_check" CHECK ((((kind = 'STUDENT'::public."ParticipantKind") AND ("studentId" IS NOT NULL) AND ("staffRecordId" IS NULL) AND ("firstName" IS NULL) AND ("lastName" IS NULL) AND (gender IS NULL) AND ("dateOfBirth" IS NULL) AND (phone IS NULL) AND (email IS NULL) AND ("guardianName" IS NULL) AND ("guardianPhone" IS NULL)) OR ((kind = 'STAFF'::public."ParticipantKind") AND ("staffRecordId" IS NOT NULL) AND ("studentId" IS NULL) AND ("firstName" IS NULL) AND ("lastName" IS NULL) AND (gender IS NULL) AND ("dateOfBirth" IS NULL) AND (phone IS NULL) AND (email IS NULL) AND ("guardianName" IS NULL) AND ("guardianPhone" IS NULL)) OR ((kind = ANY (ARRAY['GUARDIAN'::public."ParticipantKind", 'ADULT'::public."ParticipantKind", 'CHILD'::public."ParticipantKind"])) AND ("studentId" IS NULL) AND ("staffRecordId" IS NULL) AND (COALESCE(char_length(btrim("firstName")), 0) > 0) AND (COALESCE(char_length(btrim("lastName")), 0) > 0)))),
    CONSTRAINT "ProgramParticipant_length_check" CHECK (((COALESCE(char_length("firstName"), 0) <= 60) AND (COALESCE(char_length("lastName"), 0) <= 60) AND (COALESCE(char_length(phone), 0) <= 30) AND (COALESCE(char_length("guardianPhone"), 0) <= 30) AND (COALESCE(char_length(email), 0) <= 120) AND (COALESCE(char_length("guardianName"), 0) <= 120) AND (COALESCE(char_length("endedReason"), 0) <= 500))),
    CONSTRAINT "ProgramParticipant_override_check" CHECK ((("completionOverrideReason" IS NULL) OR (((char_length(btrim("completionOverrideReason")) >= 3) AND (char_length(btrim("completionOverrideReason")) <= 500)) AND (status = 'COMPLETED'::public."ProgramPlaceStatus")))),
    CONSTRAINT "ProgramParticipant_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'EXPELLED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState")) AND ((kind = ANY (ARRAY['GUARDIAN'::public."ParticipantKind", 'ADULT'::public."ParticipantKind", 'CHILD'::public."ParticipantKind"])) OR ((standing = 'ACTIVE'::public."StandingState") AND ("standingUntil" IS NULL)))))
);

--
-- Name: ProgramPayment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramPayment" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "branchId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    provider public."PaymentProvider" DEFAULT 'MANUAL'::public."PaymentProvider" NOT NULL,
    "providerRef" text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "verifiedServerSide" boolean DEFAULT false NOT NULL,
    channel text,
    "paidAt" timestamp(3) without time zone,
    "receiptNo" text,
    metadata jsonb,
    "recordedByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramPayment_amount_check" CHECK ((amount > (0)::numeric))
);

--
-- Name: ProgramScore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramScore" (
    id text NOT NULL,
    "assessmentId" text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "branchId" text NOT NULL,
    score numeric(7,2),
    code public."ProgramScoreCode",
    comment text,
    "markedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ProgramScore_comment_check" CHECK ((COALESCE(char_length(comment), 0) <= 500)),
    CONSTRAINT "ProgramScore_one_of_check" CHECK (((score IS NOT NULL) <> (code IS NOT NULL))),
    CONSTRAINT "ProgramScore_score_check" CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (1000)::numeric)))),
    CONSTRAINT "ProgramScore_version_check" CHECK ((version >= 1))
);

--
-- Name: ProgramScoreChange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramScoreChange" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "assessmentId" text NOT NULL,
    "participantId" text NOT NULL,
    "beforeScore" numeric(7,2),
    "beforeCode" public."ProgramScoreCode",
    "afterScore" numeric(7,2),
    "afterCode" public."ProgramScoreCode",
    reason text,
    "changedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramScoreChange_reason_check" CHECK ((COALESCE(char_length(reason), 0) <= 500))
);

--
-- Name: ProgramSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramSession" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "groupId" text NOT NULL,
    date date NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramSession_label_check" CHECK (((char_length(label) <= 40) AND (label = btrim(label))))
);

--
-- Name: ProgramStaff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramStaff" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "userId" text NOT NULL,
    "branchId" text NOT NULL,
    role public."ProgramStaffRole" NOT NULL,
    status public."ProgramStaffStatus" DEFAULT 'ACTIVE'::public."ProgramStaffStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone
);

--
-- Name: ProgramStaffGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramStaffGroup" (
    "programStaffId" text NOT NULL,
    "groupId" text NOT NULL,
    "programId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ProgressEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressEntry" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "recordId" text NOT NULL,
    "trackKey" text NOT NULL,
    "entryDate" date NOT NULL,
    "values" jsonb NOT NULL,
    status public."ProgressEntryStatus" DEFAULT 'DRAFT'::public."ProgressEntryStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdByUserId" text NOT NULL,
    "lastEditedByUserId" text NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "verifiedByUserId" text,
    "verifiedAt" timestamp(3) without time zone,
    "returnComment" text,
    "publishedValues" jsonb,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressEntry_published_check" CHECK ((("publishedValues" IS NULL) OR (jsonb_typeof("publishedValues") = 'object'::text))),
    CONSTRAINT "ProgressEntry_return_check" CHECK ((COALESCE(char_length("returnComment"), 0) <= 300)),
    CONSTRAINT "ProgressEntry_values_check" CHECK (((jsonb_typeof("values") = 'object'::text) AND ((char_length("trackKey") >= 1) AND (char_length("trackKey") <= 40)) AND (version >= 1))),
    CONSTRAINT "ProgressEntry_verified_check" CHECK (((status <> 'VERIFIED'::public."ProgressEntryStatus") OR (("publishedValues" IS NOT NULL) AND ("verifiedAt" IS NOT NULL) AND ("verifiedByUserId" IS NOT NULL))))
);

--
-- Name: ProgressEntryRevision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressEntryRevision" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "entryId" text NOT NULL,
    "recordId" text NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    "userId" text NOT NULL,
    "beforeValues" jsonb,
    "afterValues" jsonb,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressEntryRevision_note_check" CHECK (((COALESCE(char_length(note), 0) <= 300) AND ((char_length(action) >= 1) AND (char_length(action) <= 30))))
);

--
-- Name: ProgressLock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressLock" (
    "entryId" text NOT NULL,
    "programId" text NOT NULL,
    "holderUserId" text NOT NULL,
    "heartbeatAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "releaseAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressLock_times_check" CHECK ((("expiresAt" >= "heartbeatAt") AND (("releaseAt" IS NULL) OR ("releaseAt" >= "heartbeatAt"))))
);

--
-- Name: ProgressRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressRecord" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "templateId" text NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressRecord_profile_check" CHECK (((jsonb_typeof(profile) = 'object'::text) AND (version >= 1)))
);

--
-- Name: ProgressSeen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressSeen" (
    id text NOT NULL,
    "programId" text NOT NULL,
    "recordId" text NOT NULL,
    actor text NOT NULL,
    "weekStart" date NOT NULL,
    "seenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressSeen_actor_check" CHECK ((actor = ANY (ARRAY['PUPIL'::text, 'GUARDIAN'::text])))
);

--
-- Name: ProgressTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressTemplate" (
    id text NOT NULL,
    "programId" text NOT NULL,
    key text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    schema jsonb NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressTemplate_key_check" CHECK ((((char_length(key) >= 1) AND (char_length(key) <= 40)) AND (version >= 1) AND (jsonb_typeof(schema) = 'object'::text)))
);

--
-- Name: PromotionBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromotionBatch" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "sourceSessionId" text NOT NULL,
    "targetSessionId" text NOT NULL,
    "sourceClassGroupId" text NOT NULL,
    "targetClassGroupId" text,
    status public."PromotionBatchStatus" DEFAULT 'COMMITTED'::public."PromotionBatchStatus" NOT NULL,
    "passMark" double precision DEFAULT 50.0 NOT NULL,
    "totalEvaluated" integer DEFAULT 0 NOT NULL,
    "totalPromoted" integer DEFAULT 0 NOT NULL,
    "totalRepeated" integer DEFAULT 0 NOT NULL,
    "totalGraduated" integer DEFAULT 0 NOT NULL,
    "executedById" text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PromotionRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromotionRecord" (
    id text NOT NULL,
    "batchId" text NOT NULL,
    "studentId" text NOT NULL,
    "sourceEnrollmentId" text NOT NULL,
    "targetEnrollmentId" text,
    "overallAverage" double precision,
    "termAverages" jsonb,
    decision public."PromotionDecision" NOT NULL,
    "decisionMode" public."DecisionMode" DEFAULT 'AUTOMATIC'::public."DecisionMode" NOT NULL,
    "overrideReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: QuestionBankAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankAudit" (
    id text NOT NULL,
    "branchId" text,
    "itemId" text,
    "actorUserId" text,
    entity text NOT NULL,
    action text NOT NULL,
    ref text,
    "oldValue" jsonb,
    "newValue" jsonb,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankAudit_entity" CHECK ((entity = ANY (ARRAY['ITEM'::text, 'REVIEWER'::text, 'SETTING'::text])))
);

--
-- Name: QuestionBankClassTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankClassTag" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    label text NOT NULL,
    "labelKey" text NOT NULL,
    CONSTRAINT "QuestionBankClassTag_sane" CHECK (((length("labelKey") > 0) AND (length(btrim(label, E' \t\r\n\f\v\u00a0'::text)) > 0)))
);

--
-- Name: QuestionBankImage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankImage" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "storageKey" text NOT NULL,
    alt text DEFAULT ''::text NOT NULL,
    decorative boolean DEFAULT false NOT NULL,
    bytes integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    store text NOT NULL,
    "contentType" text NOT NULL,
    CONSTRAINT "QuestionBankImage_contentType" CHECK (("contentType" = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT "QuestionBankImage_sane" CHECK (((bytes > 0) AND (width > 0) AND (height > 0) AND ("sortOrder" >= 0) AND (decorative OR (length(btrim(alt, E' \t\r\n\f\v\u00a0'::text)) > 0)))),
    CONSTRAINT "QuestionBankImage_store" CHECK ((store = ANY (ARRAY['s3'::text, 'r2'::text, 'cloudinary'::text, 'memory'::text])))
);

--
-- Name: QuestionBankItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankItem" (
    id text NOT NULL,
    "branchId" text,
    bank public."BankKind" DEFAULT 'ASSESSMENT'::public."BankKind" NOT NULL,
    type public."BankQuestionType" NOT NULL,
    prompt text NOT NULL,
    explanation text,
    points integer DEFAULT 1 NOT NULL,
    difficulty integer,
    topic text,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" jsonb,
    "subjectLabel" text,
    "subjectKey" text,
    visibility public."BankVisibility" DEFAULT 'TEACHERS_ONLY'::public."BankVisibility" NOT NULL,
    "visibleFrom" timestamp(3) without time zone,
    status public."BankItemStatus" DEFAULT 'DRAFT'::public."BankItemStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "submittedById" text NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "retiredReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "visibleAfterQuizId" text,
    CONSTRAINT "QuestionBankItem_decided" CHECK ((((status <> ALL (ARRAY['APPROVED'::public."BankItemStatus", 'RETIRED'::public."BankItemStatus"])) OR (("approvedById" IS NOT NULL) AND ("approvedAt" IS NOT NULL))) AND ((status <> 'RETIRED'::public."BankItemStatus") OR (length(btrim(COALESCE("retiredReason", ''::text), E' \t\r\n\f\v\u00a0'::text)) > 0)))),
    CONSTRAINT "QuestionBankItem_kind_types" CHECK ((((type <> ALL (ARRAY['RATING'::public."BankQuestionType", 'TEXT'::public."BankQuestionType"])) OR (bank = 'QUESTIONNAIRE'::public."BankKind")) AND ((bank <> 'QUESTIONNAIRE'::public."BankKind") OR ("correctAnswer" IS NULL)))),
    CONSTRAINT "QuestionBankItem_sane" CHECK (((points >= 0) AND (version >= 1) AND ((difficulty IS NULL) OR ((difficulty >= 1) AND (difficulty <= 5))) AND (length(btrim(prompt, E' \t\r\n\f\v\u00a0'::text)) > 0) AND (("subjectLabel" IS NULL) = ("subjectKey" IS NULL)) AND (("subjectKey" IS NULL) OR (length("subjectKey") > 0)))),
    CONSTRAINT "QuestionBankItem_until" CHECK (((visibility = 'TEACHERS_ONLY_UNTIL'::public."BankVisibility") = ("visibleFrom" IS NOT NULL)))
);

--
-- Name: QuestionBankItemVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankItemVersion" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    "actorUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankItemVersion_sane" CHECK (((version >= 1) AND (jsonb_typeof(snapshot) = 'object'::text)))
);

--
-- Name: QuestionBankPrintLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankPrintLog" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "userId" text,
    "studentId" text,
    "targetKind" public."PrintTargetKind" NOT NULL,
    "targetId" text NOT NULL,
    title character varying(255) NOT NULL,
    watermark text NOT NULL,
    "pageCount" integer DEFAULT 1 NOT NULL,
    reason character varying(500),
    "recipientStudentId" text,
    "ipAddress" character varying(100),
    "userAgent" character varying(500),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankPrintLog_pageCount_check" CHECK (("pageCount" >= 1)),
    CONSTRAINT "QuestionBankPrintLog_title_len" CHECK (((char_length((title)::text) >= 1) AND (char_length((title)::text) <= 255))),
    CONSTRAINT "QuestionBankPrintLog_watermark_len" CHECK ((char_length(watermark) >= 1))
);

--
-- Name: QuestionBankReview; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankReview" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    version integer NOT NULL,
    "reviewerId" text NOT NULL,
    outcome public."BankReviewOutcome" NOT NULL,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: QuestionBankReviewer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankReviewer" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "branchId" text,
    scope public."BankReviewerScope" NOT NULL,
    "subjectLabel" text,
    "subjectKey" text,
    "isExamApprover" boolean DEFAULT false NOT NULL,
    "assignedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankReviewer_scope" CHECK ((((scope = 'SUBJECT'::public."BankReviewerScope") AND ("subjectKey" IS NOT NULL) AND (length("subjectKey") > 0) AND ("subjectLabel" IS NOT NULL)) OR ((scope = 'GENERAL'::public."BankReviewerScope") AND ("subjectKey" IS NULL) AND ("subjectLabel" IS NULL))))
);

--
-- Name: QuestionOverlapFlag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionOverlapFlag" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "similarToItemId" text,
    "similarToAssessmentQuestionId" text,
    score double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionOverlapFlag_score" CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision)))
);

--
-- Name: QuestionReport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionReport" (
    id text NOT NULL,
    "branchId" text,
    "itemId" text NOT NULL,
    "itemVersion" integer NOT NULL,
    "reporterRole" text NOT NULL,
    "reporterSection" text NOT NULL,
    "reporterUserId" text,
    "reporterStudentId" text,
    reason text NOT NULL,
    status public."QuestionReportStatus" DEFAULT 'OPEN'::public."QuestionReportStatus" NOT NULL,
    outcome public."QuestionReportOutcome",
    "outcomeReason" text,
    "resolvedById" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionReport_reason_sane" CHECK (((length(btrim(reason, E' \t\r\n\f\v\u00a0'::text)) >= 5) AND (length(reason) <= 1000))),
    CONSTRAINT "QuestionReport_resolution_sane" CHECK ((((status = 'OPEN'::public."QuestionReportStatus") AND ("resolvedAt" IS NULL) AND (outcome IS NULL)) OR ((status <> 'OPEN'::public."QuestionReportStatus") AND ("resolvedAt" IS NOT NULL)))),
    CONSTRAINT "QuestionReport_role_sane" CHECK (("reporterRole" = ANY (ARRAY['TEACHER'::text, 'PUPIL'::text])))
);

--
-- Name: Quiz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Quiz" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    title text NOT NULL,
    instructions text,
    "timeLimitMinutes" integer,
    "passingScore" double precision,
    status public."QuizStatus" DEFAULT 'DRAFT'::public."QuizStatus" NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isExamTemplate" boolean DEFAULT false NOT NULL,
    "examWindowStart" timestamp(3) without time zone,
    "examWindowEnd" timestamp(3) without time zone
);

--
-- Name: QuizAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuizAttempt" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "quizId" text NOT NULL,
    "studentId" text NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    score double precision DEFAULT 0 NOT NULL,
    "isPassed" boolean DEFAULT false NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);

--
-- Name: QuizQuestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuizQuestion" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "quizId" text NOT NULL,
    prompt text NOT NULL,
    "questionType" public."QuestionType" DEFAULT 'MULTIPLE_CHOICE'::public."QuestionType" NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" text NOT NULL,
    points integer DEFAULT 1 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sourceItemId" text,
    "sourceVersion" integer,
    "exposedToPractice" boolean DEFAULT false NOT NULL
);

--
-- Name: ReceiptCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReceiptCounter" (
    "branchId" text NOT NULL,
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

--
-- Name: ReportCardLayout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportCardLayout" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type public."ReportCardLayoutType" DEFAULT 'DEFAULT'::public."ReportCardLayoutType" NOT NULL,
    "isLegacy" boolean DEFAULT false NOT NULL,
    options jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ReportRemark; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportRemark" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "periodId" text NOT NULL,
    "teacherRemark" text,
    "principalRemark" text,
    "updatedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportRemark_lengths" CHECK (((("teacherRemark" IS NULL) OR ((length(btrim("teacherRemark")) >= 1) AND (length(btrim("teacherRemark")) <= 500))) AND (("principalRemark" IS NULL) OR ((length(btrim("principalRemark")) >= 1) AND (length(btrim("principalRemark")) <= 500)))))
);

--
-- Name: Result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Result" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "studentId" text NOT NULL,
    "subjectId" text NOT NULL,
    "periodId" text NOT NULL,
    "classArmId" text NOT NULL,
    "schemeId" text NOT NULL,
    "scaleId" text NOT NULL,
    "componentScores" jsonb NOT NULL,
    "examScore" numeric(6,2) NOT NULL,
    "examMax" numeric(6,2) NOT NULL,
    "caTotal" numeric(6,2) NOT NULL,
    total numeric(6,2) NOT NULL,
    "maxScore" numeric(6,2) NOT NULL,
    "gradeLetter" text NOT NULL,
    "gradeRemark" text NOT NULL,
    status public."ResultStatus" DEFAULT 'DRAFT'::public."ResultStatus" NOT NULL,
    "enteredByUserId" text NOT NULL,
    "submittedByUserId" text,
    "submittedAt" timestamp(3) without time zone,
    "approvedByUserId" text,
    "approvedAt" timestamp(3) without time zone,
    "publishedAt" timestamp(3) without time zone,
    "lockedAt" timestamp(3) without time zone,
    "verificationToken" text,
    "verificationHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Result_components_array" CHECK ((jsonb_typeof("componentScores") = 'array'::text)),
    CONSTRAINT "Result_grade_filled" CHECK ((((length(btrim("gradeLetter")) >= 1) AND (length(btrim("gradeLetter")) <= 4)) AND ((length(btrim("gradeRemark")) >= 1) AND (length(btrim("gradeRemark")) <= 40)))),
    CONSTRAINT "Result_scores_valid" CHECK ((("examMax" >= (0)::numeric) AND ("examScore" >= (0)::numeric) AND ("examScore" <= "examMax") AND ("caTotal" >= (0)::numeric) AND ("maxScore" > (0)::numeric) AND (total = ("caTotal" + "examScore")) AND (total <= "maxScore"))),
    CONSTRAINT "Result_status_footprint" CHECK (
CASE status
    WHEN 'DRAFT'::public."ResultStatus" THEN (("submittedAt" IS NULL) AND ("submittedByUserId" IS NULL) AND ("approvedAt" IS NULL) AND ("approvedByUserId" IS NULL) AND ("publishedAt" IS NULL) AND ("lockedAt" IS NULL))
    WHEN 'SUBMITTED'::public."ResultStatus" THEN (("submittedAt" IS NOT NULL) AND ("submittedByUserId" IS NOT NULL) AND ("approvedAt" IS NULL) AND ("approvedByUserId" IS NULL) AND ("publishedAt" IS NULL) AND ("lockedAt" IS NULL))
    WHEN 'APPROVED'::public."ResultStatus" THEN (("submittedAt" IS NOT NULL) AND ("submittedByUserId" IS NOT NULL) AND ("approvedAt" IS NOT NULL) AND ("approvedByUserId" IS NOT NULL) AND ("publishedAt" IS NULL) AND ("lockedAt" IS NULL))
    WHEN 'PUBLISHED'::public."ResultStatus" THEN (("submittedAt" IS NOT NULL) AND ("submittedByUserId" IS NOT NULL) AND ("approvedAt" IS NOT NULL) AND ("approvedByUserId" IS NOT NULL) AND ("publishedAt" IS NOT NULL) AND ("lockedAt" IS NULL))
    WHEN 'LOCKED'::public."ResultStatus" THEN (("submittedAt" IS NOT NULL) AND ("submittedByUserId" IS NOT NULL) AND ("approvedAt" IS NOT NULL) AND ("approvedByUserId" IS NOT NULL) AND ("publishedAt" IS NOT NULL) AND ("lockedAt" IS NOT NULL))
    ELSE NULL::boolean
END),
    CONSTRAINT "Result_token_iff_published" CHECK (((status = ANY (ARRAY['PUBLISHED'::public."ResultStatus", 'LOCKED'::public."ResultStatus"])) = (("verificationToken" IS NOT NULL) AND ("verificationHash" IS NOT NULL))))
);

--
-- Name: ResultApprovalScope; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ResultApprovalScope" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "userId" text NOT NULL,
    kind public."ApprovalScopeKind" NOT NULL,
    "sectionId" text,
    "classGroupId" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ResultApprovalScope_kind_target" CHECK ((((kind = 'GENERAL'::public."ApprovalScopeKind") AND ("sectionId" IS NULL) AND ("classGroupId" IS NULL)) OR ((kind = 'SECTION'::public."ApprovalScopeKind") AND ("sectionId" IS NOT NULL) AND ("classGroupId" IS NULL)) OR ((kind = 'CLASS'::public."ApprovalScopeKind") AND ("classGroupId" IS NOT NULL) AND ("sectionId" IS NULL))))
);

--
-- Name: ResultAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ResultAudit" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "resultId" text NOT NULL,
    "actorUserId" text,
    action text NOT NULL,
    "fromStatus" public."ResultStatus",
    "toStatus" public."ResultStatus",
    "fromTotal" numeric(6,2),
    "toTotal" numeric(6,2),
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SchoolSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SchoolSettings" (
    id text DEFAULT 'global'::text NOT NULL,
    name text DEFAULT 'Al-Eemaan Schools'::text NOT NULL,
    principal text,
    phone text,
    motto text,
    address text,
    email text,
    website text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Section; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Section" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Section_name_given" CHECK (((length(btrim(name, E' \t\r\n'::text)) >= 1) AND (length(btrim(name, E' \t\r\n'::text)) <= 80)))
);

--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tokenHash" text NOT NULL,
    "userAgent" text,
    "absoluteExpires" timestamp(3) without time zone NOT NULL
);

--
-- Name: SettingApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SettingApproval" (
    id text NOT NULL,
    "settingKey" text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text,
    scope public."SettingScope" NOT NULL,
    "branchId" text,
    "actorUserId" text NOT NULL,
    reason text NOT NULL,
    status public."SettingStatus" DEFAULT 'PENDING'::public."SettingStatus" NOT NULL,
    "deciderUserId" text,
    "decidedAt" timestamp(3) without time zone,
    "decisionReason" text,
    visibility public."ApprovalVisibility" DEFAULT 'VISIBLE'::public."ApprovalVisibility" NOT NULL,
    "proposedValue" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SettingAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SettingAudit" (
    id text NOT NULL,
    "settingKey" text NOT NULL,
    scope public."SettingScope" NOT NULL,
    "branchId" text,
    "actorUserId" text,
    "oldValue" jsonb,
    "newValue" jsonb,
    action text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SettingValue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SettingValue" (
    id text NOT NULL,
    scope public."SettingScope" NOT NULL,
    "branchId" text,
    key text NOT NULL,
    value jsonb NOT NULL,
    status public."SettingStatus" DEFAULT 'APPROVED'::public."SettingStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: StaffRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StaffRecord" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "userId" text,
    category public."StaffCategory" NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    phone text,
    email text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "middleName" text,
    gender public."Gender",
    "dateOfBirth" date,
    address text,
    designation text,
    qualification text,
    "employmentDate" date,
    "nextOfKinName" text,
    "nextOfKinRelationship" text,
    "nextOfKinPhone" text,
    "nextOfKinAddress" text,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "StaffRecord_birth_date_floor" CHECK ((("dateOfBirth" IS NULL) OR ("dateOfBirth" >= '1900-01-01'::date))),
    CONSTRAINT "StaffRecord_email_shape" CHECK (((email IS NULL) OR ((email = lower(email)) AND (length(email) <= 254) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text)))),
    CONSTRAINT "StaffRecord_employment_date_floor" CHECK ((("employmentDate" IS NULL) OR ("employmentDate" >= '1900-01-01'::date))),
    CONSTRAINT "StaffRecord_middle_name_valid" CHECK ((("middleName" IS NULL) OR ((length(btrim("middleName")) >= 1) AND (length(btrim("middleName")) <= 80)))),
    CONSTRAINT "StaffRecord_names_valid" CHECK ((((length(btrim("firstName")) >= 1) AND (length(btrim("firstName")) <= 80)) AND ((length(btrim("lastName")) >= 1) AND (length(btrim("lastName")) <= 80)))),
    CONSTRAINT "StaffRecord_nok_phone_shape" CHECK ((("nextOfKinPhone" IS NULL) OR ("nextOfKinPhone" ~ '^[0-9+() -]{7,20}$'::text))),
    CONSTRAINT "StaffRecord_phone_shape" CHECK (((phone IS NULL) OR (phone ~ '^[0-9+() -]{7,20}$'::text))),
    CONSTRAINT "StaffRecord_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'TERMINATED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

--
-- Name: StaffSubjectAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StaffSubjectAssignment" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "staffRecordId" text NOT NULL,
    "subjectId" text NOT NULL,
    "classArmId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: StandingEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StandingEvent" (
    id text NOT NULL,
    subject public."StandingSubject" NOT NULL,
    "studentId" text,
    "staffRecordId" text,
    "membershipId" text,
    "userId" text,
    "branchId" text NOT NULL,
    action public."StandingEventAction" NOT NULL,
    scope public."StandingScope" DEFAULT 'BRANCH'::public."StandingScope" NOT NULL,
    reason text NOT NULL,
    "startsOn" date NOT NULL,
    "endsOn" date,
    "decidedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "participantId" text,
    CONSTRAINT "StandingEvent_action_check" CHECK ((((action <> 'EXPELLED'::public."StandingEventAction") OR (subject = ANY (ARRAY['STUDENT'::public."StandingSubject", 'PARTICIPANT'::public."StandingSubject"]))) AND ((action <> 'TERMINATED'::public."StandingEventAction") OR (subject = 'STAFF'::public."StandingSubject")))),
    CONSTRAINT "StandingEvent_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 500))),
    CONSTRAINT "StandingEvent_subject_check" CHECK ((((subject = 'STUDENT'::public."StandingSubject") AND ("studentId" IS NOT NULL) AND ("staffRecordId" IS NULL) AND ("membershipId" IS NULL) AND ("participantId" IS NULL)) OR ((subject = 'STAFF'::public."StandingSubject") AND ("studentId" IS NULL) AND (("staffRecordId" IS NOT NULL) OR ("membershipId" IS NOT NULL)) AND ("participantId" IS NULL)) OR ((subject = 'PARTICIPANT'::public."StandingSubject") AND ("participantId" IS NOT NULL) AND ("studentId" IS NULL) AND ("staffRecordId" IS NULL) AND ("membershipId" IS NULL))))
);

--
-- Name: StudentEnrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentEnrollment" (
    id text NOT NULL,
    "studentId" text NOT NULL,
    "branchId" text NOT NULL,
    "sessionId" text NOT NULL,
    "className" text NOT NULL,
    arm text,
    status public."EnrollmentStatus" DEFAULT 'ACTIVE'::public."EnrollmentStatus" NOT NULL,
    "enrolledAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "classArmId" text
);

--
-- Name: StudentRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentRecord" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "firstName" text NOT NULL,
    "middleName" text,
    "lastName" text NOT NULL,
    gender public."Gender" NOT NULL,
    "dateOfBirth" date NOT NULL,
    "admissionNo" text NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "guardianName" text,
    "guardianPhone" text,
    "guardianEmail" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "StudentRecord_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'EXPELLED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

--
-- Name: Subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Subject" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    code text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Subject_code_upper" CHECK (((code IS NULL) OR (code = upper(btrim(code))))),
    CONSTRAINT "Subject_name_not_blank" CHECK ((length(btrim(name)) > 0))
);

--
-- Name: SubjectOffering; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SubjectOffering" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "classGroupId" text NOT NULL,
    "subjectId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SystemSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SystemSettings" (
    id text DEFAULT 'global'::text NOT NULL,
    "setupComplete" boolean DEFAULT false NOT NULL
);

--
-- Name: TimetableSlot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TimetableSlot" (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "classArmId" text NOT NULL,
    "subjectId" text NOT NULL,
    "staffRecordId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "periodNumber" integer,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    room text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp(3) without time zone,
    image text,
    "passwordHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isSuperAdmin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "User_email_lowercase_check" CHECK ((email = lower(email)))
);

--
-- Name: VerificationPageConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VerificationPageConfig" (
    id text NOT NULL,
    "branchId" text,
    "showPupilName" boolean DEFAULT true NOT NULL,
    "pupilNameFormat" public."PupilNameFormat" DEFAULT 'FIRST_LAST_INITIAL'::public."PupilNameFormat" NOT NULL,
    "showSubject" boolean DEFAULT true NOT NULL,
    "showMarks" boolean DEFAULT false NOT NULL,
    "showGrade" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AcademicPeriod AcademicPeriod_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY (id);

--
-- Name: AcademicSession AcademicSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_pkey" PRIMARY KEY (id);

--
-- Name: AdminSelfApprovalGrant AdminSelfApprovalGrant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSelfApprovalGrant"
    ADD CONSTRAINT "AdminSelfApprovalGrant_pkey" PRIMARY KEY (id);

--
-- Name: AdmissionCounter AdmissionCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdmissionCounter"
    ADD CONSTRAINT "AdmissionCounter_pkey" PRIMARY KEY (year);

--
-- Name: Announcement Announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentComponent AssessmentComponent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentSchemeDraft AssessmentSchemeDraft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeDraft"
    ADD CONSTRAINT "AssessmentSchemeDraft_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentScheme AssessmentScheme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_pkey" PRIMARY KEY (id);

--
-- Name: AssignmentSubmission AssignmentSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY (id);

--
-- Name: Assignment Assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_pkey" PRIMARY KEY (id);

--
-- Name: AttendanceGrant AttendanceGrant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceGrant"
    ADD CONSTRAINT "AttendanceGrant_pkey" PRIMARY KEY (id);

--
-- Name: AttendanceRecord AttendanceRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY (id);

--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

--
-- Name: Branch Branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Branch"
    ADD CONSTRAINT "Branch_pkey" PRIMARY KEY (id);

--
-- Name: ClassArm ClassArm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_pkey" PRIMARY KEY (id);

--
-- Name: ClassGroup ClassGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_pkey" PRIMARY KEY (id);

--
-- Name: EmailChangeToken EmailChangeToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailChangeToken"
    ADD CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY (id);

--
-- Name: FeeStructure FeeStructure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_pkey" PRIMARY KEY (id);

--
-- Name: FormAnswer FormAnswer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_pkey" PRIMARY KEY (id);

--
-- Name: FormAudience FormAudience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_pkey" PRIMARY KEY (id);

--
-- Name: FormMarkingAudit FormMarkingAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_pkey" PRIMARY KEY (id);

--
-- Name: FormParticipation FormParticipation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_pkey" PRIMARY KEY (id);

--
-- Name: FormQuestion FormQuestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_pkey" PRIMARY KEY (id);

--
-- Name: FormResponse FormResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_pkey" PRIMARY KEY (id);

--
-- Name: FormTurnInAudit FormTurnInAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_pkey" PRIMARY KEY (id);

--
-- Name: FormTurnIn FormTurnIn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_pkey" PRIMARY KEY (id);

--
-- Name: Form Form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_pkey" PRIMARY KEY (id);

--
-- Name: GradeBand GradeBand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_pkey" PRIMARY KEY (id);

--
-- Name: GradeScale GradeScale_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_pkey" PRIMARY KEY (id);

--
-- Name: GuardianLinkToken GuardianLinkToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_pkey" PRIMARY KEY (id);

--
-- Name: Invitation Invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY (id);

--
-- Name: InvoiceCounter InvoiceCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceCounter"
    ADD CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("branchId", year);

--
-- Name: InvoiceDiscount InvoiceDiscount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_pkey" PRIMARY KEY (id);

--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);

--
-- Name: LearningMaterial LearningMaterial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_pkey" PRIMARY KEY (id);

--
-- Name: Membership Membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_pkey" PRIMARY KEY (id);

--
-- Name: MfaChallenge MfaChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaChallenge"
    ADD CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY (id);

--
-- Name: MfaCredential MfaCredential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaCredential"
    ADD CONSTRAINT "MfaCredential_pkey" PRIMARY KEY (id);

--
-- Name: MfaRecoveryCode MfaRecoveryCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaRecoveryCode"
    ADD CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY (id);

--
-- Name: NotificationAuditLog NotificationAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationAuditLog"
    ADD CONSTRAINT "NotificationAuditLog_pkey" PRIMARY KEY (id);

--
-- Name: NotificationDispatch NotificationDispatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY (id);

--
-- Name: NotificationTemplate NotificationTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationTemplate"
    ADD CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY (id);

--
-- Name: PasswordResetToken PasswordResetToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY (id);

--
-- Name: PaymentWebhookEvent PaymentWebhookEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PaymentWebhookEvent"
    ADD CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY (id);

--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);

--
-- Name: PracticeAttempt PracticeAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY (id);

--
-- Name: PracticeSession PracticeSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_pkey" PRIMARY KEY ("assessmentId", "groupId");

--
-- Name: ProgramAssessment ProgramAssessment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessment"
    ADD CONSTRAINT "ProgramAssessment_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAttendanceChange ProgramAttendanceChange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendanceChange"
    ADD CONSTRAINT "ProgramAttendanceChange_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAttendance ProgramAttendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAudit ProgramAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAudit"
    ADD CONSTRAINT "ProgramAudit_pkey" PRIMARY KEY (id);

--
-- Name: ProgramBranch ProgramBranch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramBranch"
    ADD CONSTRAINT "ProgramBranch_pkey" PRIMARY KEY ("programId", "branchId");

--
-- Name: ProgramCertificateCounter ProgramCertificateCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificateCounter"
    ADD CONSTRAINT "ProgramCertificateCounter_pkey" PRIMARY KEY (year);

--
-- Name: ProgramCertificate ProgramCertificate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_pkey" PRIMARY KEY (id);

--
-- Name: ProgramFeeExemption ProgramFeeExemption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_pkey" PRIMARY KEY ("feeItemId", "participantId");

--
-- Name: ProgramFeeItem ProgramFeeItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeItem"
    ADD CONSTRAINT "ProgramFeeItem_pkey" PRIMARY KEY (id);

--
-- Name: ProgramGroup ProgramGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_pkey" PRIMARY KEY (id);

--
-- Name: ProgramInvoiceCounter ProgramInvoiceCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoiceCounter"
    ADD CONSTRAINT "ProgramInvoiceCounter_pkey" PRIMARY KEY (year);

--
-- Name: ProgramInvoiceDiscount ProgramInvoiceDiscount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoiceDiscount"
    ADD CONSTRAINT "ProgramInvoiceDiscount_pkey" PRIMARY KEY (id);

--
-- Name: ProgramInvoice ProgramInvoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoice"
    ADD CONSTRAINT "ProgramInvoice_pkey" PRIMARY KEY (id);

--
-- Name: ProgramLevelLabel ProgramLevelLabel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramLevelLabel"
    ADD CONSTRAINT "ProgramLevelLabel_pkey" PRIMARY KEY ("programId", "levelIndex");

--
-- Name: ProgramParticipant ProgramParticipant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_pkey" PRIMARY KEY (id);

--
-- Name: ProgramPayment ProgramPayment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramPayment"
    ADD CONSTRAINT "ProgramPayment_pkey" PRIMARY KEY (id);

--
-- Name: ProgramScoreChange ProgramScoreChange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScoreChange"
    ADD CONSTRAINT "ProgramScoreChange_pkey" PRIMARY KEY (id);

--
-- Name: ProgramScore ProgramScore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_pkey" PRIMARY KEY (id);

--
-- Name: ProgramSession ProgramSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramSession"
    ADD CONSTRAINT "ProgramSession_pkey" PRIMARY KEY (id);

--
-- Name: ProgramStaffGroup ProgramStaffGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_pkey" PRIMARY KEY ("programStaffId", "groupId");

--
-- Name: ProgramStaff ProgramStaff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_pkey" PRIMARY KEY (id);

--
-- Name: Program Program_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Program"
    ADD CONSTRAINT "Program_pkey" PRIMARY KEY (id);

--
-- Name: ProgressEntryRevision ProgressEntryRevision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntryRevision"
    ADD CONSTRAINT "ProgressEntryRevision_pkey" PRIMARY KEY (id);

--
-- Name: ProgressEntry ProgressEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntry"
    ADD CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY (id);

--
-- Name: ProgressLock ProgressLock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressLock"
    ADD CONSTRAINT "ProgressLock_pkey" PRIMARY KEY ("entryId");

--
-- Name: ProgressRecord ProgressRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY (id);

--
-- Name: ProgressSeen ProgressSeen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressSeen"
    ADD CONSTRAINT "ProgressSeen_pkey" PRIMARY KEY (id);

--
-- Name: ProgressTemplate ProgressTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressTemplate"
    ADD CONSTRAINT "ProgressTemplate_pkey" PRIMARY KEY (id);

--
-- Name: PromotionBatch PromotionBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY (id);

--
-- Name: PromotionRecord PromotionRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankAudit QuestionBankAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankClassTag QuestionBankClassTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankClassTag"
    ADD CONSTRAINT "QuestionBankClassTag_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankImage QuestionBankImage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankImage"
    ADD CONSTRAINT "QuestionBankImage_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankItem QuestionBankItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankReview QuestionBankReview_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankReviewer QuestionBankReviewer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_pkey" PRIMARY KEY (id);

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_pkey" PRIMARY KEY (id);

--
-- Name: QuestionReport QuestionReport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_pkey" PRIMARY KEY (id);

--
-- Name: QuizAttempt QuizAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY (id);

--
-- Name: QuizQuestion QuizQuestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY (id);

--
-- Name: Quiz Quiz_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_pkey" PRIMARY KEY (id);

--
-- Name: ReceiptCounter ReceiptCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReceiptCounter"
    ADD CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("branchId", year);

--
-- Name: ReportCardLayout ReportCardLayout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportCardLayout"
    ADD CONSTRAINT "ReportCardLayout_pkey" PRIMARY KEY (id);

--
-- Name: ReportRemark ReportRemark_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_pkey" PRIMARY KEY (id);

--
-- Name: ResultApprovalScope ResultApprovalScope_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_pkey" PRIMARY KEY (id);

--
-- Name: ResultAudit ResultAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_pkey" PRIMARY KEY (id);

--
-- Name: Result Result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_pkey" PRIMARY KEY (id);

--
-- Name: SchoolSettings SchoolSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SchoolSettings"
    ADD CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY (id);

--
-- Name: Section Section_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Section"
    ADD CONSTRAINT "Section_pkey" PRIMARY KEY (id);

--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

--
-- Name: SettingApproval SettingApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingApproval"
    ADD CONSTRAINT "SettingApproval_pkey" PRIMARY KEY (id);

--
-- Name: SettingAudit SettingAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingAudit"
    ADD CONSTRAINT "SettingAudit_pkey" PRIMARY KEY (id);

--
-- Name: SettingValue SettingValue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingValue"
    ADD CONSTRAINT "SettingValue_pkey" PRIMARY KEY (id);

--
-- Name: StaffRecord StaffRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_pkey" PRIMARY KEY (id);

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_pkey" PRIMARY KEY (id);

--
-- Name: StandingEvent StandingEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StandingEvent"
    ADD CONSTRAINT "StandingEvent_pkey" PRIMARY KEY (id);

--
-- Name: StudentEnrollment StudentEnrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY (id);

--
-- Name: StudentRecord StudentRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_pkey" PRIMARY KEY (id);

--
-- Name: SubjectOffering SubjectOffering_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY (id);

--
-- Name: Subject Subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subject"
    ADD CONSTRAINT "Subject_pkey" PRIMARY KEY (id);

--
-- Name: SystemSettings SystemSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_pkey" PRIMARY KEY (id);

--
-- Name: TimetableSlot TimetableSlot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY (id);

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: VerificationPageConfig VerificationPageConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VerificationPageConfig"
    ADD CONSTRAINT "VerificationPageConfig_pkey" PRIMARY KEY (id);

--
-- Name: AcademicPeriod_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_branchId_id_key" ON public."AcademicPeriod" USING btree ("branchId", id);

--
-- Name: AcademicPeriod_branchId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AcademicPeriod_branchId_sessionId_idx" ON public."AcademicPeriod" USING btree ("branchId", "sessionId");

--
-- Name: AcademicPeriod_sessionId_ordinal_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_sessionId_ordinal_key" ON public."AcademicPeriod" USING btree ("sessionId", ordinal);

--
-- Name: AcademicSession_branchId_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicSession_branchId_label_key" ON public."AcademicSession" USING btree ("branchId", label);

--
-- Name: AcademicSession_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AcademicSession_branchId_status_idx" ON public."AcademicSession" USING btree ("branchId", status);

--
-- Name: AdminSelfApprovalGrant_branchId_adminUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdminSelfApprovalGrant_branchId_adminUserId_key" ON public."AdminSelfApprovalGrant" USING btree ("branchId", "adminUserId");

--
-- Name: AdminSelfApprovalGrant_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminSelfApprovalGrant_branchId_idx" ON public."AdminSelfApprovalGrant" USING btree ("branchId");

--
-- Name: Announcement_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_branchId_idx" ON public."Announcement" USING btree ("branchId");

--
-- Name: Announcement_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_classArmId_idx" ON public."Announcement" USING btree ("classArmId");

--
-- Name: Announcement_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_publishedAt_idx" ON public."Announcement" USING btree ("publishedAt");

--
-- Name: Announcement_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_status_idx" ON public."Announcement" USING btree (status);

--
-- Name: AssessmentComponent_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentComponent_branchId_id_key" ON public."AssessmentComponent" USING btree ("branchId", id);

--
-- Name: AssessmentComponent_branchId_schemeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentComponent_branchId_schemeId_idx" ON public."AssessmentComponent" USING btree ("branchId", "schemeId");

--
-- Name: AssessmentComponent_name_per_scheme; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentComponent_name_per_scheme" ON public."AssessmentComponent" USING btree ("schemeId", lower(name));

--
-- Name: AssessmentSchemeDraft_branchId_teacherUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentSchemeDraft_branchId_teacherUserId_idx" ON public."AssessmentSchemeDraft" USING btree ("branchId", "teacherUserId");

--
-- Name: AssessmentSchemeDraft_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentSchemeDraft_status_idx" ON public."AssessmentSchemeDraft" USING btree (status);

--
-- Name: AssessmentSchemeScope_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentSchemeScope_classGroupId_idx" ON public."AssessmentSchemeScope" USING btree ("classGroupId");

--
-- Name: AssessmentSchemeScope_level_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentSchemeScope_level_branchId_idx" ON public."AssessmentSchemeScope" USING btree (level, "branchId");

--
-- Name: AssessmentSchemeScope_teacherUserId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentSchemeScope_teacherUserId_subjectId_idx" ON public."AssessmentSchemeScope" USING btree ("teacherUserId", "subjectId");

--
-- Name: AssessmentScheme_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_branchId_id_key" ON public."AssessmentScheme" USING btree ("branchId", id);

--
-- Name: AssessmentScheme_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentScheme_branchId_idx" ON public."AssessmentScheme" USING btree ("branchId");

--
-- Name: AssessmentScheme_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_name_live" ON public."AssessmentScheme" USING btree ("branchId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: AssessmentScheme_one_live_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_one_live_per_scope" ON public."AssessmentScheme" USING btree ("branchId", COALESCE("classGroupId", ''::text)) WHERE (("archivedAt" IS NULL) AND (NOT hosted));

--
-- Name: AssignmentSubmission_branchId_assignmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_branchId_assignmentId_idx" ON public."AssignmentSubmission" USING btree ("branchId", "assignmentId");

--
-- Name: AssignmentSubmission_branchId_assignmentId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssignmentSubmission_branchId_assignmentId_studentId_key" ON public."AssignmentSubmission" USING btree ("branchId", "assignmentId", "studentId");

--
-- Name: AssignmentSubmission_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssignmentSubmission_branchId_id_key" ON public."AssignmentSubmission" USING btree ("branchId", id);

--
-- Name: AssignmentSubmission_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_branchId_status_idx" ON public."AssignmentSubmission" USING btree ("branchId", status);

--
-- Name: AssignmentSubmission_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_branchId_studentId_idx" ON public."AssignmentSubmission" USING btree ("branchId", "studentId");

--
-- Name: Assignment_branchId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_branchId_classArmId_idx" ON public."Assignment" USING btree ("branchId", "classArmId");

--
-- Name: Assignment_branchId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_branchId_classGroupId_idx" ON public."Assignment" USING btree ("branchId", "classGroupId");

--
-- Name: Assignment_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Assignment_branchId_id_key" ON public."Assignment" USING btree ("branchId", id);

--
-- Name: Assignment_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_branchId_status_idx" ON public."Assignment" USING btree ("branchId", status);

--
-- Name: Assignment_branchId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_branchId_subjectId_idx" ON public."Assignment" USING btree ("branchId", "subjectId");

--
-- Name: AttendanceGrant_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceGrant_branchId_idx" ON public."AttendanceGrant" USING btree ("branchId");

--
-- Name: AttendanceGrant_branchId_staffRecordId_classArmId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AttendanceGrant_branchId_staffRecordId_classArmId_key" ON public."AttendanceGrant" USING btree ("branchId", "staffRecordId", "classArmId");

--
-- Name: AttendanceGrant_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceGrant_classArmId_idx" ON public."AttendanceGrant" USING btree ("classArmId");

--
-- Name: AttendanceGrant_staffRecordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceGrant_staffRecordId_idx" ON public."AttendanceGrant" USING btree ("staffRecordId");

--
-- Name: AttendanceRecord_branchId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceRecord_branchId_date_idx" ON public."AttendanceRecord" USING btree ("branchId", date);

--
-- Name: AttendanceRecord_studentId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON public."AttendanceRecord" USING btree ("studentId", date);

--
-- Name: AttendanceRecord_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceRecord_studentId_idx" ON public."AttendanceRecord" USING btree ("studentId");

--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");

--
-- Name: AuditLog_targetType_targetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_targetType_targetId_idx" ON public."AuditLog" USING btree ("targetType", "targetId");

--
-- Name: Branch_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Branch_name_key" ON public."Branch" USING btree (name);

--
-- Name: ClassArm_branchId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassArm_branchId_classGroupId_idx" ON public."ClassArm" USING btree ("branchId", "classGroupId");

--
-- Name: ClassArm_branchId_classTeacherId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassArm_branchId_classTeacherId_idx" ON public."ClassArm" USING btree ("branchId", "classTeacherId");

--
-- Name: ClassArm_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassArm_branchId_id_key" ON public."ClassArm" USING btree ("branchId", id);

--
-- Name: ClassArm_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassArm_live_name_key" ON public."ClassArm" USING btree ("classGroupId", lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: ClassGroup_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassGroup_branchId_id_key" ON public."ClassGroup" USING btree ("branchId", id);

--
-- Name: ClassGroup_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassGroup_branchId_idx" ON public."ClassGroup" USING btree ("branchId");

--
-- Name: ClassGroup_branchId_sectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassGroup_branchId_sectionId_idx" ON public."ClassGroup" USING btree ("branchId", "sectionId");

--
-- Name: ClassGroup_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassGroup_live_name_key" ON public."ClassGroup" USING btree ("branchId", lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: EmailChangeToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON public."EmailChangeToken" USING btree ("tokenHash");

--
-- Name: EmailChangeToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailChangeToken_userId_idx" ON public."EmailChangeToken" USING btree ("userId");

--
-- Name: FeeStructure_branchId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FeeStructure_branchId_classGroupId_idx" ON public."FeeStructure" USING btree ("branchId", "classGroupId");

--
-- Name: FeeStructure_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FeeStructure_branchId_id_key" ON public."FeeStructure" USING btree ("branchId", id);

--
-- Name: FeeStructure_branchId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FeeStructure_branchId_periodId_idx" ON public."FeeStructure" USING btree ("branchId", "periodId");

--
-- Name: FormAnswer_branchId_formQuestionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_branchId_formQuestionId_idx" ON public."FormAnswer" USING btree ("branchId", "formQuestionId");

--
-- Name: FormAnswer_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormAnswer_branchId_id_key" ON public."FormAnswer" USING btree ("branchId", id);

--
-- Name: FormAnswer_branchId_markingStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_branchId_markingStatus_idx" ON public."FormAnswer" USING btree ("branchId", "markingStatus");

--
-- Name: FormAnswer_branchId_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_branchId_responseId_idx" ON public."FormAnswer" USING btree ("branchId", "responseId");

--
-- Name: FormAudience_branchId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAudience_branchId_formId_idx" ON public."FormAudience" USING btree ("branchId", "formId");

--
-- Name: FormAudience_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormAudience_branchId_id_key" ON public."FormAudience" USING btree ("branchId", id);

--
-- Name: FormMarkingAudit_branchId_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_branchId_answerId_idx" ON public."FormMarkingAudit" USING btree ("branchId", "answerId");

--
-- Name: FormMarkingAudit_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_branchId_createdAt_idx" ON public."FormMarkingAudit" USING btree ("branchId", "createdAt");

--
-- Name: FormMarkingAudit_branchId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_branchId_formId_idx" ON public."FormMarkingAudit" USING btree ("branchId", "formId");

--
-- Name: FormMarkingAudit_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormMarkingAudit_branchId_id_key" ON public."FormMarkingAudit" USING btree ("branchId", id);

--
-- Name: FormMarkingAudit_branchId_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_branchId_responseId_idx" ON public."FormMarkingAudit" USING btree ("branchId", "responseId");

--
-- Name: FormParticipation_branchId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormParticipation_branchId_formId_idx" ON public."FormParticipation" USING btree ("branchId", "formId");

--
-- Name: FormParticipation_branchId_formId_respondentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormParticipation_branchId_formId_respondentId_key" ON public."FormParticipation" USING btree ("branchId", "formId", "respondentId");

--
-- Name: FormParticipation_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormParticipation_branchId_id_key" ON public."FormParticipation" USING btree ("branchId", id);

--
-- Name: FormParticipation_branchId_respondentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormParticipation_branchId_respondentId_idx" ON public."FormParticipation" USING btree ("branchId", "respondentId");

--
-- Name: FormQuestion_branchId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormQuestion_branchId_formId_idx" ON public."FormQuestion" USING btree ("branchId", "formId");

--
-- Name: FormQuestion_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormQuestion_branchId_id_key" ON public."FormQuestion" USING btree ("branchId", id);

--
-- Name: FormQuestion_sourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormQuestion_sourceItemId_idx" ON public."FormQuestion" USING btree ("sourceItemId");

--
-- Name: FormResponse_branchId_formId_markingStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_branchId_formId_markingStatus_idx" ON public."FormResponse" USING btree ("branchId", "formId", "markingStatus");

--
-- Name: FormResponse_branchId_formId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_branchId_formId_status_idx" ON public."FormResponse" USING btree ("branchId", "formId", status);

--
-- Name: FormResponse_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormResponse_branchId_id_key" ON public."FormResponse" USING btree ("branchId", id);

--
-- Name: FormResponse_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_branchId_studentId_idx" ON public."FormResponse" USING btree ("branchId", "studentId");

--
-- Name: FormTurnInAudit_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_branchId_createdAt_idx" ON public."FormTurnInAudit" USING btree ("branchId", "createdAt");

--
-- Name: FormTurnInAudit_branchId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_branchId_formId_idx" ON public."FormTurnInAudit" USING btree ("branchId", "formId");

--
-- Name: FormTurnInAudit_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnInAudit_branchId_id_key" ON public."FormTurnInAudit" USING btree ("branchId", id);

--
-- Name: FormTurnInAudit_branchId_turnInId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_branchId_turnInId_idx" ON public."FormTurnInAudit" USING btree ("branchId", "turnInId");

--
-- Name: FormTurnIn_branchId_formId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnIn_branchId_formId_status_idx" ON public."FormTurnIn" USING btree ("branchId", "formId", status);

--
-- Name: FormTurnIn_branchId_formId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnIn_branchId_formId_studentId_key" ON public."FormTurnIn" USING btree ("branchId", "formId", "studentId");

--
-- Name: FormTurnIn_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnIn_branchId_id_key" ON public."FormTurnIn" USING btree ("branchId", id);

--
-- Name: FormTurnIn_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnIn_branchId_studentId_idx" ON public."FormTurnIn" USING btree ("branchId", "studentId");

--
-- Name: Form_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_branchId_createdAt_idx" ON public."Form" USING btree ("branchId", "createdAt");

--
-- Name: Form_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Form_branchId_id_key" ON public."Form" USING btree ("branchId", id);

--
-- Name: Form_branchId_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_branchId_kind_status_idx" ON public."Form" USING btree ("branchId", kind, status);

--
-- Name: Form_shareToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Form_shareToken_key" ON public."Form" USING btree ("shareToken");

--
-- Name: GradeBand_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeBand_branchId_id_key" ON public."GradeBand" USING btree ("branchId", id);

--
-- Name: GradeBand_branchId_scaleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GradeBand_branchId_scaleId_idx" ON public."GradeBand" USING btree ("branchId", "scaleId");

--
-- Name: GradeBand_letter_per_scale; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeBand_letter_per_scale" ON public."GradeBand" USING btree ("scaleId", lower(letter));

--
-- Name: GradeScale_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_branchId_id_key" ON public."GradeScale" USING btree ("branchId", id);

--
-- Name: GradeScale_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GradeScale_branchId_idx" ON public."GradeScale" USING btree ("branchId");

--
-- Name: GradeScale_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_name_live" ON public."GradeScale" USING btree ("branchId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: GradeScale_one_live_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_one_live_default" ON public."GradeScale" USING btree ("branchId") WHERE ("isDefault" AND ("archivedAt" IS NULL));

--
-- Name: GuardianLinkToken_branchId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianLinkToken_branchId_expiresAt_idx" ON public."GuardianLinkToken" USING btree ("branchId", "expiresAt");

--
-- Name: GuardianLinkToken_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLinkToken_branchId_id_key" ON public."GuardianLinkToken" USING btree ("branchId", id);

--
-- Name: GuardianLinkToken_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianLinkToken_branchId_studentId_idx" ON public."GuardianLinkToken" USING btree ("branchId", "studentId");

--
-- Name: GuardianLinkToken_branchId_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLinkToken_branchId_tokenHash_key" ON public."GuardianLinkToken" USING btree ("branchId", "tokenHash");

--
-- Name: Invitation_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_createdAt_idx" ON public."Invitation" USING btree ("createdAt");

--
-- Name: Invitation_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_email_idx" ON public."Invitation" USING btree (email);

--
-- Name: Invitation_one_live_per_address_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_one_live_per_address_branch" ON public."Invitation" USING btree (lower(email), "branchId") WHERE (("acceptedAt" IS NULL) AND ("revokedAt" IS NULL));

--
-- Name: Invitation_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON public."Invitation" USING btree ("tokenHash");

--
-- Name: InvoiceDiscount_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InvoiceDiscount_branchId_id_key" ON public."InvoiceDiscount" USING btree ("branchId", id);

--
-- Name: InvoiceDiscount_branchId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvoiceDiscount_branchId_invoiceId_idx" ON public."InvoiceDiscount" USING btree ("branchId", "invoiceId");

--
-- Name: Invoice_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_branchId_id_key" ON public."Invoice" USING btree ("branchId", id);

--
-- Name: Invoice_branchId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_branchId_periodId_idx" ON public."Invoice" USING btree ("branchId", "periodId");

--
-- Name: Invoice_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_branchId_status_idx" ON public."Invoice" USING btree ("branchId", status);

--
-- Name: Invoice_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_branchId_studentId_idx" ON public."Invoice" USING btree ("branchId", "studentId");

--
-- Name: Invoice_branchId_studentId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_branchId_studentId_periodId_key" ON public."Invoice" USING btree ("branchId", "studentId", "periodId");

--
-- Name: Invoice_invoiceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON public."Invoice" USING btree ("invoiceNo");

--
-- Name: LearningMaterial_branchId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LearningMaterial_branchId_classGroupId_idx" ON public."LearningMaterial" USING btree ("branchId", "classGroupId");

--
-- Name: LearningMaterial_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LearningMaterial_branchId_id_key" ON public."LearningMaterial" USING btree ("branchId", id);

--
-- Name: LearningMaterial_branchId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LearningMaterial_branchId_subjectId_idx" ON public."LearningMaterial" USING btree ("branchId", "subjectId");

--
-- Name: Membership_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_branchId_idx" ON public."Membership" USING btree ("branchId");

--
-- Name: Membership_userId_branchId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Membership_userId_branchId_key" ON public."Membership" USING btree ("userId", "branchId");

--
-- Name: MfaChallenge_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON public."MfaChallenge" USING btree ("tokenHash");

--
-- Name: MfaChallenge_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MfaChallenge_userId_idx" ON public."MfaChallenge" USING btree ("userId");

--
-- Name: MfaCredential_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaCredential_userId_key" ON public."MfaCredential" USING btree ("userId");

--
-- Name: MfaRecoveryCode_userId_codeHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaRecoveryCode_userId_codeHash_key" ON public."MfaRecoveryCode" USING btree ("userId", "codeHash");

--
-- Name: MfaRecoveryCode_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MfaRecoveryCode_userId_idx" ON public."MfaRecoveryCode" USING btree ("userId");

--
-- Name: NotificationAuditLog_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationAuditLog_branchId_createdAt_idx" ON public."NotificationAuditLog" USING btree ("branchId", "createdAt");

--
-- Name: NotificationAuditLog_branchId_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationAuditLog_branchId_event_idx" ON public."NotificationAuditLog" USING btree ("branchId", event);

--
-- Name: NotificationAuditLog_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationAuditLog_branchId_id_key" ON public."NotificationAuditLog" USING btree ("branchId", id);

--
-- Name: NotificationDispatch_branchId_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_branchId_channel_idx" ON public."NotificationDispatch" USING btree ("branchId", channel);

--
-- Name: NotificationDispatch_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_branchId_createdAt_idx" ON public."NotificationDispatch" USING btree ("branchId", "createdAt");

--
-- Name: NotificationDispatch_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationDispatch_branchId_id_key" ON public."NotificationDispatch" USING btree ("branchId", id);

--
-- Name: NotificationDispatch_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_branchId_status_idx" ON public."NotificationDispatch" USING btree ("branchId", status);

--
-- Name: NotificationTemplate_branchId_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationTemplate_branchId_channel_idx" ON public."NotificationTemplate" USING btree ("branchId", channel);

--
-- Name: NotificationTemplate_branchId_code_channel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationTemplate_branchId_code_channel_key" ON public."NotificationTemplate" USING btree ("branchId", code, channel);

--
-- Name: NotificationTemplate_branchId_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationTemplate_branchId_code_idx" ON public."NotificationTemplate" USING btree ("branchId", code);

--
-- Name: NotificationTemplate_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationTemplate_branchId_id_key" ON public."NotificationTemplate" USING btree ("branchId", id);

--
-- Name: PasswordResetToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON public."PasswordResetToken" USING btree ("tokenHash");

--
-- Name: PasswordResetToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasswordResetToken_userId_idx" ON public."PasswordResetToken" USING btree ("userId");

--
-- Name: PaymentWebhookEvent_provider_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON public."PaymentWebhookEvent" USING btree (provider, "eventId");

--
-- Name: PaymentWebhookEvent_provider_receivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PaymentWebhookEvent_provider_receivedAt_idx" ON public."PaymentWebhookEvent" USING btree (provider, "receivedAt");

--
-- Name: Payment_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_branchId_id_key" ON public."Payment" USING btree ("branchId", id);

--
-- Name: Payment_branchId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_branchId_invoiceId_idx" ON public."Payment" USING btree ("branchId", "invoiceId");

--
-- Name: Payment_branchId_providerRef_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_branchId_providerRef_idx" ON public."Payment" USING btree ("branchId", "providerRef");

--
-- Name: Payment_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_branchId_status_idx" ON public."Payment" USING btree ("branchId", status);

--
-- Name: Payment_provider_providerRef_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON public."Payment" USING btree (provider, "providerRef");

--
-- Name: PracticeAttempt_branchId_bankItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_branchId_bankItemId_idx" ON public."PracticeAttempt" USING btree ("branchId", "bankItemId");

--
-- Name: PracticeAttempt_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PracticeAttempt_branchId_id_key" ON public."PracticeAttempt" USING btree ("branchId", id);

--
-- Name: PracticeAttempt_branchId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_branchId_sessionId_idx" ON public."PracticeAttempt" USING btree ("branchId", "sessionId");

--
-- Name: PracticeAttempt_branchId_studentId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_branchId_studentId_archivedAt_idx" ON public."PracticeAttempt" USING btree ("branchId", "studentId", "archivedAt");

--
-- Name: PracticeAttempt_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_branchId_studentId_idx" ON public."PracticeAttempt" USING btree ("branchId", "studentId");

--
-- Name: PracticeSession_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PracticeSession_branchId_id_key" ON public."PracticeSession" USING btree ("branchId", id);

--
-- Name: PracticeSession_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeSession_branchId_studentId_idx" ON public."PracticeSession" USING btree ("branchId", "studentId");

--
-- Name: PracticeSession_branchId_studentId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeSession_branchId_studentId_startedAt_idx" ON public."PracticeSession" USING btree ("branchId", "studentId", "startedAt");

--
-- Name: ProgramAssessmentGroup_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAssessmentGroup_groupId_idx" ON public."ProgramAssessmentGroup" USING btree ("groupId");

--
-- Name: ProgramAssessment_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramAssessment_programId_id_key" ON public."ProgramAssessment" USING btree ("programId", id);

--
-- Name: ProgramAssessment_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAssessment_programId_status_idx" ON public."ProgramAssessment" USING btree ("programId", status);

--
-- Name: ProgramAttendanceChange_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendanceChange_participantId_createdAt_idx" ON public."ProgramAttendanceChange" USING btree ("participantId", "createdAt");

--
-- Name: ProgramAttendanceChange_programId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendanceChange_programId_sessionId_idx" ON public."ProgramAttendanceChange" USING btree ("programId", "sessionId");

--
-- Name: ProgramAttendance_programId_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendance_programId_branchId_idx" ON public."ProgramAttendance" USING btree ("programId", "branchId");

--
-- Name: ProgramAttendance_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendance_programId_participantId_idx" ON public."ProgramAttendance" USING btree ("programId", "participantId");

--
-- Name: ProgramAttendance_sessionId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramAttendance_sessionId_participantId_key" ON public."ProgramAttendance" USING btree ("sessionId", "participantId");

--
-- Name: ProgramAudit_programId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAudit_programId_createdAt_idx" ON public."ProgramAudit" USING btree ("programId", "createdAt");

--
-- Name: ProgramBranch_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramBranch_branchId_idx" ON public."ProgramBranch" USING btree ("branchId");

--
-- Name: ProgramCertificate_one_issued_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_one_issued_key" ON public."ProgramCertificate" USING btree ("programId", "participantId") WHERE (status = 'ISSUED'::public."ProgramCertificateStatus");

--
-- Name: ProgramCertificate_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_programId_id_key" ON public."ProgramCertificate" USING btree ("programId", id);

--
-- Name: ProgramCertificate_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramCertificate_programId_participantId_idx" ON public."ProgramCertificate" USING btree ("programId", "participantId");

--
-- Name: ProgramCertificate_serialNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_serialNo_key" ON public."ProgramCertificate" USING btree ("serialNo");

--
-- Name: ProgramCertificate_verifyToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_verifyToken_key" ON public."ProgramCertificate" USING btree ("verifyToken");

--
-- Name: ProgramFeeExemption_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramFeeExemption_participantId_idx" ON public."ProgramFeeExemption" USING btree ("participantId");

--
-- Name: ProgramFeeItem_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramFeeItem_programId_id_key" ON public."ProgramFeeItem" USING btree ("programId", id);

--
-- Name: ProgramFeeItem_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramFeeItem_programId_status_idx" ON public."ProgramFeeItem" USING btree ("programId", status);

--
-- Name: ProgramGroup_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramGroup_live_name_key" ON public."ProgramGroup" USING btree ("programId", COALESCE("parentId", ''::text), lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: ProgramGroup_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramGroup_programId_id_key" ON public."ProgramGroup" USING btree ("programId", id);

--
-- Name: ProgramGroup_programId_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramGroup_programId_parentId_idx" ON public."ProgramGroup" USING btree ("programId", "parentId");

--
-- Name: ProgramInvoiceDiscount_programId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramInvoiceDiscount_programId_invoiceId_idx" ON public."ProgramInvoiceDiscount" USING btree ("programId", "invoiceId");

--
-- Name: ProgramInvoice_invoiceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_invoiceNo_key" ON public."ProgramInvoice" USING btree ("invoiceNo");

--
-- Name: ProgramInvoice_programId_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramInvoice_programId_branchId_status_idx" ON public."ProgramInvoice" USING btree ("programId", "branchId", status);

--
-- Name: ProgramInvoice_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_programId_id_key" ON public."ProgramInvoice" USING btree ("programId", id);

--
-- Name: ProgramInvoice_programId_participantId_periodKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_programId_participantId_periodKey_key" ON public."ProgramInvoice" USING btree ("programId", "participantId", "periodKey");

--
-- Name: ProgramParticipant_programId_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_programId_branchId_idx" ON public."ProgramParticipant" USING btree ("programId", "branchId");

--
-- Name: ProgramParticipant_programId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_programId_groupId_idx" ON public."ProgramParticipant" USING btree ("programId", "groupId");

--
-- Name: ProgramParticipant_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_id_key" ON public."ProgramParticipant" USING btree ("programId", id);

--
-- Name: ProgramParticipant_programId_staffRecordId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_staffRecordId_key" ON public."ProgramParticipant" USING btree ("programId", "staffRecordId");

--
-- Name: ProgramParticipant_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_programId_status_idx" ON public."ProgramParticipant" USING btree ("programId", status);

--
-- Name: ProgramParticipant_programId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_studentId_key" ON public."ProgramParticipant" USING btree ("programId", "studentId");

--
-- Name: ProgramParticipant_staffRecordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_staffRecordId_idx" ON public."ProgramParticipant" USING btree ("staffRecordId");

--
-- Name: ProgramParticipant_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_studentId_idx" ON public."ProgramParticipant" USING btree ("studentId");

--
-- Name: ProgramPayment_programId_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramPayment_programId_branchId_status_idx" ON public."ProgramPayment" USING btree ("programId", "branchId", status);

--
-- Name: ProgramPayment_programId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramPayment_programId_invoiceId_idx" ON public."ProgramPayment" USING btree ("programId", "invoiceId");

--
-- Name: ProgramPayment_provider_providerRef_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramPayment_provider_providerRef_key" ON public."ProgramPayment" USING btree (provider, "providerRef");

--
-- Name: ProgramScoreChange_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScoreChange_participantId_createdAt_idx" ON public."ProgramScoreChange" USING btree ("participantId", "createdAt");

--
-- Name: ProgramScoreChange_programId_assessmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScoreChange_programId_assessmentId_idx" ON public."ProgramScoreChange" USING btree ("programId", "assessmentId");

--
-- Name: ProgramScore_assessmentId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramScore_assessmentId_participantId_key" ON public."ProgramScore" USING btree ("assessmentId", "participantId");

--
-- Name: ProgramScore_programId_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScore_programId_branchId_idx" ON public."ProgramScore" USING btree ("programId", "branchId");

--
-- Name: ProgramScore_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScore_programId_participantId_idx" ON public."ProgramScore" USING btree ("programId", "participantId");

--
-- Name: ProgramSession_programId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramSession_programId_date_idx" ON public."ProgramSession" USING btree ("programId", date);

--
-- Name: ProgramSession_programId_groupId_date_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramSession_programId_groupId_date_label_key" ON public."ProgramSession" USING btree ("programId", "groupId", date, label);

--
-- Name: ProgramStaffGroup_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaffGroup_groupId_idx" ON public."ProgramStaffGroup" USING btree ("groupId");

--
-- Name: ProgramStaff_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramStaff_programId_id_key" ON public."ProgramStaff" USING btree ("programId", id);

--
-- Name: ProgramStaff_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaff_programId_status_idx" ON public."ProgramStaff" USING btree ("programId", status);

--
-- Name: ProgramStaff_programId_userId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramStaff_programId_userId_role_key" ON public."ProgramStaff" USING btree ("programId", "userId", role);

--
-- Name: ProgramStaff_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaff_userId_status_idx" ON public."ProgramStaff" USING btree ("userId", status);

--
-- Name: Program_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Program_live_name_key" ON public."Program" USING btree (lower(name)) WHERE (status <> 'ARCHIVED'::public."ProgramStatus");

--
-- Name: Program_ownBranchId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Program_ownBranchId_key" ON public."Program" USING btree ("ownBranchId");

--
-- Name: Program_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Program_status_idx" ON public."Program" USING btree (status);

--
-- Name: ProgressEntryRevision_entryId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntryRevision_entryId_createdAt_idx" ON public."ProgressEntryRevision" USING btree ("entryId", "createdAt");

--
-- Name: ProgressEntryRevision_programId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntryRevision_programId_createdAt_idx" ON public."ProgressEntryRevision" USING btree ("programId", "createdAt");

--
-- Name: ProgressEntry_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressEntry_programId_id_key" ON public."ProgressEntry" USING btree ("programId", id);

--
-- Name: ProgressEntry_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntry_programId_status_idx" ON public."ProgressEntry" USING btree ("programId", status);

--
-- Name: ProgressEntry_recordId_trackKey_entryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntry_recordId_trackKey_entryDate_idx" ON public."ProgressEntry" USING btree ("recordId", "trackKey", "entryDate");

--
-- Name: ProgressLock_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressLock_expiresAt_idx" ON public."ProgressLock" USING btree ("expiresAt");

--
-- Name: ProgressLock_programId_entryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressLock_programId_entryId_key" ON public."ProgressLock" USING btree ("programId", "entryId");

--
-- Name: ProgressRecord_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_participantId_key" ON public."ProgressRecord" USING btree ("participantId");

--
-- Name: ProgressRecord_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_programId_id_key" ON public."ProgressRecord" USING btree ("programId", id);

--
-- Name: ProgressRecord_programId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressRecord_programId_idx" ON public."ProgressRecord" USING btree ("programId");

--
-- Name: ProgressRecord_programId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_programId_participantId_key" ON public."ProgressRecord" USING btree ("programId", "participantId");

--
-- Name: ProgressSeen_recordId_actor_weekStart_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressSeen_recordId_actor_weekStart_key" ON public."ProgressSeen" USING btree ("recordId", actor, "weekStart");

--
-- Name: ProgressTemplate_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressTemplate_programId_id_key" ON public."ProgressTemplate" USING btree ("programId", id);

--
-- Name: ProgressTemplate_programId_key_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressTemplate_programId_key_version_key" ON public."ProgressTemplate" USING btree ("programId", key, version);

--
-- Name: PromotionBatch_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PromotionBatch_branchId_id_key" ON public."PromotionBatch" USING btree ("branchId", id);

--
-- Name: PromotionBatch_branchId_sourceSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionBatch_branchId_sourceSessionId_idx" ON public."PromotionBatch" USING btree ("branchId", "sourceSessionId");

--
-- Name: PromotionBatch_branchId_targetSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionBatch_branchId_targetSessionId_idx" ON public."PromotionBatch" USING btree ("branchId", "targetSessionId");

--
-- Name: PromotionRecord_batchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionRecord_batchId_idx" ON public."PromotionRecord" USING btree ("batchId");

--
-- Name: PromotionRecord_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionRecord_studentId_idx" ON public."PromotionRecord" USING btree ("studentId");

--
-- Name: QuestionBankAudit_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_branchId_createdAt_idx" ON public."QuestionBankAudit" USING btree ("branchId", "createdAt");

--
-- Name: QuestionBankAudit_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_createdAt_idx" ON public."QuestionBankAudit" USING btree ("createdAt");

--
-- Name: QuestionBankAudit_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_itemId_idx" ON public."QuestionBankAudit" USING btree ("itemId");

--
-- Name: QuestionBankClassTag_itemId_labelKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankClassTag_itemId_labelKey_key" ON public."QuestionBankClassTag" USING btree ("itemId", "labelKey");

--
-- Name: QuestionBankClassTag_labelKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankClassTag_labelKey_idx" ON public."QuestionBankClassTag" USING btree ("labelKey");

--
-- Name: QuestionBankImage_itemId_sortOrder_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankImage_itemId_sortOrder_key" ON public."QuestionBankImage" USING btree ("itemId", "sortOrder");

--
-- Name: QuestionBankImage_storageKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankImage_storageKey_key" ON public."QuestionBankImage" USING btree ("storageKey");

--
-- Name: QuestionBankItemVersion_itemId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankItemVersion_itemId_version_key" ON public."QuestionBankItemVersion" USING btree ("itemId", version);

--
-- Name: QuestionBankItem_bank_subjectKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_bank_subjectKey_idx" ON public."QuestionBankItem" USING btree (bank, "subjectKey");

--
-- Name: QuestionBankItem_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_branchId_status_idx" ON public."QuestionBankItem" USING btree ("branchId", status);

--
-- Name: QuestionBankItem_status_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_status_visibility_idx" ON public."QuestionBankItem" USING btree (status, visibility);

--
-- Name: QuestionBankItem_visibleAfterQuizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_visibleAfterQuizId_idx" ON public."QuestionBankItem" USING btree ("visibleAfterQuizId");

--
-- Name: QuestionBankPrintLog_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_branchId_createdAt_idx" ON public."QuestionBankPrintLog" USING btree ("branchId", "createdAt");

--
-- Name: QuestionBankPrintLog_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankPrintLog_branchId_id_key" ON public."QuestionBankPrintLog" USING btree ("branchId", id);

--
-- Name: QuestionBankPrintLog_branchId_recipientStudentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_branchId_recipientStudentId_idx" ON public."QuestionBankPrintLog" USING btree ("branchId", "recipientStudentId");

--
-- Name: QuestionBankPrintLog_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_branchId_studentId_idx" ON public."QuestionBankPrintLog" USING btree ("branchId", "studentId");

--
-- Name: QuestionBankPrintLog_branchId_targetKind_targetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_branchId_targetKind_targetId_idx" ON public."QuestionBankPrintLog" USING btree ("branchId", "targetKind", "targetId");

--
-- Name: QuestionBankPrintLog_branchId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_branchId_userId_idx" ON public."QuestionBankPrintLog" USING btree ("branchId", "userId");

--
-- Name: QuestionBankReview_itemId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReview_itemId_createdAt_idx" ON public."QuestionBankReview" USING btree ("itemId", "createdAt");

--
-- Name: QuestionBankReviewer_branchId_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReviewer_branchId_scope_idx" ON public."QuestionBankReviewer" USING btree ("branchId", scope);

--
-- Name: QuestionBankReviewer_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankReviewer_once" ON public."QuestionBankReviewer" USING btree ("userId", COALESCE("branchId", ''::text), scope, COALESCE("subjectKey", ''::text));

--
-- Name: QuestionBankReviewer_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReviewer_userId_idx" ON public."QuestionBankReviewer" USING btree ("userId");

--
-- Name: QuestionOverlapFlag_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionOverlapFlag_itemId_idx" ON public."QuestionOverlapFlag" USING btree ("itemId");

--
-- Name: QuestionReport_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_branchId_status_idx" ON public."QuestionReport" USING btree ("branchId", status);

--
-- Name: QuestionReport_itemId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_itemId_status_idx" ON public."QuestionReport" USING btree ("itemId", status);

--
-- Name: QuestionReport_reporterStudentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_reporterStudentId_idx" ON public."QuestionReport" USING btree ("reporterStudentId");

--
-- Name: QuestionReport_reporterUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_reporterUserId_idx" ON public."QuestionReport" USING btree ("reporterUserId");

--
-- Name: QuizAttempt_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuizAttempt_branchId_id_key" ON public."QuizAttempt" USING btree ("branchId", id);

--
-- Name: QuizAttempt_branchId_quizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizAttempt_branchId_quizId_idx" ON public."QuizAttempt" USING btree ("branchId", "quizId");

--
-- Name: QuizAttempt_branchId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizAttempt_branchId_studentId_idx" ON public."QuizAttempt" USING btree ("branchId", "studentId");

--
-- Name: QuizQuestion_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuizQuestion_branchId_id_key" ON public."QuizQuestion" USING btree ("branchId", id);

--
-- Name: QuizQuestion_branchId_quizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizQuestion_branchId_quizId_idx" ON public."QuizQuestion" USING btree ("branchId", "quizId");

--
-- Name: QuizQuestion_sourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizQuestion_sourceItemId_idx" ON public."QuizQuestion" USING btree ("sourceItemId");

--
-- Name: Quiz_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Quiz_branchId_id_key" ON public."Quiz" USING btree ("branchId", id);

--
-- Name: Quiz_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Quiz_branchId_status_idx" ON public."Quiz" USING btree ("branchId", status);

--
-- Name: Quiz_branchId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Quiz_branchId_subjectId_idx" ON public."Quiz" USING btree ("branchId", "subjectId");

--
-- Name: ReportCardLayout_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportCardLayout_code_key" ON public."ReportCardLayout" USING btree (code);

--
-- Name: ReportRemark_branchId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRemark_branchId_periodId_idx" ON public."ReportRemark" USING btree ("branchId", "periodId");

--
-- Name: ReportRemark_studentId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportRemark_studentId_periodId_key" ON public."ReportRemark" USING btree ("studentId", "periodId");

--
-- Name: ResultApprovalScope_branchId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultApprovalScope_branchId_userId_idx" ON public."ResultApprovalScope" USING btree ("branchId", "userId");

--
-- Name: ResultApprovalScope_target_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ResultApprovalScope_target_key" ON public."ResultApprovalScope" USING btree ("branchId", "userId", kind, COALESCE("sectionId", ''::text), COALESCE("classGroupId", ''::text));

--
-- Name: ResultAudit_branchId_resultId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultAudit_branchId_resultId_idx" ON public."ResultAudit" USING btree ("branchId", "resultId");

--
-- Name: ResultAudit_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultAudit_createdAt_idx" ON public."ResultAudit" USING btree ("createdAt");

--
-- Name: Result_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_branchId_id_key" ON public."Result" USING btree ("branchId", id);

--
-- Name: Result_branchId_periodId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Result_branchId_periodId_classArmId_idx" ON public."Result" USING btree ("branchId", "periodId", "classArmId");

--
-- Name: Result_branchId_studentId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Result_branchId_studentId_periodId_idx" ON public."Result" USING btree ("branchId", "studentId", "periodId");

--
-- Name: Result_studentId_subjectId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_studentId_subjectId_periodId_key" ON public."Result" USING btree ("studentId", "subjectId", "periodId");

--
-- Name: Result_verificationToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_verificationToken_key" ON public."Result" USING btree ("verificationToken");

--
-- Name: Section_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Section_branchId_id_key" ON public."Section" USING btree ("branchId", id);

--
-- Name: Section_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Section_branchId_idx" ON public."Section" USING btree ("branchId");

--
-- Name: Section_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Section_live_name_key" ON public."Section" USING btree ("branchId", lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: Session_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_tokenHash_key" ON public."Session" USING btree ("tokenHash");

--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");

--
-- Name: SettingApproval_branchId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingApproval_branchId_status_idx" ON public."SettingApproval" USING btree ("branchId", status);

--
-- Name: SettingApproval_targetType_targetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingApproval_targetType_targetId_idx" ON public."SettingApproval" USING btree ("targetType", "targetId");

--
-- Name: SettingAudit_branchId_settingKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingAudit_branchId_settingKey_idx" ON public."SettingAudit" USING btree ("branchId", "settingKey");

--
-- Name: SettingAudit_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingAudit_createdAt_idx" ON public."SettingAudit" USING btree ("createdAt");

--
-- Name: SettingValue_branchId_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingValue_branchId_key_idx" ON public."SettingValue" USING btree ("branchId", key);

--
-- Name: SettingValue_scope_branchId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SettingValue_scope_branchId_key_key" ON public."SettingValue" USING btree (scope, "branchId", key);

--
-- Name: StaffRecord_account_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_account_once" ON public."StaffRecord" USING btree ("branchId", "userId") WHERE ("userId" IS NOT NULL);

--
-- Name: StaffRecord_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_branchId_id_key" ON public."StaffRecord" USING btree ("branchId", id);

--
-- Name: StaffRecord_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StaffRecord_branchId_idx" ON public."StaffRecord" USING btree ("branchId");

--
-- Name: StaffRecord_email_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_email_live" ON public."StaffRecord" USING btree ("branchId", lower(email)) WHERE ((email IS NOT NULL) AND ("archivedAt" IS NULL));

--
-- Name: StaffSubjectAssignment_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StaffSubjectAssignment_branchId_idx" ON public."StaffSubjectAssignment" USING btree ("branchId");

--
-- Name: StaffSubjectAssignment_staffRecordId_subjectId_classArmId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffSubjectAssignment_staffRecordId_subjectId_classArmId_key" ON public."StaffSubjectAssignment" USING btree ("staffRecordId", "subjectId", "classArmId");

--
-- Name: StandingEvent_branchId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_branchId_createdAt_idx" ON public."StandingEvent" USING btree ("branchId", "createdAt");

--
-- Name: StandingEvent_membershipId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_membershipId_createdAt_idx" ON public."StandingEvent" USING btree ("membershipId", "createdAt");

--
-- Name: StandingEvent_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_participantId_createdAt_idx" ON public."StandingEvent" USING btree ("participantId", "createdAt");

--
-- Name: StandingEvent_staffRecordId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_staffRecordId_createdAt_idx" ON public."StandingEvent" USING btree ("staffRecordId", "createdAt");

--
-- Name: StandingEvent_studentId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_studentId_createdAt_idx" ON public."StandingEvent" USING btree ("studentId", "createdAt");

--
-- Name: StudentEnrollment_branchId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentEnrollment_branchId_sessionId_idx" ON public."StudentEnrollment" USING btree ("branchId", "sessionId");

--
-- Name: StudentEnrollment_studentId_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentEnrollment_studentId_sessionId_key" ON public."StudentEnrollment" USING btree ("studentId", "sessionId");

--
-- Name: StudentRecord_admissionNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentRecord_admissionNo_key" ON public."StudentRecord" USING btree ("admissionNo");

--
-- Name: StudentRecord_branchId_firstName_lastName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentRecord_branchId_firstName_lastName_idx" ON public."StudentRecord" USING btree ("branchId", "firstName", "lastName");

--
-- Name: StudentRecord_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentRecord_branchId_id_key" ON public."StudentRecord" USING btree ("branchId", id);

--
-- Name: StudentRecord_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentRecord_branchId_idx" ON public."StudentRecord" USING btree ("branchId");

--
-- Name: SubjectOffering_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SubjectOffering_branchId_idx" ON public."SubjectOffering" USING btree ("branchId");

--
-- Name: SubjectOffering_classGroupId_subjectId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SubjectOffering_classGroupId_subjectId_key" ON public."SubjectOffering" USING btree ("classGroupId", "subjectId");

--
-- Name: Subject_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_branchId_id_key" ON public."Subject" USING btree ("branchId", id);

--
-- Name: Subject_branchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Subject_branchId_idx" ON public."Subject" USING btree ("branchId");

--
-- Name: Subject_live_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_live_code_key" ON public."Subject" USING btree ("branchId", code) WHERE ((code IS NOT NULL) AND ("archivedAt" IS NULL));

--
-- Name: Subject_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_live_name_key" ON public."Subject" USING btree ("branchId", lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: TimetableSlot_branchId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_branchId_classArmId_idx" ON public."TimetableSlot" USING btree ("branchId", "classArmId");

--
-- Name: TimetableSlot_branchId_dayOfWeek_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_branchId_dayOfWeek_idx" ON public."TimetableSlot" USING btree ("branchId", "dayOfWeek");

--
-- Name: TimetableSlot_branchId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TimetableSlot_branchId_id_key" ON public."TimetableSlot" USING btree ("branchId", id);

--
-- Name: TimetableSlot_branchId_staffRecordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_branchId_staffRecordId_idx" ON public."TimetableSlot" USING btree ("branchId", "staffRecordId");

--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: VerificationPageConfig_branchId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VerificationPageConfig_branchId_key" ON public."VerificationPageConfig" USING btree ("branchId");

--
-- Name: AcademicSession AcademicSession_closed_locks_results; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "AcademicSession_closed_locks_results" AFTER UPDATE OF status ON public."AcademicSession" FOR EACH ROW EXECUTE FUNCTION public.session_closed_locks_results();

--
-- Name: FormMarkingAudit FormMarkingAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "FormMarkingAudit_append_only" BEFORE DELETE OR UPDATE ON public."FormMarkingAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: FormTurnInAudit FormTurnInAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "FormTurnInAudit_append_only" BEFORE DELETE OR UPDATE ON public."FormTurnInAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: ProgramAttendanceChange ProgramAttendanceChange_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProgramAttendanceChange_append_only" BEFORE DELETE OR UPDATE ON public."ProgramAttendanceChange" FOR EACH ROW EXECUTE FUNCTION public.program_attendance_change_append_only();

--
-- Name: ProgramScoreChange ProgramScoreChange_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProgramScoreChange_append_only" BEFORE DELETE OR UPDATE ON public."ProgramScoreChange" FOR EACH ROW EXECUTE FUNCTION public.program_score_change_append_only();

--
-- Name: ProgressEntryRevision ProgressEntryRevision_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProgressEntryRevision_append_only" BEFORE DELETE OR UPDATE ON public."ProgressEntryRevision" FOR EACH ROW EXECUTE FUNCTION public.progress_entry_revision_append_only();

--
-- Name: ProgressTemplate ProgressTemplate_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ProgressTemplate_immutable" BEFORE DELETE OR UPDATE ON public."ProgressTemplate" FOR EACH ROW EXECUTE FUNCTION public.progress_template_immutable();

--
-- Name: QuestionBankAudit QuestionBankAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankAudit_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankImage QuestionBankImage_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankImage_limit" BEFORE INSERT OR UPDATE OF "itemId" ON public."QuestionBankImage" FOR EACH ROW EXECUTE FUNCTION public.question_bank_image_limit();

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankItemVersion_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankItemVersion" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankItem QuestionBankItem_visibility_forward; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankItem_visibility_forward" BEFORE INSERT OR UPDATE OF visibility, "visibleFrom" ON public."QuestionBankItem" FOR EACH ROW EXECUTE FUNCTION public.question_bank_visibility_forward();

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankPrintLog_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankPrintLog" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankReview QuestionBankReview_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankReview_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankReview" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: ResultAudit ResultAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ResultAudit_append_only" BEFORE DELETE OR UPDATE ON public."ResultAudit" FOR EACH ROW EXECUTE FUNCTION public.result_audit_append_only();

--
-- Name: Result Result_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Result_delete_guard" BEFORE DELETE ON public."Result" FOR EACH ROW EXECUTE FUNCTION public.result_delete_guard();

--
-- Name: Result Result_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Result_guard" BEFORE UPDATE ON public."Result" FOR EACH ROW EXECUTE FUNCTION public.result_guard();

--
-- Name: StandingEvent StandingEvent_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "StandingEvent_append_only" BEFORE DELETE OR UPDATE ON public."StandingEvent" FOR EACH ROW EXECUTE FUNCTION public.standing_event_append_only();

--
-- Name: AssessmentComponent assessment_component_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_component_locked BEFORE INSERT OR DELETE OR UPDATE ON public."AssessmentComponent" FOR EACH ROW EXECUTE FUNCTION public.assessment_component_locked_guard();

--
-- Name: AssessmentScheme assessment_scheme_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_scheme_locked BEFORE UPDATE ON public."AssessmentScheme" FOR EACH ROW EXECUTE FUNCTION public.assessment_scheme_locked_guard();

--
-- Name: GradeBand grade_band_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_band_locked BEFORE INSERT OR DELETE OR UPDATE ON public."GradeBand" FOR EACH ROW EXECUTE FUNCTION public.grade_band_locked_guard();

--
-- Name: GradeScale grade_scale_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_scale_locked BEFORE UPDATE ON public."GradeScale" FOR EACH ROW EXECUTE FUNCTION public.grade_scale_locked_guard();

--
-- Name: AcademicPeriod AcademicPeriod_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AcademicPeriod AcademicPeriod_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."AcademicSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AcademicSession AcademicSession_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AdminSelfApprovalGrant AdminSelfApprovalGrant_adminUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSelfApprovalGrant"
    ADD CONSTRAINT "AdminSelfApprovalGrant_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AdminSelfApprovalGrant AdminSelfApprovalGrant_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSelfApprovalGrant"
    ADD CONSTRAINT "AdminSelfApprovalGrant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AdminSelfApprovalGrant AdminSelfApprovalGrant_grantedBySuperadminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSelfApprovalGrant"
    ADD CONSTRAINT "AdminSelfApprovalGrant_grantedBySuperadminId_fkey" FOREIGN KEY ("grantedBySuperadminId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AdminSelfApprovalGrant AdminSelfApprovalGrant_unseenReviewerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSelfApprovalGrant"
    ADD CONSTRAINT "AdminSelfApprovalGrant_unseenReviewerUserId_fkey" FOREIGN KEY ("unseenReviewerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Announcement Announcement_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Announcement Announcement_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Announcement Announcement_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_classArmId_fkey" FOREIGN KEY ("classArmId") REFERENCES public."ClassArm"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AssessmentComponent AssessmentComponent_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentComponent AssessmentComponent_branchId_schemeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_branchId_schemeId_fkey" FOREIGN KEY ("branchId", "schemeId") REFERENCES public."AssessmentScheme"("branchId", id) ON UPDATE CASCADE;

--
-- Name: AssessmentSchemeDraft AssessmentSchemeDraft_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeDraft"
    ADD CONSTRAINT "AssessmentSchemeDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentSchemeDraft AssessmentSchemeDraft_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeDraft"
    ADD CONSTRAINT "AssessmentSchemeDraft_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES public."Subject"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentSchemeDraft AssessmentSchemeDraft_teacherUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeDraft"
    ADD CONSTRAINT "AssessmentSchemeDraft_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES public."ClassGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_schemeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES public."AssessmentScheme"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES public."Subject"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AssessmentSchemeScope AssessmentSchemeScope_teacherUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentSchemeScope"
    ADD CONSTRAINT "AssessmentSchemeScope_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AssessmentScheme AssessmentScheme_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: AssessmentScheme AssessmentScheme_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentScheme AssessmentScheme_branchId_supersedesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_branchId_supersedesId_fkey" FOREIGN KEY ("branchId", "supersedesId") REFERENCES public."AssessmentScheme"("branchId", id) ON UPDATE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_branchId_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_branchId_assignmentId_fkey" FOREIGN KEY ("branchId", "assignmentId") REFERENCES public."Assignment"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_branchId_gradedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_branchId_gradedById_fkey" FOREIGN KEY ("branchId", "gradedById") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_branchId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Assignment Assignment_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: AttendanceGrant AttendanceGrant_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceGrant"
    ADD CONSTRAINT "AttendanceGrant_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AttendanceGrant AttendanceGrant_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceGrant"
    ADD CONSTRAINT "AttendanceGrant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AttendanceGrant AttendanceGrant_branchId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceGrant"
    ADD CONSTRAINT "AttendanceGrant_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AttendanceGrant AttendanceGrant_grantedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceGrant"
    ADD CONSTRAINT "AttendanceGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AttendanceRecord AttendanceRecord_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AttendanceRecord AttendanceRecord_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."StudentRecord"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassArm ClassArm_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ClassArm ClassArm_branchId_classTeacherId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_branchId_classTeacherId_fkey" FOREIGN KEY ("branchId", "classTeacherId") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ClassArm ClassArm_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassGroup ClassGroup_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassGroup ClassGroup_branchId_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_branchId_sectionId_fkey" FOREIGN KEY ("branchId", "sectionId") REFERENCES public."Section"("branchId", id) ON UPDATE CASCADE;

--
-- Name: EmailChangeToken EmailChangeToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailChangeToken"
    ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FeeStructure FeeStructure_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: FeeStructure FeeStructure_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FeeStructure FeeStructure_branchId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES public."AcademicPeriod"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_branchId_formQuestionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_branchId_formQuestionId_fkey" FOREIGN KEY ("branchId", "formQuestionId") REFERENCES public."FormQuestion"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_branchId_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_branchId_responseId_fkey" FOREIGN KEY ("branchId", "responseId") REFERENCES public."FormResponse"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormAudience FormAudience_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAudience FormAudience_branchId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES public."Form"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: FormMarkingAudit FormMarkingAudit_branchId_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_branchId_answerId_fkey" FOREIGN KEY ("branchId", "answerId") REFERENCES public."FormAnswer"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_branchId_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_branchId_responseId_fkey" FOREIGN KEY ("branchId", "responseId") REFERENCES public."FormResponse"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormParticipation FormParticipation_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormParticipation FormParticipation_branchId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES public."Form"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_branchId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES public."Form"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_sourceItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormResponse FormResponse_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormResponse FormResponse_branchId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES public."Form"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormResponse FormResponse_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormResponse FormResponse_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormTurnInAudit FormTurnInAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormTurnInAudit FormTurnInAudit_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnInAudit FormTurnInAudit_branchId_turnInId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_branchId_turnInId_fkey" FOREIGN KEY ("branchId", "turnInId") REFERENCES public."FormTurnIn"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_branchId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_branchId_formId_fkey" FOREIGN KEY ("branchId", "formId") REFERENCES public."Form"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Form Form_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Form Form_closedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Form Form_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: GradeBand GradeBand_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GradeBand GradeBand_branchId_scaleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_branchId_scaleId_fkey" FOREIGN KEY ("branchId", "scaleId") REFERENCES public."GradeScale"("branchId", id) ON UPDATE CASCADE;

--
-- Name: GradeScale GradeScale_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GradeScale GradeScale_branchId_supersedesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_branchId_supersedesId_fkey" FOREIGN KEY ("branchId", "supersedesId") REFERENCES public."GradeScale"("branchId", id) ON UPDATE CASCADE;

--
-- Name: GuardianLinkToken GuardianLinkToken_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GuardianLinkToken GuardianLinkToken_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invitation Invitation_acceptedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Invitation Invitation_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invitation Invitation_invitedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: InvoiceCounter InvoiceCounter_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceCounter"
    ADD CONSTRAINT "InvoiceCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: InvoiceDiscount InvoiceDiscount_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: InvoiceDiscount InvoiceDiscount_branchId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_branchId_invoiceId_fkey" FOREIGN KEY ("branchId", "invoiceId") REFERENCES public."Invoice"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_branchId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES public."AcademicPeriod"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_branchId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Membership Membership_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Membership Membership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MfaChallenge MfaChallenge_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaChallenge"
    ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MfaCredential MfaCredential_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaCredential"
    ADD CONSTRAINT "MfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MfaRecoveryCode MfaRecoveryCode_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaRecoveryCode"
    ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationAuditLog NotificationAuditLog_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationAuditLog"
    ADD CONSTRAINT "NotificationAuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationDispatch NotificationDispatch_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationDispatch NotificationDispatch_branchId_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_branchId_templateId_fkey" FOREIGN KEY ("branchId", "templateId") REFERENCES public."NotificationTemplate"("branchId", id) ON UPDATE CASCADE;

--
-- Name: NotificationDispatch NotificationDispatch_recipientUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: NotificationTemplate NotificationTemplate_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationTemplate"
    ADD CONSTRAINT "NotificationTemplate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PasswordResetToken PasswordResetToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Payment Payment_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Payment Payment_branchId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_branchId_invoiceId_fkey" FOREIGN KEY ("branchId", "invoiceId") REFERENCES public."Invoice"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_bankItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_branchId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_branchId_sessionId_fkey" FOREIGN KEY ("branchId", "sessionId") REFERENCES public."PracticeSession"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeSession PracticeSession_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeSession PracticeSession_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_programId_assessmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_programId_assessmentId_fkey" FOREIGN KEY ("programId", "assessmentId") REFERENCES public."ProgramAssessment"("programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES public."ProgramGroup"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAssessment ProgramAssessment_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessment"
    ADD CONSTRAINT "ProgramAssessment_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAttendance ProgramAttendance_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAttendance ProgramAttendance_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."ProgramSession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAudit ProgramAudit_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAudit"
    ADD CONSTRAINT "ProgramAudit_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramBranch ProgramBranch_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramBranch"
    ADD CONSTRAINT "ProgramBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramBranch ProgramBranch_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramBranch"
    ADD CONSTRAINT "ProgramBranch_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramCertificate ProgramCertificate_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramCertificate ProgramCertificate_replacesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES public."ProgramCertificate"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ProgramFeeExemption ProgramFeeExemption_programId_feeItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_programId_feeItemId_fkey" FOREIGN KEY ("programId", "feeItemId") REFERENCES public."ProgramFeeItem"("programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramFeeExemption ProgramFeeExemption_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramFeeItem ProgramFeeItem_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeItem"
    ADD CONSTRAINT "ProgramFeeItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramGroup ProgramGroup_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."ProgramGroup"(id) ON UPDATE CASCADE;

--
-- Name: ProgramGroup ProgramGroup_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramInvoiceDiscount ProgramInvoiceDiscount_programId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoiceDiscount"
    ADD CONSTRAINT "ProgramInvoiceDiscount_programId_invoiceId_fkey" FOREIGN KEY ("programId", "invoiceId") REFERENCES public."ProgramInvoice"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramInvoice ProgramInvoice_programId_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoice"
    ADD CONSTRAINT "ProgramInvoice_programId_branchId_fkey" FOREIGN KEY ("programId", "branchId") REFERENCES public."ProgramBranch"("programId", "branchId") ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramInvoice ProgramInvoice_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoice"
    ADD CONSTRAINT "ProgramInvoice_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramLevelLabel ProgramLevelLabel_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramLevelLabel"
    ADD CONSTRAINT "ProgramLevelLabel_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_branchId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramParticipant ProgramParticipant_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramParticipant ProgramParticipant_programId_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_programId_branchId_fkey" FOREIGN KEY ("programId", "branchId") REFERENCES public."ProgramBranch"("programId", "branchId") ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramParticipant ProgramParticipant_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES public."ProgramGroup"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramPayment ProgramPayment_programId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramPayment"
    ADD CONSTRAINT "ProgramPayment_programId_invoiceId_fkey" FOREIGN KEY ("programId", "invoiceId") REFERENCES public."ProgramInvoice"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramScore ProgramScore_programId_assessmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_programId_assessmentId_fkey" FOREIGN KEY ("programId", "assessmentId") REFERENCES public."ProgramAssessment"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramScore ProgramScore_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramSession ProgramSession_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramSession"
    ADD CONSTRAINT "ProgramSession_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES public."ProgramGroup"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramStaffGroup ProgramStaffGroup_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_programId_groupId_fkey" FOREIGN KEY ("programId", "groupId") REFERENCES public."ProgramGroup"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramStaffGroup ProgramStaffGroup_programId_programStaffId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_programId_programStaffId_fkey" FOREIGN KEY ("programId", "programStaffId") REFERENCES public."ProgramStaff"("programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramStaff ProgramStaff_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramStaff ProgramStaff_userId_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES public."Membership"("userId", "branchId") ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Program Program_ownBranchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Program"
    ADD CONSTRAINT "Program_ownBranchId_fkey" FOREIGN KEY ("ownBranchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE;

--
-- Name: ProgressEntry ProgressEntry_programId_recordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntry"
    ADD CONSTRAINT "ProgressEntry_programId_recordId_fkey" FOREIGN KEY ("programId", "recordId") REFERENCES public."ProgressRecord"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressLock ProgressLock_programId_entryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressLock"
    ADD CONSTRAINT "ProgressLock_programId_entryId_fkey" FOREIGN KEY ("programId", "entryId") REFERENCES public."ProgressEntry"("programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgressRecord ProgressRecord_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_programId_participantId_fkey" FOREIGN KEY ("programId", "participantId") REFERENCES public."ProgramParticipant"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressRecord ProgressRecord_programId_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_programId_templateId_fkey" FOREIGN KEY ("programId", "templateId") REFERENCES public."ProgressTemplate"("programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressSeen ProgressSeen_programId_recordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressSeen"
    ADD CONSTRAINT "ProgressSeen_programId_recordId_fkey" FOREIGN KEY ("programId", "recordId") REFERENCES public."ProgressRecord"("programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgressTemplate ProgressTemplate_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressTemplate"
    ADD CONSTRAINT "ProgressTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_branchId_sourceClassGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_branchId_sourceClassGroupId_fkey" FOREIGN KEY ("branchId", "sourceClassGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_branchId_targetClassGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_branchId_targetClassGroupId_fkey" FOREIGN KEY ("branchId", "targetClassGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_executedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_sourceSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES public."AcademicSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_targetSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_targetSessionId_fkey" FOREIGN KEY ("targetSessionId") REFERENCES public."AcademicSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionRecord PromotionRecord_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."PromotionBatch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionRecord PromotionRecord_sourceEnrollmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_sourceEnrollmentId_fkey" FOREIGN KEY ("sourceEnrollmentId") REFERENCES public."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionRecord PromotionRecord_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."StudentRecord"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionRecord PromotionRecord_targetEnrollmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_targetEnrollmentId_fkey" FOREIGN KEY ("targetEnrollmentId") REFERENCES public."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionBankAudit QuestionBankAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankAudit QuestionBankAudit_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankClassTag QuestionBankClassTag_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankClassTag"
    ADD CONSTRAINT "QuestionBankClassTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankImage QuestionBankImage_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankImage"
    ADD CONSTRAINT "QuestionBankImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankItem QuestionBankItem_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankItem QuestionBankItem_submittedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_branchId_recipientStudentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_branchId_recipientStudentId_fkey" FOREIGN KEY ("branchId", "recipientStudentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionBankReview QuestionBankReview_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankReview QuestionBankReview_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_assignedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_similarToItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_similarToItemId_fkey" FOREIGN KEY ("similarToItemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionReport QuestionReport_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionReport QuestionReport_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."QuestionBankItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionReport QuestionReport_reporterStudentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_reporterStudentId_fkey" FOREIGN KEY ("reporterStudentId") REFERENCES public."StudentRecord"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionReport QuestionReport_reporterUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionReport QuestionReport_resolvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuizAttempt QuizAttempt_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizAttempt QuizAttempt_branchId_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_branchId_quizId_fkey" FOREIGN KEY ("branchId", "quizId") REFERENCES public."Quiz"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizAttempt QuizAttempt_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: QuizQuestion QuizQuestion_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizQuestion QuizQuestion_branchId_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_branchId_quizId_fkey" FOREIGN KEY ("branchId", "quizId") REFERENCES public."Quiz"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Quiz Quiz_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Quiz Quiz_branchId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_branchId_createdById_fkey" FOREIGN KEY ("branchId", "createdById") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Quiz Quiz_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Quiz Quiz_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ReceiptCounter ReceiptCounter_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReceiptCounter"
    ADD CONSTRAINT "ReceiptCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ReportRemark ReportRemark_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ReportRemark ReportRemark_branchId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES public."AcademicPeriod"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ReportRemark ReportRemark_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ReportRemark ReportRemark_updatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_branchId_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_branchId_sectionId_fkey" FOREIGN KEY ("branchId", "sectionId") REFERENCES public."Section"("branchId", id) ON UPDATE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_userId_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES public."Membership"("userId", "branchId") ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultAudit ResultAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: ResultAudit ResultAudit_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_approvedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_branchId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_periodId_fkey" FOREIGN KEY ("branchId", "periodId") REFERENCES public."AcademicPeriod"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_scaleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_scaleId_fkey" FOREIGN KEY ("branchId", "scaleId") REFERENCES public."GradeScale"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_schemeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_schemeId_fkey" FOREIGN KEY ("branchId", "schemeId") REFERENCES public."AssessmentScheme"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_studentId_fkey" FOREIGN KEY ("branchId", "studentId") REFERENCES public."StudentRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Result Result_enteredByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: Result Result_submittedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: Section Section_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Section"
    ADD CONSTRAINT "Section_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SettingApproval SettingApproval_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingApproval"
    ADD CONSTRAINT "SettingApproval_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SettingApproval SettingApproval_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingApproval"
    ADD CONSTRAINT "SettingApproval_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SettingApproval SettingApproval_deciderUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingApproval"
    ADD CONSTRAINT "SettingApproval_deciderUserId_fkey" FOREIGN KEY ("deciderUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SettingAudit SettingAudit_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingAudit"
    ADD CONSTRAINT "SettingAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SettingValue SettingValue_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingValue"
    ADD CONSTRAINT "SettingValue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffRecord StaffRecord_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffRecord StaffRecord_userId_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_userId_branchId_fkey" FOREIGN KEY ("userId", "branchId") REFERENCES public."Membership"("userId", "branchId") ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_branchId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."AcademicSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."StudentRecord"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StudentRecord StudentRecord_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_branchId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_branchId_classGroupId_fkey" FOREIGN KEY ("branchId", "classGroupId") REFERENCES public."ClassGroup"("branchId", id) ON UPDATE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE;

--
-- Name: Subject Subject_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subject"
    ADD CONSTRAINT "Subject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_branchId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_branchId_classArmId_fkey" FOREIGN KEY ("branchId", "classArmId") REFERENCES public."ClassArm"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_branchId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_branchId_staffRecordId_fkey" FOREIGN KEY ("branchId", "staffRecordId") REFERENCES public."StaffRecord"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_branchId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_branchId_subjectId_fkey" FOREIGN KEY ("branchId", "subjectId") REFERENCES public."Subject"("branchId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: VerificationPageConfig VerificationPageConfig_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VerificationPageConfig"
    ADD CONSTRAINT "VerificationPageConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public."Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

RESET check_function_bodies;
