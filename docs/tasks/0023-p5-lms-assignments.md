# [0023]: Slice P5 — Learning Management System (LMS) & Assignments

- **Period / Focus:** AlEemaan Roadmap Slice P5 (Course Materials, Class Assignments, Student Submissions, Speed Grading & Quizzes)
- **Status:** [x] Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** `claude/p5-lms-assignments` -> `dev`
- **Started:** 2026-10-17 00:30:00 UTC
- **Ended:** 2026-10-17 01:25:00 UTC
- **Duration:** ~55 mins

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver **Slice P5: Learning Management System (LMS) & Assignments** for AlEemaan, adapting Phase 4 from Octalve Edu to AlEemaan's single-tenant multi-branch architecture:
1. **Assignments Management:** Branch-scoped assignments per subject, class group, or arm with instructions, deadlines, attachments, and late submission rules.
2. **Student Submission Workflow:** Work submission with text content and document attachments, recording submission timestamps and auto-flagging late submissions.
3. **Speed Grader Console:** Teacher grading interface with score assignment, rubric feedback, and status transitions (`SUBMITTED` -> `GRADED` or `RESUBMIT_REQUESTED`).
4. **Learning Materials Library:** Subject-linked course notes, syllabus modules, and downloadable study guides.
5. **Interactive Online Quizzes:** Timed multiple-choice and true/false assessments with automated score computation and instant feedback.

---

## 2. Context & Design Decisions

- **Multi-Branch Isolation (ADR 0015):**
  - All LMS models (`Assignment`, `AssignmentSubmission`, `LearningMaterial`, `Quiz`, `QuizQuestion`, `QuizAttempt`) enforce `branchId`.
  - Composite foreign keys guarantee referential integrity with `Subject`, `ClassGroup`, `ClassArm`, `StudentRecord`, and `StaffRecord`:
    - `[branchId, subjectId]` references `Subject(branchId, id)`
    - `[branchId, classGroupId]` references `ClassGroup(branchId, id)`
    - `[branchId, classArmId]` references `ClassArm(branchId, id)`
    - `[branchId, studentId]` references `StudentRecord(branchId, id)`
    - `[branchId, createdById]` references `StaffRecord(branchId, id)`
- **Permissions Matrix:**
  - `SUPER_ADMIN` & branch `ADMIN`: Manage all LMS entities within authorized branch scope.
  - `TEACHING_STAFF`: Create assignments/materials/quizzes for assigned subjects/arms, review submissions, grade student work.
  - `STUDENT`: View published assignments and materials for enrolled class/arm, submit assignments, attempt quizzes.
- **Pure Rules & Grading Lifecycle:**
  - Automated detection of `LATE` submissions if `allowLate` is true and `now > dueDate`.
  - Rejection of submissions if `allowLate` is false and past due date.
  - Automated quiz scoring based on question point weights.

---

## 3. Work Breakdown

- [x] **Sub-phase A: Data Architecture & Schema**
  - [x] Create `prisma/schema/lms.prisma` (`Assignment`, `AssignmentSubmission`, `LearningMaterial`, `Quiz`, `QuizQuestion`, `QuizAttempt`, enums)
  - [x] Add reciprocal relations in `branch.prisma`, `academics.prisma`, `staff.prisma`, and `students.prisma`
  - [x] Generate and deploy migration `prisma/migrations/20261017100000_p5_lms_and_assignments/migration.sql`
  - [x] Run `pnpm prisma generate`

- [x] **Sub-phase B: Pure Rules & Computation Engine**
  - [x] `src/lib/lms/rules.ts` (submission status resolution, late penalty calculation, quiz score computation)
  - [x] `src/lib/lms/validation.ts` (Zod validation schemas for assignments, submissions, grading, materials, quizzes)
  - [x] Unit tests for LMS rules (`tests/unit/lms-rules.spec.ts`)

- [x] **Sub-phase C: Services & API Endpoints**
  - [x] `src/lib/lms/service.ts` (LMS service layer with branch scoping and role validation)
  - [x] `/api/v1/lms/assignments` (GET, POST) & `[id]` (GET, PATCH, DELETE)
  - [x] `/api/v1/lms/assignments/[id]/submissions` (GET, POST) & `[subId]/grade` (PATCH)
  - [x] `/api/v1/lms/materials` (GET, POST) & `[id]` (GET, PATCH, DELETE)
  - [x] `/api/v1/lms/quizzes` (GET, POST) & `[id]` (GET, PATCH, DELETE) & `[id]/attempt` (POST)
  - [x] API integration tests (`tests/api/lms.spec.ts`)

- [x] **Sub-phase D: UI Consoles & Accessibility**
  - [x] Add LMS / Coursework to Navigation & Shell (`BookOpenIcon` in `nav.ts`)
  - [x] `src/components/lms/LmsPanel.tsx` (accessible tabbed navigation: Assignments, Materials, Quizzes)
  - [x] `src/components/lms/AssignmentsList.tsx` & `AssignmentModal.tsx`
  - [x] `src/components/lms/SpeedGraderModal.tsx` & `StudentSubmissionModal.tsx`
  - [x] `src/components/lms/MaterialsList.tsx` & `MaterialModal.tsx`
  - [x] `src/components/lms/QuizConsole.tsx` & `QuizModal.tsx`
  - [x] Dedicated `/lms` page with WCAG 2.2 AA compliant contrast
  - [x] E2E and accessibility test suite (`tests/e2e/lms-a11y.spec.ts`)

- [x] **Sub-phase E: Quality Gates & Handover**
  - [x] `pnpm typecheck` (0 errors)
  - [x] `pnpm lint` (0 errors, 0 warnings)
  - [x] Unit, API, and E2E test suites (100% green)
  - [x] Update `/docs` registers (`current-tasks.md`, `HANDOVER.md`, `open-items.md`)
  - [x] Run `pnpm tasks:check` (100% green alignment)
  - [x] Push branch `claude/p5-lms-assignments` and open PR to `dev`
