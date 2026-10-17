# [0025]: Slice P7 — Next-Term Student Promotion & Academic Rollover

- **Period / Focus:** AlEemaan Roadmap Slice P7 (Next-Term Bulk Promotion, Session Averages Calculation, Enrollment Transitions, Class Progression, Administrative Review & Override Console)
- **Status:** [x] Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** [PR #51](https://github.com/roji-tech/AlEemaan/pull/51) (`claude/p7-student-promotion` -> `dev`)
- **Started:** 2026-10-17 06:00:00 UTC
- **Ended:** 2026-10-17 15:30:00 UTC
- **Duration:** 9h 30m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver **Slice P7: Next-Term Student Promotion & Academic Rollover** for AlEemaan, adapting the legacy golden promotion rules into the modernized single-tenant multi-branch architecture:
1. **Legacy Golden Promotion Rule:** Promotion is gated to the final term of an academic session (3rd Term for English branches, 2nd Term for Arabic branches). Overall session average is computed across all published terms for the session. Students with overall session average ≥ 50.0% (configurable threshold) qualify for promotion; students with < 50.0% repeat.
2. **Class Progression Engine:** Progression rungs determined by `ClassGroup.sortOrder`. Promoted students advance to the next active `ClassGroup` in the branch. Terminal classes (e.g. SSS 3, or highest primary class in standalone primary branches) transition students to `ALUMNI` (graduation).
3. **Enrollment Lifecycle Management:** Atomically close the source `StudentEnrollment` (`PROMOTED`, `REPEATED`, `ALUMNI`) and open active `StudentEnrollment` records in the target academic session and class arm. Fully idempotent against repeat executions.
4. **Administrative Review & Override Console:** Interactive preview screen calculating per-term averages, overall average, and recommended action with granular administrator manual overrides (condone, hold back, reassign arm) and reasoning.
5. **Auditing & Batch Tracking:** Explicit `PromotionBatch` and `PromotionRecord` audit log tracking execution timestamp, actor, criteria, previous and new enrollment states.
6. **Accessible UI Console:** WCAG 2.2 AA compliant promotion wizard integrated into `/academics` with dark/light mode semantic tokens.

---

## 2. Work Breakdown

### Sub-phase A: Data Architecture & Schema
- [x] Add `PromotionBatch` and `PromotionRecord` models with enums (`PromotionDecision`, `PromotionBatchStatus`, `DecisionMode`) in `prisma/schema/promotion.prisma`.
- [x] Connect relations with `Branch`, `AcademicSession`, `ClassGroup`, `StudentRecord`, `StudentEnrollment`, and `User`.
- [x] Generate and apply additive migration `20261017140000_p7_student_promotion` to both development and `aleemaan_test` databases.
- [x] Verify database schema generation (`pnpm prisma generate`).

### Sub-phase B: Pure Rules & Computation Engine
- [x] Implement `src/lib/promotion/rules.ts`:
  - `computeStudentSessionAverage(termAverages: number[]): number`
  - `evaluatePromotionRecommendation(overallAverage: number | null, isTerminalClass: boolean, passMark: number): PromotionDecision`
  - `resolveNextClassGroup(currentClass: ClassGroup, allClasses: ClassGroup[]): ClassProgressionResult`
  - `resolveTargetArm(sourceArmName: string | null, targetArms: ClassArm[]): ClassArm | null`
  - `validateSessionPromotionEligibility(periods: AcademicPeriod[]): { eligible: boolean; reason?: string }`
- [x] Implement Zod schemas in `src/lib/promotion/validation.ts`.
- [x] Unit tests in `tests/unit/promotion-rules.spec.ts` (19/19 passing).

### Sub-phase C: Services & REST API Endpoints
- [x] Implement `src/lib/promotion/service.ts`:
  - `previewPromotion(input)`: Calculate students, term scores, averages, recommendations, arm resolutions.
  - `executePromotion(input, actorId)`: Idempotently close source enrollments, create target enrollments, log audit batch and records in a single atomic transaction.
  - `listPromotionBatches(branchId)`: Query history of promotion runs.
  - `getPromotionBatch(branchId, batchId)`: Detailed breakdown of a specific batch and student records.
- [x] Implement REST endpoints under `src/app/api/v1/academics/promotion/`:
  - `GET /api/v1/academics/promotion/preview`
  - `POST /api/v1/academics/promotion/preview`
  - `POST /api/v1/academics/promotion/execute`
  - `GET /api/v1/academics/promotion/batches`
  - `GET /api/v1/academics/promotion/batches/[id]`
- [x] Register routes in `tests/unit/route-role-guard.spec.ts` (7/7 passing).
- [x] Integration tests in `tests/api/promotion.spec.ts` (2/2 passing).

### Sub-phase D: UI Consoles & Accessibility
- [x] Implement promotion wizard components in `src/components/academics/promotion/`:
  - `PromotionConsole.tsx` (Session & Class picker, step-based workflow, audit sub-tabs)
  - `PromotionPreviewTable.tsx` (Per-term scores, overall average, recommendation badge, override dropdowns)
  - `PromotionConfirmModal.tsx` (Summary metrics, impact warning, confirm action)
  - `PromotionHistoryView.tsx` (Audit logs of past promotions with detail drawer)
- [x] Add "Promotion & rollover" tab into `/academics` tab bar in `src/components/academics/AcademicsSections.tsx`.
- [x] Accessibility: full keyboard navigation, screen reader announcements, Axe WCAG 2.2 AA testing with semantic tokens.
- [x] E2E tests in `tests/e2e/promotion-a11y.spec.ts` (3/3 passing across desktop & mobile).

### Sub-phase E: Quality Gates & Handover
- [x] `pnpm typecheck` (0 errors).
- [x] `pnpm exec eslint` (0 errors, 0 warnings across all promotion files).
- [x] `pnpm test:unit` (299/299 passing tests).
- [x] `pnpm playwright test tests/api/promotion.spec.ts` (100% passing).
- [x] `pnpm playwright test tests/e2e/promotion-a11y.spec.ts` (100% passing WCAG 2.2 AA).
- [x] Update documentation (`current-tasks.md`, `HANDOVER.md`, `open-items.md`, `roadmap-breakdown.md`, `aleemaan_progress.md`).
- [x] `pnpm tasks:check` (100% green alignment).
