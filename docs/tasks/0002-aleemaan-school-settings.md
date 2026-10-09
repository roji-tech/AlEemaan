# [0002]: Phase 0.5.2 — School Settings & Academic Structure Foundation

- **Period / Focus:** 2026-10-09 (Phase 0.5.2 Milestone)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/0.5.2-school-settings`
- **Started:** 2026-10-09 10:42:00 UTC
- **Ended:** 2026-10-09 11:18:00 UTC
- **Duration:** 36m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Implement the School Settings domain and the Academic Structure foundation (Academic Sessions & Terms) in AlEemaan, adapting Octalve Edu's canonical design for AlEemaan's single-school 4-branch architecture (accounting for 3-term English and 2-term Arabic calendars).

## 2. Context & Related Docs
- Plan: `docs/development-history/domain-implementation-plan.md` §0.5.2 and §Roadmap Phase 1.
- ADR-0001: Single school branches are not tenants.
- ADR-0003: Live data safety (migrations are additive).
- ADR-0004: Octalve auth is canonical; constants are not shared.
- Canonical Reference: Octalve Edu `prisma/schema/settings.prisma` & `academics.prisma`.

---

## 3. Work Breakdown

### Module A: Prisma Schema & Migrations
- [x] Create `prisma/schema/settings.prisma` with `SchoolSettings` (global row `id: "global"`).
- [x] Create `prisma/schema/academics.prisma` with `AcademicSession`, `AcademicPeriod`, `SessionStatus`, and `PeriodKind`.
- [x] Add `sessions` and `periods` relations to `Branch` in `prisma/schema/branch.prisma`.
- [x] Run additive Prisma migration and update Prisma Client (`20261009104512_school_settings_and_academics`).
- [x] Seed default `SchoolSettings` row if not present (handled automatically via upsert).

### Module B: Services & Domain Logic
- [x] `src/lib/settings/school-settings.ts`: `getSchoolSettings()`, `updateSchoolSettings()` with validation (Zod).
- [x] `src/lib/academics/sessions.ts`:
  - List sessions per branch.
  - Create session with automatic default periods (3 terms for English branches, 2 terms for Arabic branches).
  - Activate / Close session workflow.
  - Set current term/period within an active session.

### Module C: API Routes
- [x] `GET /api/v1/settings/school` — Read school settings (authenticated staff/admin).
- [x] `PATCH /api/v1/settings/school` — Update school settings (ADMIN only, audit logged).
- [x] `GET /api/v1/academics/sessions` — List sessions by branchId (authenticated staff/admin).
- [x] `POST /api/v1/academics/sessions` — Create session & periods (ADMIN only, audit logged).
- [x] `GET /api/v1/academics/sessions/[id]` — Session detail with periods.
- [x] `PATCH /api/v1/academics/sessions/[id]` — Edit / activate / close session (ADMIN only).
- [x] `PATCH /api/v1/academics/periods/[id]` — Set period as current term (ADMIN only).

### Module D: UI / Admin Management
- [x] Settings Page (`/settings`):
  - Enabled `/settings` route in `src/components/shell/nav.ts`.
  - School Info card (Name, Principal, Phone, Motto, Address, Email, Website) with inline saving.
  - Academic Sessions card & filter with creation dialog and "Set Current Term" action.

### Module E: Verification & Quality Gates
- [x] Unit & API tests covering school settings and academic sessions (`tests/api/school-settings-and-academics.spec.ts` - 13/13 passed).
- [x] `pnpm typecheck` clean (0 errors).
- [x] `pnpm lint` clean (0 errors, 0 warnings).
- [x] Prettier format clean (100% compliant).
- [x] `pnpm build` clean (29/29 routes compiled).

---

## 4. Notes & Findings
- Arabic branches run 2 terms, English branches run 3 terms.
- `SchoolSettings` always returns a valid record (defaults on first read if missing).
- Audit logs capture `SCHOOL_SETTINGS_UPDATED`, `ACADEMIC_SESSION_CREATED`, `ACADEMIC_SESSION_UPDATED`, and `ACADEMIC_PERIOD_SET_CURRENT`.
