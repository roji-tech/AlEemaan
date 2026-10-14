# AlEemaan — Current Active Tasks

> **Canonical Location:** `docs/tasks/`
> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.
> **Check command:** `pnpm tasks:check` (reads this table and the sibling Octalve Edu's; changes nothing)

---

## Active & Upcoming Tasks Overview

| # | Task File | Description | Status | Started | Ended | PR / Branch |
|---|---|---|---|---|---|---|
| 0001 | [`0001-phase-0-5-h-users-and-invitations.md`](0001-phase-0-5-h-users-and-invitations.md) | Phase 0.5.H: Users pages and invitations port & testing | Completed | 2026-10-07 09:00:00 UTC | 2026-10-07 23:30:00 UTC | [PR #11](https://github.com/roji-tech/aleemaan/pull/11) (`claude/aleemaan-users-invitations`) |
| 0002 | [`0002-aleemaan-school-settings.md`](0002-aleemaan-school-settings.md) | School Settings (0.5.2) & Academic Sessions Foundation | Completed | 2026-10-09 10:42:00 UTC | 2026-10-09 11:18:00 UTC | [PR #13](https://github.com/roji-tech/AlEemaan/pull/13) (`claude/0.5.2-school-settings`) |
| 0003 | [`0003-aleemaan-student-domain-and-override.md`](0003-aleemaan-student-domain-and-override.md) | Student Domain & ADR-0014 Duplicate Override Port | Completed | 2026-10-09 11:28:00 UTC | 2026-10-09 14:55:00 UTC | [PR #14](https://github.com/roji-tech/AlEemaan/pull/14) (`claude/student-domain-and-override`) |
| 0004 | [`0004-aleemaan-attendance-domain.md`](0004-aleemaan-attendance-domain.md) | Attendance Domain & Touch Grid (Phase 1.3 Adaptation) | Completed | 2026-10-09 22:00:00 UTC | 2026-10-09 22:35:00 UTC | [PR #15](https://github.com/roji-tech/AlEemaan/pull/15) (`claude/aleemaan-attendance`) |

| 0005 | [`0005-aleemaan-attendance-branch-scoping-fix.md`](0005-aleemaan-attendance-branch-scoping-fix.md) | Attendance branch-scoping fix and route-role guard | Completed | 2026-10-11 UTC | 2026-10-11 UTC | [PR #17](https://github.com/roji-tech/AlEemaan/pull/17) → #20 (dev) |
| 0006 | [`0006-aleemaan-branch-admins-and-superadmins.md`](0006-aleemaan-branch-admins-and-superadmins.md) | Branch administrators and superadmins (S1–S8) | Completed (code); suite 1143 passed / 0 failed; ADR 0014 accepted 2026-10-13 (live deploy gated on the administrator list) | 2026-10-11 UTC | — | `claude/branch-admins-superadmins` |
| 0007 | [`0007-adr-0014-accepted-and-admin-list.md`](0007-adr-0014-accepted-and-admin-list.md) | ADR 0014 accepted; administrator list; Arabic branches start fresh | Completed (the live list is waiting on the maintainer) | 2026-10-13 UTC | 2026-10-13 UTC | `claude/adr-0014-accepted-and-admin-list` |
| 0008 | [`0008-input-hardening.md`](0008-input-hardening.md) | Input hardening: ISS-0006, ISS-0007, ISS-0010 | Completed (suite 1149 passed / 1 load-sensitive timing test failed, passes alone / 18 skipped) | 2026-10-13 UTC | — | `claude/hardening-iss-0006-0007` |
| 0009 | [`0009-with-branch-combinator.md`](0009-with-branch-combinator.md) | The branch combinator (ADR 0015) | Completed (suite 1158 passed / 0 failed / 18 skipped) | 2026-10-14 UTC | — | `claude/with-branch` |
| 0010 | [`0010-p1a-classes-arms-subjects.md`](0010-p1a-classes-arms-subjects.md) | P1a: classes, arms, subjects and offerings | Completed (suite 1164 passed / 5 failed, re-run green / 18 skipped) | 2026-10-14 UTC | — | `claude/p1a-classes-subjects` |
| 0011 | [`0011-p1b-assessment-grading.md`](0011-p1b-assessment-grading.md) | P1b: assessment schemes and grade scales | [~] In Progress (built; full suite (running)) | 2026-10-14 UTC | — | `claude/p1b-assessment-grading` |
---

## Completed Tasks: 0001 - 0004

- **Completed:** Option 2 (School Settings), Option 3 (Student Domain & Duplicate Override), Octalve Edu Phase 1.3 (Attendance), Option B: AlEemaan — Port Attendance Domain & Touch Grid (`claude/aleemaan-attendance`), Option A: Octalve Edu Phase 1.4 (Results Domain), Option C: Push & PRs prepared across Octalve Edu and AlEemaan.
- **Next Up:** Review / merge open PRs, then proceed to Phase 1.5 (Finance, Invoicing & Paystack Integration).
