# [0018]: Slice P2e — Settings + Approvals Layer, CA/Exam Scheme Hierarchy, Report-Card Layouts, Verification Fields, Self-Approval Toggle

- **Period / Focus:** 2026-10-15 (design: plan `docs/development-history/domain-implementation-plan.md` "Build design — Slice P2e", superseding flat schemes)
- **Status:** [x] Completed (Design confirmed & implemented; test suites 31/31 passed green)
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2e-settings-approvals` -> `dev`
- **Started:** 2026-10-15 UTC
- **Ended:** 2026-10-15 UTC
- **Duration:** 1 day

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Establish the foundational multi-scope settings-and-approvals layer for AlEemaan, replacing the flat per-branch assessment scheme with a hierarchical resolution system (teacher subject > class-group > branch default > global default), adding multi-part CA/exam validation (parts must sum to exactly 100), fixed report-card layouts, superadmin-managed self-approval per administrator, and configurable public verification fields.

---

## 2. Context & Maintainer Decisions (2026-10-15)

1. **Unapproved-scheme marks:** May be entered and reviewed under a pending scheme, but **cannot be published** until the scheme is approved. If rejected, marks remain as drafts; the teacher must re-enter under an approved scheme.
2. **Parts total:** CA parts + exam **must sum to exactly 100**. A scheme that sums to anything else cannot be saved.
3. **Template sharing:** Drafts and templates are **private to the creator by default**, with an explicit option to share with the branch.
4. **Layouts:** A **fixed set of coded layouts** with configurable options (school logo, signature line, next-term date), not a free-form WYSIWYG editor. Legacy layouts are tagged `legacy = true`.
5. **Verification page minimum:** A bare minimum is always displayed (school, branch, class, term, publish date, "valid"). All additional fields (pupil name format, subject, marks, grade) are superadmin-configured per branch.
6. **Self-approval toggle:** **Only the superadmin can toggle self-approval, per admin.** The superadmin is the default approver; the superadmin may assign an unseen reviewer (invisible to the admin under review). Branch administrators cannot toggle self-approval for themselves.
7. **Attendance backfill:** Defer attendance permissions to a dedicated subsequent slice (Task 0019) with automated backfill of current teaching assignments so access is preserved seamlessly on deploy.

---

## 3. Work Breakdown

### Sub-item A: Shared Settings & Approvals Infrastructure + CA/Exam Scheme Hierarchy
- [x] Schema & migration (additive):
  - Shared approval infrastructure: `SettingValue`, `SettingScope` (`GLOBAL`, `BRANCH`), `SettingStatus` (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), `SettingApproval`, and `SettingAudit`.
  - Multi-scope schemes: `AssessmentSchemeScope` (global, branch, class-group), `AssessmentSchemeDraft` (teacher pending/draft schemes).
  - Additive migration `20261015090000_p2e_settings_and_approvals` applied to database.
- [x] Pure rules in `lib/academics/scoring.ts` & `lib/settings/approvals.ts`:
  - `resolveEffectiveScheme(branchId, classGroupId?, teacherId?, subjectId?)`: walks hierarchy in order: teacher's subject scheme > class-group scheme > branch default > global default.
  - Parts sum validation: `sum(caParts) + exam === 100` via `validateHierarchicalScheme`.
  - Part rules: minimum 1 CA part + exactly 1 Exam part (parts are non-optional; default names: "CA", "Project", "Exam"). Part names optional up to 64 chars.
  - Immutability guarantee: `lockScheme` preserved. Results snapshot resolved scheme at entry time.
  - Result-sheet publishing guard: check that result's snapshot scheme is not in `PENDING` or `REJECTED` status (integrated into `lib/academics/results-workflow.ts`).
  - Unit tests: `tests/unit/p2e-approvals-and-schemes.spec.ts` (10/10 passed).
  - Integration tests: `tests/integration/p2e-settings-and-approvals.spec.ts` (9/9 passed).
- [x] API Endpoints:
  - Global schemes: `GET/POST /api/v1/academics/schemes/global` (superadmin only)
  - Class-group schemes: `GET/POST/PATCH /api/v1/academics/schemes/class-group/[id]` (branch admin)
  - Teacher subject schemes: `GET/POST/PATCH /api/v1/academics/schemes/teacher/[id]` and `/api/v1/academics/schemes/teacher` (teacher drafts and approval submissions)
  - Approval workflow: `GET/PATCH /api/v1/settings/approval/[id]` and `/api/v1/settings/approval` (approve/reject with mandatory reason; self-approval prohibited)

### Sub-item B: Report-Card Layouts
- [x] Schema & migration:
  - Add `ReportCardLayout` definition and options JSONB (`logo: boolean`, `signatureLine: boolean`, `nextTermDate: boolean`, `legacy: boolean`).
  - Branch layout setting mapping via `SettingValue` (`key: "report_card_layout"`).
  - Layout endpoints: `GET/PATCH /api/v1/settings/layouts`.
- [x] UI & Rendering:
  - Implemented fixed coded layouts: `StandardLayout` (DEFAULT) and `LegacyLayout` (LEGACY).
  - Configurable options: signature lines for teacher/principal, next term resumption notice, and logo display.
  - Integrated into `getReportCard` and `ReportCard.tsx`.

### Sub-item C: Self-Approval Toggle per Administrator
- [x] Schema & migration:
  - Add `AdminSelfApprovalGrant` (table linking `branchId`, `adminUserId`, `grantedBySuperadminId`, `unseenReviewerUserId?`, `grantedAt`, `revokedAt`).
- [x] Workflow integration & endpoints:
  - `GET/POST/DELETE /api/v1/settings/self-approval` managed exclusively by superadmin.
  - Integrated with `canSelfApproveResults` in `lib/academics/results-workflow.ts`.
  - Unseen reviewer identity strictly redacted from branch admin responses.

### Sub-item D: Configurable Public Verification Fields
- [x] Schema & migration:
  - Add `VerificationPageConfig` table (`branchId?`, `showPupilName`, `pupilNameFormat` [FULL, FIRST_LAST_INITIAL, INITIALS], `showSubject`, `showMarks`, `showGrade`).
  - Configuration endpoints: `GET/PATCH /api/v1/settings/verification`.
- [x] Verification service & route:
  - Updated `GET /api/v1/verify/[token]` and `/verify/[token]` page.
  - Guaranteed bare minimum fields always rendered: school, branch, class, term, publish date, "valid".
  - Conditionally rendered extra fields based on resolved branch configuration (pupil name format, subject, marks, grade).
  - Existing verification test updated to assert minimum + configured fields.

---

## 4. Verification & Testing

- [x] **Unit tests:**
  - Validation: 100-point total constraint; part requirement (≥1 CA, 1 Exam) via `tests/unit/p2e-approvals-and-schemes.spec.ts` (10/10 passed).
  - Part rules: default names ("CA", "Project", "Exam"), duplicate detection, length bounds.
- [x] **Integration tests:**
  - Scope resolution hierarchy logic (teacher subject > class-group > branch default > global default) via `tests/integration/p2e-settings-and-approvals.spec.ts` (9/9 passed).
  - Full setting approval lifecycle: DRAFT → PENDING → APPROVED / REJECTED.
  - Result entry under pending scheme allowed; publish blocked until approval.
  - Self-approval grant verification and unseen reviewer confidentiality via `canSelfApproveResults`.
- [x] **API tests (`tests/api/p2e-settings-and-approvals-api.spec.ts`):**
  - Permissions matrix for global vs branch vs teacher schemes (superadmin required for global; admin for class-group; teacher for drafts).
  - Teacher cannot approve their own scheme.
  - Admin approval workflow creates live `AssessmentScheme` and `AssessmentSchemeScope`.
  - Rejection preserves draft in `REJECTED` status with reason, allowing re-editing and resubmission.
  - Superadmin grants/revokes self-approval with unseen reviewer confidentiality.
  - Verification configuration displays configured fields (name, marks, grade) on API and HTML page.
  - Report card layout listing, setting, and rendering options (signature lines, next term).
  - Full suite: 31/31 passed green.
- [ ] **E2E tests:**
  - Report card rendering across layouts in light and dark themes.
  - Public verification page displaying minimum vs configured fields with accessibility checks.

---

## 5. Deployment & Run Order

1. Migration: Apply additive migrations for `Setting*`, `AssessmentSchemeScope`, `AdminSelfApprovalGrant`, and `VerificationPageConfig`.
2. Existing branch default schemes automatically backfill into `AssessmentSchemeScope` with scope `BRANCH`.
3. Code deployment: Deploy P2e routes, services, and UI components.
