# AlEemaan — Project Status & Handover Documentation

> **Last Updated:** 2026-10-18 (Post-Task 0030 Extended Staff HR Fields & Migrations)  
> **Scope:** AlEemaan School Management System (Single-Tenant, Multi-Branch Architecture)  
> **Repository:** `roji-tech/AlEemaan`  
> **Active Branch:** `dev` (Synchronized with `master`)

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

### Completed Slices (Merged to `dev` & `master` Trunks)
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
| 0021 | P3 | Timetable Canvas & Announcements Broadcast | [PR #47](https://github.com/roji-tech/AlEemaan/pull/47) | Passing |
| 0022 | P4 | Finance & Fee Invoicing Foundation with Paystack | [PR #48](https://github.com/roji-tech/AlEemaan/pull/48) | Passing |
| 0023 | P5 | Learning Management System (LMS) & Assignments | [PR #49](https://github.com/roji-tech/AlEemaan/pull/49) | Passing |
| 0024 | P6 | Multi-Channel Messaging & Communication Engine | [PR #50](https://github.com/roji-tech/AlEemaan/pull/50) | Passing |
| 0025 | P7 | Next-Term Student Promotion & Academic Rollover | [PR #51](https://github.com/roji-tech/AlEemaan/pull/51) | Passing |
| 0026 | P8 | Parent & Student Self-Service Portal | [PR #52](https://github.com/roji-tech/AlEemaan/pull/52) | Passing |
| 0027 | — | UI History Dialog in Review Tab & Results Branch Sync | [PR #55](https://github.com/roji-tech/AlEemaan/pull/55) | Passing |
| 0028 | — | Report Card Payment Gate & Standalone Document Export | [PR #56](https://github.com/roji-tech/AlEemaan/pull/56) | Passing |
| 0029 | Phase 7 | Legacy Data Migration Tooling & CLI Ingestion Engine | [PR #58](https://github.com/roji-tech/AlEemaan/pull/58) (`dev`), [PR #59](https://github.com/roji-tech/AlEemaan/pull/59) (`master`) | Passing |
| 0030 | — | Extended Staff HR Fields (`middleName`, `gender`, `dateOfBirth`, `designation`, `qualification`, `employmentDate`, `nextOfKin*`) | [PR #63](https://github.com/roji-tech/AlEemaan/pull/63) (`dev`), [PR #64](https://github.com/roji-tech/AlEemaan/pull/64) (`master`) | Passing |

---

## 3. Database Migrations Status (100% Deployed & Synchronized)

All 26 database migrations have been executed and validated against both local Docker and live production environments:

- **Local Docker Database:** `postgresql://aleemaan:aleemaan@localhost:5434/aleemaan` — 26 migrations applied.
- **Live Remote Database:** `postgres://...:5432/postgres?sslmode=require` (`db.prisma.io:5432`) — 26 migrations applied.
- **Latest Migration Applied:** `20261018150000_staff_extended_fields/migration.sql`

---

## 4. Architectural Blueprint: Phase 4 Operations & Admissions CRM

A detailed technical blueprint is documented in:
👉 **[`docs/tasks/0030-phase-4-operations-and-admissions-blueprint.md`](docs/tasks/0030-phase-4-operations-and-admissions-blueprint.md)**

### Modules Detailed in Blueprint:
1. **Extended HR & Payroll:** Multi-branch salary structures, allowances, statutory deductions (PITA PAYE, Pension Reform Act 2014, NHF 2.5%), monthly runs, payslips.
2. **Library Management:** Catalog-to-copy architecture, ISBN lookups, barcode tracking, loan checkouts, and overdue fines synced with student fee billing.
3. **Transport & Fleet Operations:** School buses, routes, ordered pickup/drop-off stops, passenger manifests, driver assignments, and term subscription fees.
4. **Inventory & Asset Management:** Fixed assets (lab apparatus, classroom furniture) vs. consumable inventory (uniforms, stationery), store requisitions, re-order threshold alerts.
5. **Government & Statutory Reporting:** Automated census data export conforming to Ministry of Education (MoE) and UBEC/NPA reporting requirements.
6. **Admissions Pipeline & CRM:** Public application portal, entrance tests, interview rubrics, offer letters, waitlist ranking, and atomic zero-rekeying conversion into permanent SIS records.

---

## 5. Verification & Test Suite Health

- **Suite Status:** 585 tests passing, 0 failures, 18 documented design skips.
- **Full Mutation Testing:** 45 mutations across Pagination (`P1`–`P19`), Validation (`V1`–`V8`), CSRF (`C1`–`C9`), and Password Policy (`W1`–`W9`) -> 100% caught.
