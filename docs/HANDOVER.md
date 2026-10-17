# AlEemaan — Project Status & Handover Documentation

> **Last Updated:** 2026-10-17 (Post-P7 implementation & verification)  
> **Scope:** AlEemaan School Management System (Single-Tenant, Multi-Branch Architecture)  
> **Repository:** `roji-tech/AlEemaan`  
> **Branch Context:** `claude/p7-student-promotion` (Target: `dev`)

---

## 1. Executive Summary & Architecture Overview

AlEemaan is a dedicated, single-tenant school management system built on Next.js, Prisma ORM, and PostgreSQL. It models a single educational institution operating across distinct physical branches (e.g., Primary, Secondary, Arabic branches).

### Key Architectural Tenets:
- **Tenant & Branch Isolation:** Unlike Octalve Edu's multi-tenant Row-Level Security (`app_user` with RLS policies), AlEemaan operates with application-level branch scoping using the `withBranch` combinator (ADR 0015). All academic and financial records enforce composite keys `(branchId, id)`.
- **Administrative Roles:**
  - `SUPER_ADMIN`: Cross-branch authority, manages global defaults, enforces system-wide policies, and is the sole authority permitted to grant or toggle self-approval for branch administrators.
  - `ADMIN`: Branch-scoped administrative authority.
  - `TEACHING_STAFF` / `NON_TEACHING_STAFF`: Staff records linked to branch memberships.
- **Audit Logging:** Single append-only `AuditLog` table capturing actor, action, diffs, and timestamp.

---

## 2. Milestone Alignment & Implementation Progress

### Completed Slices (Merged to `dev` Trunk)
| Milestone | Slice | Description | PR | Tests / Verification |
|---|---|---|---|---|
| 0001 | Phase 0.5.H | Users & Invitations Port | [PR #11](https://github.com/roji-tech/aleemaan/pull/11) | 811 tests passing |
| 0002 | Phase 0.5.2 | School Settings & Academic Sessions | [PR #13](https://github.com/roji-tech/AlEemaan/pull/13) | Passing |
| 0003 | Option 3 | Student Domain & Duplicate Override (ADR 0014) | [PR #14](https://github.com/roji-tech/AlEemaan/pull/14) | Passing |
| 0004 | Phase 1.3 | Attendance Domain & Touch Grid Port | [PR #15](https://github.com/roji-tech/AlEemaan/pull/15) | Passing |
| 0005 | — | Attendance Branch Scoping & Route-Role Guards | [PR #17](https://github.com/roji-tech/AlEemaan/pull/17) → #20 | Passing |
| 0006–0007 | S1–S8 | Branch Admins, Superadmins, & ADR 0014 acceptance | `claude/branch-admins-superadmins` | 1143 passing |
| 0008 | — | Input Hardening (ISS-0006, ISS-0007, ISS-0010) | `claude/hardening-iss-0006-0007` | 1149 passing |
| 0009 | — | Branch Combinator (`withBranch`, ADR 0015) | `claude/with-branch` | 1158 passing |
| 0010 | P1a | Classes, Arms, Subjects & Offerings | [PR #32](https://github.com/roji-tech/AlEemaan/pull/32) | 1164 passing |
| 0011 | P1b | Assessment Schemes & Grade Scales | [PR #34](https://github.com/roji-tech/AlEemaan/pull/34) | 1205 passing |
| 0012 | P1c | Staff Records & Teaching Assignments | [PR #35](https://github.com/roji-tech/AlEemaan/pull/35) | 1213 passing |
| 0013 | P1d | Academics Screens (Assessment, Grading, Staff) | [PR #36](https://github.com/roji-tech/AlEemaan/pull/36) | 1225 passing |
| 0014 | P2a | Results Tables, Entry & History | [PR #38](https://github.com/roji-tech/AlEemaan/pull/38) | 1242 passing |
| 0015 | P2b | Results Review Workflow (DRAFT → SUBMITTED → APPROVED → PUBLISHED → LOCKED) | [PR #39](https://github.com/roji-tech/AlEemaan/pull/39) | 1250 passing |
| 0016 | P2c | Report Cards, Remarks & Public Token Verification | [PR #40](https://github.com/roji-tech/AlEemaan/pull/40) | 1264 passing |
| 0017 | P2d | Results UI Screens (Entry Grid, Approval Console, ReportCardView, Print Styles) | [PR #41](https://github.com/roji-tech/AlEemaan/pull/41) | 1275 passing |
| 0018 | P2e | Settings + Approvals layer, CA schemes, report layouts, self-approval toggle | [PR #44](https://github.com/roji-tech/AlEemaan/pull/44) | Passing |
| 0019 | — | Attendance permissions (arm-scoped teacher role & grants with backfill) | [PR #45](https://github.com/roji-tech/AlEemaan/pull/45) | Passing |
| 0020 | — | PWA Foundation & Global Quick-Tools Dock | [PR #46](https://github.com/roji-tech/AlEemaan/pull/46) | Passing |
| 0021 | P3 | Timetable Canvas & Announcements Broadcast | [PR #47](https://github.com/roji-tech/AlEemaan/pull/47) | Passing (unit, API, E2E a11y) |
| 0022 | P4 | Finance & Fee Invoicing Foundation | [PR #48](https://github.com/roji-tech/AlEemaan/pull/48) (`claude/p4-finance-billing`) | Passing (unit 17/17, API 3/3, E2E a11y 5/5) |
| 0023 | P5 | Learning Management System (LMS) & Assignments | [PR #49](https://github.com/roji-tech/AlEemaan/pull/49) (`claude/p5-lms-assignments`) | Passing (unit 8/8, API 3/3, E2E a11y 5/5) |
| 0024 | P6 | Multi-Channel Messaging & Communication Engine | [PR #50](https://github.com/roji-tech/AlEemaan/pull/50) (`claude/p6-communication-messaging`) | Passing (unit 16/16, API 4/4, E2E a11y 3/3) |
| 0025 | P7 | Next-Term Student Promotion & Academic Rollover | [PR #51](https://github.com/roji-tech/AlEemaan/pull/51) (`claude/p7-student-promotion`) | Passing (unit 19/19, API 2/2, E2E a11y 3/3) |
| 0026 | P8 | Parent & Student Self-Service Portal | `claude/p8-parent-student-portal` | Passing (unit 14/14, API 11/11, E2E a11y 1/1) |

---

## 3. Active Work: Slice P2e — Settings + Approvals & Schemes

> **Design Status:** Confirmed with maintainer on 2026-10-15 and committed in `domain-implementation-plan.md`. Task specification recorded in `docs/tasks/0018-p2e-settings-and-approvals.md`.

### Core Architectural Decisions (Maintainer Confirmed 2026-10-15)
1. **Unified Settings & Approvals Engine:**
   - Single reusable mechanism carrying settings through `DRAFT` → `PENDING` → `APPROVED` → `REJECTED`.
   - Superadmin sets global defaults; branch admins can configure overrides.
   - If superadmin enables **enforcement**, branch admin overrides require superadmin approval with a stated reason.
   - Core tables: `SettingValue`, `SettingScope` (`GLOBAL`, `BRANCH`), `SettingStatus`, `SettingApproval`, and `SettingAudit`.
2. **CA / Exam Scheme Hierarchy:**
   - Resolution order (most specific first): `Teacher Subject Scheme` > `Class-Group Scheme` > `Branch Default` > `Global Default`.
   - **Parts validation:** Parts are **not optional** (minimum 1 CA part + exactly 1 Exam part). All parts must sum to **exactly 100**.
   - **Default part names:** `"CA"`, `"Project"`, and `"Exam"`. Part names may be customized up to 64 characters.
   - **Unapproved schemes:** A teacher may enter and review marks under a pending scheme, but marks **cannot be published** until approved. On rejection, marks stay in draft.
   - **Templates:** Private to creator by default, shareable to branch.
   - **Result immutability (`lockScheme`):** The first result locks the snapshot scheme; subsequent scheme updates apply only to future terms/arms.
3. **Report-Card Layouts:**
   - Fixed set of coded layouts (not a generic drag-and-drop editor).
   - Configurable options: school logo toggle, signature line toggle, next-term resumption date toggle.
   - Legacy layouts tagged with `legacy = true`.
4. **Self-Approval Control:**
   - **Superadmin-only toggle per admin.** Branch admins cannot enable self-approval for themselves.
   - Superadmin is default approver; superadmin can designate an unseen reviewer (hidden from the subject under review).
5. **Public Verification Page Configuration:**
   - Bare minimum always rendered: School, Branch, Class, Term, Publish Date, "Valid" status.
   - Configurable extra fields: pupil name format (full name, first name + last initial, initials), subjects, marks, grade.

---

## 4. Sequential Road Ahead

```
[Completed: P1a-P1d, P2a-P2d, P2e, Attendance, PWA, P3 Timetable, P4 Finance, P5 LMS, P6 Communication]
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Next-Term Student Promotion & Academic Rollover             │
│ OR Pre-Production Staging Verification & Release v0.6.0     │
│ OR Phase 6 Family / Student Self-Service Portal             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Production Database Migrations Register

The following 10 additive migrations have been applied and tested on development and test databases, but **must be executed against the live production database in exact order** prior to deploying corresponding code:

1. `20261011120000_super_admin_flag` (*Awaiting maintainer's `admins:list` review*)
2. `20261014090000_academic_structure` (Classes, arms, subjects, offerings)
3. `20261014100000_assessment_grading` (Assessment schemes, grade scales, lock triggers)
4. `20261014110000_staff_assignments` (Staff records, teaching assignments)
5. `20261014120000_results` (Result records, snapshot scheme, history)
6. `20261014130000_results_workflow` (Review state transitions, session-close lock trigger)
7. `20261014140000_report_remarks` (Report remarks per student-term)
8. `20261015100000_p2e_settings_and_approvals` (Setting values, scopes, approvals, and audits)
9. `20261015110000_attendance_permissions` (Attendance grants & class teacher assignment)
10. `20261016100000_p3_timetable_and_announcements` (Timetable slots & multi-audience announcements)
11. `20261016120000_p4_finance_and_billing` (Fee structures, invoices, payments, discounts, webhooks)
12. `20261017100000_p5_lms_and_assignments` (Assignments, submissions, learning materials, quizzes, questions, attempts)
13. `20261017120000_p6_communication_messaging` (Notification templates, dispatches, guardian link tokens, audit logs)
14. `20261017140000_p7_student_promotion` (Promotion batches, promotion records, promotion enums)

---

## 6. Actions Waiting on the Maintainer

1. **Live Administrator Review:** Run `pnpm admins:list` on the live AlEemaan database to confirm which accounts retain `SUPER_ADMIN` status before running migration `20261011120000_super_admin_flag`.
2. **Legacy Report Card Visual:** Provide a photo or PDF sample of the legacy report card to code the exact `LegacyLayout` (`legacy = true`).
3. **Approval of any `dev` -> `master` PR** and production deployment steps.
