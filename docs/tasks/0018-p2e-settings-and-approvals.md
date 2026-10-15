# [0018]: Slice P2e — Settings + Approvals Layer, CA/Exam Scheme Hierarchy, Report-Card Layouts, Verification Fields, Self-Approval Toggle

- **Period / Focus:** 2026-10-15 (design: plan `docs/development-history/domain-implementation-plan.md` "Build design — Slice P2e", superseding flat schemes)
- **Status:** [~] In Progress - Design confirmed by maintainer and committed; build ready
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2e-settings-approvals` -> `dev`
- **Started:** 2026-10-15 UTC
- **Ended:** -
- **Duration:** -

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
- [ ] Schema & migration (additive):
  - Shared approval infrastructure: `SettingValue`, `SettingScope` (`GLOBAL`, `BRANCH`), `SettingStatus` (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), `SettingApproval`, and `SettingAudit`.
  - Multi-scope schemes: `AssessmentSchemeScope` (global, branch, class-group), `AssessmentSchemeDraft` (teacher pending/draft schemes).
- [ ] Pure rules in `lib/academics/scoring.ts` & `lib/settings/approvals.ts`:
  - `resolveEffectiveScheme(branchId, classGroupId?, teacherId?, subjectId?)`: walks hierarchy in order: teacher's subject scheme > class-group scheme > branch default > global default.
  - Parts sum validation: `sum(caParts) + exam === 100`.
  - Part rules: minimum 1 CA part + exactly 1 Exam part (parts are non-optional; default names: "CA", "Project", "Exam"). Part names optional up to 64 chars.
  - Immutability guarantee: `lockScheme` preserved. Results snapshot resolved scheme at entry time.
- [ ] API Endpoints:
  - Global schemes: `GET/POST /api/v1/academics/schemes/global`
  - Class-group schemes: `GET/POST/PATCH /api/v1/academics/schemes/class-group/[id]`
  - Teacher subject schemes: `GET/POST/PATCH /api/v1/academics/schemes/teacher/[id]`
  - Approval workflow: `GET/PATCH /api/v1/settings/approval/[id]` (approve/reject with reason)
  - Result-sheet publishing guard: check that result's snapshot scheme is not in `PENDING` or `REJECTED` status.

### Sub-item B: Report-Card Layouts
- [ ] Schema & migration:
  - Add `ReportCardLayout` definition and options JSONB (`logo: boolean`, `signatureLine: boolean`, `nextTermDate: boolean`, `legacy: boolean`).
  - Branch layout setting mapping via `BranchSetting`.
- [ ] UI & Rendering:
  - Implement fixed coded layouts: `StandardLayout` (current built) and `LegacyLayout` (tagged `legacy = true`, awaiting legacy PDF/photo sample).
  - Branch admin layout selector with preview of toggleable options.

### Sub-item C: Self-Approval Toggle per Administrator
- [ ] Schema & migration:
  - Add `AdminSelfApprovalGrant` (table linking `branchId`, `adminUserId`, `grantedBySuperadminId`, `unseenReviewerUserId?`, `grantedAt`).
- [ ] Workflow integration in `lib/academics/results-workflow.ts`:
  - Replace hard-coded superadmin check with lookup in `AdminSelfApprovalGrant`.
  - If grant exists, admin may self-approve; if absent, only superadmin (or assigned unseen reviewer) may approve.
  - API responses ensure unseen reviewer identity is completely redacted from non-superadmin actors.

### Sub-item D: Configurable Public Verification Fields
- [ ] Schema & migration:
  - Add `VerificationPageConfig` table (`branchId?`, `showPupilName`, `pupilNameFormat` [FULL, FIRST_LAST_INITIAL, INITIALS], `showSubject`, `showMarks`, `showGrade`).
- [ ] Verification service & route:
  - Update `GET /api/v1/verify/[token]` and `/verify/[token]` page.
  - Guarantee bare minimum fields always rendered: school, branch, class, term, publish date, "valid".
  - Conditionally render extra fields based on resolved branch configuration.
  - Change existing test pinning exact fields to assert "minimum + configured fields".

---

## 4. Verification & Testing

- [ ] **Unit tests:**
  - Scope resolution hierarchy logic (teacher subject > class-group > branch default > global default).
  - Validation: 100-point total constraint; part requirement (≥1 CA, 1 Exam).
  - Self-approval grant verification and unseen reviewer confidentiality.
  - Public verification config fallback (branch-specific > global > minimum).
- [ ] **Integration tests:**
  - Full setting approval lifecycle: DRAFT → PENDING → APPROVED / REJECTED.
  - Result entry under pending scheme allowed; publish blocked until approval.
  - Rejection retains teacher draft; no data loss.
- [ ] **API tests:**
  - Permissions matrix for global vs branch vs teacher schemes.
  - Teacher cannot approve their own scheme.
  - Superadmin enforcement blocks unapproved branch overrides.
- [ ] **E2E tests:**
  - Report card rendering across layouts in light and dark themes.
  - Public verification page displaying minimum vs configured fields with accessibility checks.

---

## 5. Deployment & Run Order

1. Migration: Apply additive migrations for `Setting*`, `AssessmentSchemeScope`, `AdminSelfApprovalGrant`, and `VerificationPageConfig`.
2. Existing branch default schemes automatically backfill into `AssessmentSchemeScope` with scope `BRANCH`.
3. Code deployment: Deploy P2e routes, services, and UI components.
