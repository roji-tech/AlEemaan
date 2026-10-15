# [0019]: Attendance Permissions — Arm-Scoped Teacher Roles & Explicit Grants with Deploy Backfill

- **Period / Focus:** Scheduled directly after Slice P2e (plan `docs/development-history/domain-implementation-plan.md` "P2e sub-item E — Attendance permissions")
- **Status:** Upcoming (Design confirmed by maintainer 2026-10-15; build scheduled after P2e)
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/aleemaan-attendance-permissions` -> `dev`
- **Started:** —
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Restrict attendance roll-call reading and marking in AlEemaan from "any teacher in the branch" to strictly authorized personnel: (1) the designated class/form teacher of that arm, (2) staff explicitly granted permission by a branch admin or superadmin, and (3) administrators. Includes a mandatory zero-downtime deploy backfill mapping current teaching assignments to starting grants so no teacher loses access upon deployment.

---

## 2. Context & Maintainer Decisions (2026-10-15)

- **Who may take attendance for an arm:**
  1. The **class/form teacher** of that arm (teaching or non-teaching staff).
  2. Anyone given an **explicit attendance grant** by a branch admin or superadmin for named arms or groups of arms (even outside their own class).
  3. Admins and superadmins always may.
  4. Everyone else is refused with HTTP 403.
- **Deploy rule:** On deployment, each teacher's currently assigned arms (from `TeachingAssignment`) are automatically backfilled as starting grants, guaranteeing seamless continuity.
- **Scope limitation:** AlEemaan only; Octalve Edu maintains its own existing teacher-arm and campus scoping rules.

---

## 3. Work Breakdown

- [ ] Schema & migration (additive):
  - Add `ClassArm.classTeacherId` (nullable FK → `StaffRecord.id`).
  - Add table `AttendanceGrant`:
    - `id`, `branchId`, `staffRecordId`, `classArmId`, `grantedByUserId`, `grantedAt`.
    - Composite unique index on `(branchId, staffRecordId, classArmId)`.
  - Migration script / deploy task: backfill starting grants for all active `TeachingAssignment` pairs.
- [ ] Domain Service & Access Control (`lib/attendance/access.ts`):
  - Update `checkArmAttendanceAccess(branchId, userId, classArmId)`:
    - Superadmin / Branch Admin → allow.
    - Class teacher of the arm → allow.
    - Explicit `AttendanceGrant` holder → allow.
    - Otherwise → throw `ForbiddenError`.
  - Update `listAvailableAttendanceArms(branchId, userId)`:
    - Return arms caller is authorized to view or mark.
- [ ] API Endpoints:
  - Update `GET /api/v1/academics/attendance/arms`: return only authorized arms with grant type (`CLASS_TEACHER`, `EXPLICIT_GRANT`, `ADMIN`).
  - Guard `POST /api/v1/academics/attendance`: reject unauthorized submitters with 403.
  - New Admin management routes:
    - `GET/POST /api/v1/academics/attendance/grants`: list and create explicit grants.
    - `DELETE /api/v1/academics/attendance/grants/[id]`: revoke an explicit grant.
    - `PATCH /api/v1/academics/arms/[id]/class-teacher`: assign arm's form teacher.
- [ ] UI Components:
  - Attendance touch grid: display arm assignment badge (e.g., "Class Teacher", "Granted Arm").
  - Attendance management panel: grant allocation dialog for administrators.

---

## 4. Verification & Testing

- [ ] **Unit tests:**
  - Access resolution matrix (class teacher, granted non-class teacher, unassigned teacher, admin).
  - Cross-branch grant refusal (grant cannot cross branch boundary).
- [ ] **Integration tests:**
  - Deploy backfill idempotency test (running backfill multiple times preserves state without duplicates).
  - Class teacher reassignment instantly updates roll-call permission.
  - Grant revocation instantly revokes roll-call write ability.
- [ ] **API tests:**
  - `POST /api/v1/academics/attendance` returns 403 for unauthorized teachers.
  - `GET /api/v1/academics/attendance/arms` filters list accurately by user context.
- [ ] **E2E tests:**
  - Teacher sign-in journey: verified seeing only granted/assigned arms.
  - Roll-call submission flow under explicit grant.
