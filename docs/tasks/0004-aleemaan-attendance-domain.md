# [0004]: Port Attendance Domain & Touch Grid (Phase 1.3 Adaptation)

- **Period / Focus:** 2026-10-09 (Attendance Domain Port)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/aleemaan-attendance`
- **Started:** 2026-10-09 22:00:00 UTC
- **Ended:** 2026-10-09 22:35:00 UTC
- **Duration:** 35 minutes

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Port the Attendance Domain from Octalve Edu into AlEemaan as a single-tenant, branch-scoped system: daily attendance tracking, pure status and edit-window rules, idempotent bulk roll-call API, individual student attendance history, and touch-optimised mobile roster grid (`min-h-11` tap targets, live KPI summaries, "Mark All Present" 1-tap action).

## 2. Context & Related Docs
- Canonical Reference: Octalve Edu Phase 1.3 (`AttendanceRecord`, `rules.ts`, `service.ts`, `AttendancePanel.tsx`).
- AlEemaan Architecture: Single school with four branches (no RLS, branch-scoped records, additive migrations).
- Live Data Safety: Additive migrations, zero PII in audit records.
- Edit Grace Period: 7-day edit window for teachers, unrestricted for admins, future dates strictly forbidden.

---

## 3. Work Breakdown

### Module A: Prisma Schema & Additive Migration
- [x] Create `prisma/schema/attendance.prisma` with `AttendanceRecord`, `AttendanceStatus`, and `AttendanceSource`.
- [x] Update `prisma/schema/branch.prisma` and `prisma/schema/students.prisma` with relation fields.
- [x] Create additive migration `20261009225500_attendance_domain` and apply to `aleemaan` and `aleemaan_test`.
- [x] Regenerate Prisma Client.

### Module B: Pure Rules & Attendance Service
- [x] `src/lib/attendance/rules.ts`: Pure functions for ISO date checks, 7-day edit grace period, summary counters.
- [x] `src/lib/attendance/http.ts`: Zod schemas for roll-call submission and validation.
- [x] `src/lib/attendance/service.ts`:
  - `getBranchRollCall`: Roster retrieval with active enrolment and existing attendance overlay.
  - `markBranchAttendance`: Idempotent bulk upsert with transaction safety.
  - `getStudentAttendanceHistory`: Individual student history and attendance rate.

### Module C: API Endpoints
- [x] `GET /api/v1/attendance` — Roll-call roster for branch, class, and date.
- [x] `POST /api/v1/attendance` — Bulk mark attendance with 7-day window enforcement.
- [x] `GET /api/v1/students/[id]/attendance` — Student individual attendance history.

### Module D: UI Components & Verification
- [x] `src/components/attendance/AttendancePanel.tsx` — Touch grid with KPI metrics and quick actions.
- [x] Full automated test suite (unit + API tests).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean.
- [x] Complete task record and commit.
