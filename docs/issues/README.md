# Issues register — AlEemaan

Every known or suspected problem, with severity, kind, where it is and how sure we are. Newest findings go on top of their severity group. Use `template.md` for the detail file when an issue needs more than a row (`ISS-NNNN-short-title.md` in this folder).

## Register
| ID | P | Type | Issue | Status | Live? | Evidence | Where | Found |
|---|---|---|---|---|---|---|---|---|
| ISS-0001 | P1 | Authorization | Attendance roll call/marking not scoped to the caller's branch (default role `TEACHING_STAFF`) | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced by test | `src/app/api/v1/attendance/route.ts` | 2026-10-11 |
| ISS-0002 | P1 | Authorization / Data integrity | Attendance upsert on `(studentId, date)` can overwrite another branch's record; unknown id → 500 | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced by test | `src/lib/attendance/service.ts` | 2026-10-11 |
| ISS-0003 | P0 | Privacy | `GET /students` and `/students/[id]` open to every signed-in user (STUDENT, PARENT, no membership) incl. guardian phone/email, DOB | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced by test | `src/app/api/v1/students/**` | 2026-10-11 |
| ISS-0004 | P2 | Authorization | `GET /students/[id]/attendance` had no branch check | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced by test | `src/app/api/v1/students/[id]/attendance/route.ts` | 2026-10-11 |
| ISS-0005 | P2 | Validation | Roll-call GET `date` unvalidated → 500; marking allowed with no active session | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced by test | `src/app/api/v1/attendance/route.ts` | 2026-10-11 |
| ISS-0006 | P2 | Validation / Availability | Student import: no row cap, returns raw error text (500 with `err.message`) | Fixed on `claude/hardening-iss-0006-0007` (import capped at 1000 rows and 1 MiB; no route returns an exception's own text - the 5 student routes and 3 academics routes were the same flaw) | unknown | Reproduced by test | `src/app/api/v1/students/import/route.ts` | 2026-10-11 |
| ISS-0007 | P3 | Process | New routes bypass the shared `validate()` helper (manual `req.json()`, no body cap) | Fixed on `claude/hardening-iss-0006-0007` (all three now use `validate()`: 413 over 1 MiB, 400 on bad JSON) | unknown | Reproduced by test | `settings/school`, `attendance`, `students/import` | 2026-10-11 |
| ISS-0008 | P3 | Privacy | `GET /settings/school` and `GET /academics/sessions` open to every signed-in user (content judged acceptable) | Won't fix (decision recorded in the plan addendum) | unknown | Read | `src/app/api/v1/settings/school/route.ts` | 2026-10-11 |
| ISS-0009 | P2 | Test gap | Existing attendance tests signed in as a member of another branch and only passed because of ISS-0001 | Fixed, landed in dev (PRs #17, #20) | unknown | Reproduced | `tests/api/attendance.spec.ts` | 2026-10-11 |
| ISS-0011 | P1 | Authorization | Staff in one branch with another role in a second branch: route-level `roles` means "a role somewhere", so a non-teaching member of branch B who teaches in A could mark in B; PARENT/STUDENT memberships counted as visibility | Fixed on this branch | unknown | Reproduced by test | `src/lib/auth/branch-access.ts`, attendance route | 2026-10-11 |
| ISS-0012 | P2 | Process / Docs drift | ADR 0001 (roles school-wide) and the attendance/student code disagreed; superseding ADR not proposed before coding | Closed 2026-10-11: ADR 0012 accepted | n/a | Read | `docs/adr/0001`, `0012` | 2026-10-11 |
| ISS-0013 | P1 | Authorization (design) | An ADMIN membership in any branch administers the whole school; no superadmin/branch-admin split | Fixed in `dev` by the branch-admins PR (full suite 1143 passed; ADR 0014 Proposed) | unknown | Read | `lib/auth/branch-access.ts`, all `Role.ADMIN` routes | 2026-10-11 |
| ISS-0014 | P3 | Test gap | `e2e/shell.spec.ts` expected Settings as "coming soon" and a 3-link tab bar after Settings shipped (0.5.2); found by the full suite | Fixed on `claude/design-branch-admins-superadmins` | n/a | Reproduced (full suite) | `tests/e2e/shell.spec.ts` | 2026-10-11 |
| ISS-0010 | P3 | Process | `docs/tasks/current-tasks.md` names a sync script that does not exist; `tasks:check` prints stale statuses | Fixed on `claude/hardening-iss-0006-0007` (the nonexistent sync command is gone; `tasks:check` uses this checkout's path and no longer prints a hard-coded parity block) | n/a | Read | `docs/tasks/current-tasks.md`, `scripts/tasks-check.mjs` | 2026-10-11 |

## Priority scale
| P | Meaning | Examples |
|---|---|---|
| **P0** | Live harm now: data leaking, money lost or wrong, auth bypass on production | a public endpoint returning other people's data on prod |
| **P1** | Serious flaw that is exploitable or loses data once triggered, not known to be hit yet | cross-branch writes, duplicate receipt numbers, lost webhooks |
| **P2** | Real defect with limited blast radius, or a flaw that needs an unusual setup | raw error text returned, missing row cap |
| **P3** | Cleanup, docs drift, consistency | stale trackers, one-line commit messages |

"**Live?**" says whether the problem exists on production (`yes` / `no` / `unknown`). Nothing here has been checked against a production deployment, so it is `unknown` until someone confirms what is deployed.

**Evidence levels:** *Read* = found by reading code (not yet proved); *Reproduced* = a failing test or run exists; *Reported* = from a user/maintainer.

## Suspects not yet investigated
- What is actually deployed for the live school, and whether its database already has the attendance and student tables (migrations `20261009*`) — the fixes here only matter once it does.
- The remaining routes without `roles` (`GET /settings/school`, `GET /academics/sessions`) beyond the judgement in ISS-0008.
- Whether `/students/import` can be reached by a non-admin through the UI shell (the route itself is admin-only).
- Rate limits on the new write routes (attendance, students, settings).
- Timezone handling of "today" for attendance (UTC date vs the school's local day).

## Issue types to look for (the taxonomy — extend it when a new kind turns up)
| Type | What to look for in this app |
|---|---|
| **Authorization / IDOR** | a route with no `roles`; a role checked "somewhere" but not for *this* branch/campus/school; a default role when none is found; ids not checked against the caller's scope; 403 where 404 would hide existence |
| **Privacy / PII** | lists or details returning guardian phone/email, date of birth, admission numbers to roles that don't need them; PII in audit logs, errors or URLs; public endpoints returning more than needed |
| **Money / payments** | receipt or invoice numbers from counts; webhooks that lose or double-apply a payment; amounts as floats; client-supplied references; silent fallbacks to test keys |
| **Concurrency / data integrity** | check-then-write without a lock or conditional update; unique keys that cross a scope boundary; refusal after a write that commits (ADR 0002); counters read inside a transaction |
| **Validation / input** | unvalidated query strings (500s), unbounded arrays/bodies, bad dates (timezones), raw `err.message` returned to the client, free-text where an enum belongs |
| **State machines** | transitions open to the wrong role; no ownership/segregation of duties; locked/published data editable through a side path |
| **Availability / performance** | N+1 queries, unbounded lists, huge IN lists, missing indexes, slow transactions, rate-limit gaps on public routes |
| **Migrations / deployment** | non-additive migrations on live data, missing env validation, dev fallbacks reachable in production, reverse-proxy Host assumptions |
| **UX / accessibility** | tap targets < 44 px, focus not returning, announcements missing, axe violations, broken phone layouts, duplicate React keys |
| **Next.js 16 specifics** | `params`/`searchParams` are promises; `proxy.ts` (not middleware) sets the CSP nonce; caching defaults; default 404/error pages carry inline styles the CSP rejects; route handlers run the production build in tests |
| **CI and deploy** | gates not run in CI, env validation missing at startup, migrations applied after the code, reverse proxy must pass `Host`, secrets in the wrong place |
| **Docs drift** | trackers that disagree with git, "built" claims without a test, ADRs contradicted by code, stale handoffs |
| **Test gap** | a rule with no test that fails when it is broken; tests that pass because of a bug; "green" claims without the suite named |
| **Process / docs** | docs that say built when it isn't, stale trackers, merged-into-feature-branch stacks, commit messages without evidence |

## How this register is used
1. Add an issue the moment one is *suspected* — evidence level **Read** is fine; say so honestly. Never mark **Reproduced** without a failing test or run.
2. Keep the table sorted by priority, then date. Update status in place; never delete (use *Won't fix* / *Duplicate*).
3. Fixing is a normal task (design → test that fails first → fix → docs): link the issue from the task file, and set **Fixed** with the commit.
4. Add newly discovered *kinds* of issue to the taxonomy above, and note in the issue which earlier issue it resembles — a pattern found once usually exists elsewhere (the AlEemaan student-list leak was found by auditing for the attendance flaw).
5. Prioritise by priority, then by blast radius (money and personal data first), then by how cheap the fix is.
