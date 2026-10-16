# [0021]: Slice P3 — Timetable Canvas & Announcements Broadcast

- **Period / Focus:** AlEemaan Roadmap Slice P3 (Timetable Scheduling, Clash Detection, Announcements Feed & Broadcasts)
- **Status:** [x] Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** `claude/p3-timetable-announcements` -> `dev`
- **Started:** 2026-10-16 16:30:00 UTC
- **Ended:** 2026-10-16 20:30:00 UTC
- **Duration:** ~4 hours

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver **Slice P3: Timetable Canvas & Announcements Broadcast** for AlEemaan. This provides:
1. **Interactive Timetable Canvas:** Multi-day weekly timetable grid per class arm with real-time clash detection preventing teacher double-booking, class-arm time overlap, and room conflicts. Includes bulk batch scheduling.
2. **Multi-Audience Announcements Broadcast:** Role-targeted, branch-scoped, or class-arm-targeted announcements with draft/published/archived states, pinning, and expiration windows.

---

## 2. Context & Design Decisions

- **Multi-Branch Isolation:**
  - `TimetableSlot` carries `branchId` with composite foreign keys on `(branchId, classArmId)`, `(branchId, subjectId)`, and `(branchId, staffRecordId)`.
  - `Announcement` can be branch-scoped (`branchId != null`) or school-wide (`branchId == null` authored by superadmins).
- **Clash Detection Rules:**
  - Time intervals are half-open `[startTime, endTime)`.
  - Three distinct clash categories:
    - `TEACHER_CLASH`: Same teacher scheduled at overlapping times on the same day.
    - `CLASS_ARM_CLASH`: Same class arm scheduled for two subjects simultaneously.
    - `ROOM_CLASH`: Same room booked for multiple classes at the same time.
- **Audience Targeting:**
  - Role targeting array `Role[]` (empty = everyone).
  - Branch scoping (`branchId` null = all branches).
  - Class arm scoping (`classArmId` null = all classes in branch).
- **Access Control:**
  - Viewers can read published announcements targeting their role, branch, and class arm.
  - Teachers can view schedules and announcements for their branches.
  - Admins can manage branch schedules and broadcasts; Superadmins can broadcast school-wide.

---

## 3. Work Breakdown

- [x] **Sub-phase A: Data Architecture & Schema**
  - [x] Create `prisma/schema/timetable.prisma` with `TimetableSlot`
  - [x] Create `prisma/schema/announcements.prisma` with `Announcement` and `AnnouncementStatus`
  - [x] Update `branch.prisma`, `academics.prisma`, and `auth.prisma` with reciprocal relations
  - [x] Run `pnpm prisma generate`

- [x] **Sub-phase B: Database Migrations**
  - [x] Create additive migration SQL `prisma/migrations/20261026100000_p3_timetable_and_announcements/migration.sql`
  - [x] Run `pnpm exec prisma migrate deploy`

- [x] **Sub-phase C: Pure Domain Rules & Validation**
  - [x] `src/lib/timetable/rules.ts` (time math, overlap detection, slot clashes, batch clashes, grouping)
  - [x] `src/lib/announcements/rules.ts` (active window, audience matching, visibility, sorting)
  - [x] Validation schemas with Zod

- [x] **Sub-phase D: Services & API Endpoints**
  - [x] `src/lib/timetable/service.ts` & `src/app/api/v1/timetable/route.ts` (GET, POST, batch)
  - [x] `src/app/api/v1/timetable/[id]/route.ts` (PATCH, DELETE)
  - [x] `src/lib/announcements/service.ts` & `src/app/api/v1/announcements/route.ts` (GET, POST)
  - [x] `src/app/api/v1/announcements/[id]/route.ts` (GET, PATCH, DELETE)

- [x] **Sub-phase E: UI Consoles & Accessibility**
  - [x] Build `TimetableCanvas` grid component & `SlotEditModal`
  - [x] Build `AnnouncementsFeed` & `AnnouncementComposerModal`
  - [x] Wire `/timetable` and `/announcements` app pages & AppShell navigation
  - [x] WCAG 2.2 AA compliant contrast and ARIA attributes

- [x] **Sub-phase F: Testing & Quality Gates**
  - [x] Unit tests for timetable rules and clash detection
  - [x] Unit tests for announcements audience matching
  - [x] API integration tests
  - [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm tasks:check` verification
