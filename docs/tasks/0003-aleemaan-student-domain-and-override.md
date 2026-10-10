# [0003]: Student Domain & ADR-0014 Namesake Duplicate Override Port

- **Period / Focus:** 2026-10-09 (Student Management & Overrides Milestone)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/student-domain-and-override`
- **Started:** 2026-10-09 11:28:00 UTC
- **Ended:** 2026-10-09 14:55:00 UTC
- **Duration:** 3h 27m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Port the Student Domain and the audited namesake duplicate override mechanism (ADR-0014 from Octalve Edu / ADR-0011 in AlEemaan) into AlEemaan, providing robust student record management across branches, auto-generated admission numbers, per-session enrolments, CSV import with duplicate safety, and administrative duplicate override.

## 2. Context & Related Docs
- Canonical Reference: Octalve Edu `src/lib/people/students.ts`, `people.prisma`, and ADR-0014.
- AlEemaan ADR-0001: Single school branches are not tenants.
- AlEemaan ADR-0003: Live data safety (migrations are additive).
- AlEemaan ADR-0011: Audited override for namesake student registrations.
- Plan: `docs/development-history/domain-implementation-plan.md` Roadmap Phase 2.

---

## 3. Work Breakdown

### Module A: Prisma Schema & ADR-0011 Record
- [x] Create `prisma/schema/students.prisma` with `StudentRecord`, `Gender`, `EnrollmentStatus`, `StudentEnrollment`, and `AdmissionCounter`.
- [x] Update `prisma/schema/branch.prisma` and `prisma/schema/academics.prisma` with relation fields.
- [x] Create `docs/adr/0011-audited-override-for-namesake-student-registrations.md` (port of Octalve ADR-0014).
- [x] Run additive Prisma migration and regenerate Prisma Client.

### Module B: Services & Domain Logic
- [x] `src/lib/students/service.ts`:
  - Normalized name and date-of-birth validation.
  - Advisory locking for concurrency safety (`lockStudents`).
  - Admission number generation (`YYYY/NNNN`) via atomic `AdmissionCounter` increments.
  - Duplicate check by `(branchId, firstName, lastName, dateOfBirth)`.
  - Default: return `POSSIBLE_DUPLICATE` with existing admission number.
  - Override: `allowDuplicate: true` proceeds with creation/update, logging `duplicateOverridden: true` in `AuditLog` (zero PII logged).
  - Enrolment in current active session.
  - Archiving and restoring with namesake protection.
- [x] `src/lib/students/import.ts`:
  - CSV parsing and validation.
  - Per-row duplicate detection with batch override capability.

### Module C: API Routes
- [x] `GET /api/v1/students` — List students with branch, session, search, and status filters.
- [x] `POST /api/v1/students` — Create student with duplicate check & `allowDuplicate` override (ADMIN only).
- [x] `GET /api/v1/students/[id]` — Student detail with enrolment history.
- [x] `PATCH /api/v1/students/[id]` — Update student with duplicate check & `allowDuplicate` override (ADMIN only).
- [x] `POST /api/v1/students/[id]/restore` — Restore archived student with namesake check & override.
- [x] `POST /api/v1/students/import` — CSV batch import with duplicate validation.

### Module D: UI Components
- [ ] Student list & management view (deferred to Phase 2 SIS UI).
- [ ] Student form dialog with 409 `POSSIBLE_DUPLICATE` intercept, warning banner, and `CheckboxField` override (deferred to Phase 2 SIS UI).
- [ ] CSV import dialog with duplicate warning summaries (deferred to Phase 2 SIS UI).

### Module E: Verification & Quality Gates
- [x] API & Integration test suite covering duplicate checks, overrides, admission numbers, and audits.
- [x] `pnpm typecheck` clean (0 errors).
- [x] `pnpm lint` clean (0 errors, 0 warnings).
- [x] `pnpm format:check` clean.
- [x] `pnpm build` clean.
- [x] Full test execution passes with 0 failures (9/9 passed).

---

## 4. Notes & Findings
- AlEemaan is single-tenant: student admission numbers are generated globally per school year (`YYYY/NNNN`), while duplicate checks are scoped by branch (`branchId`).
- Zero PII in audit events: only record IDs, admission numbers, and override flags are logged.
