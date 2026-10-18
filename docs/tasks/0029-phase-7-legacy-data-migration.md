# 0029: Phase 7 — Legacy Data Migration Tooling & Ingestion

- **Period / Focus:** 2026-10-18 (Phase 7 Data Migration & Cutover)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Antigravity Agent
- **Target Branch / PR:** `claude/task-0029-legacy-data-migration`
- **Started:** 2026-10-18 01:27:00 UTC
- **Ended:** 2026-10-18 01:38:00 UTC
- **Duration:** 11 mins

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Implement the Phase 7 legacy migration engine for AlEemaan to migrate students, classes, subjects, academic sessions, and historic results from the two English Firestore projects (`aleeman-primary` and `aleeman-school`) into PostgreSQL. Support dry-run validation, idempotent execution, reconciliation reporting, and unit test coverage.

## 2. Context & Related Docs
- Resolves open item in `docs/open-items.md`:
  - `Import of the legacy English-branch results and students (Phase 7). The Arabic branches start fresh.`
- Plan reference: `domain-implementation-plan.md` Phase 7, and `roadmap-breakdown.md` Phase 7.
- Legacy specifications: `docs/legacy-feature-inventory.md` §4, §5, §6.
- Target branches: `Primary (English)` and `Secondary (English)` (Arabic branches start from zero as decided 2026-10-13).

---

## 3. Work Breakdown

### Sub-phase A: Migration Architecture & Data Mappers
- [x] Implement pure transformation rules and mappers (`src/lib/migration/legacy-mapper.ts`).
- [x] Map Firestore student documents to `Student` and `StudentEnrollment` records.
- [x] Map class names to `ClassGroup` and `ClassArm` (defaulting arm to "Main" when unspecified).
- [x] Map subject rows to `Subject` and `SubjectOffering`.
- [x] Map historic test and exam scores to `Result`, `ReportRemark`, and assessment snapshots.

### Sub-phase B: CLI Ingestion Engine
- [x] Implement executable migration script (`scripts/migrate-legacy-firestore.mjs`).
- [x] Support `--dry-run` flag with detailed reconciliation reporting (record counts, duplicate checks, score distribution).
- [x] Support `--live` execution wrapped in database transactions with audit logging.
- [x] Support JSON dump files or direct Firestore export payload ingestion.

### Sub-phase C: Verification & Quality Gates
- [x] Unit tests for data transformation, score validation, and conflict resolution (`tests/unit/legacy-migration.spec.ts`).
- [x] Typecheck clean (`tsc --noEmit`).
- [x] Lint & format check clean (`pnpm lint && pnpm format:check`).
- [x] Task check validation (`pnpm tasks:check`).
