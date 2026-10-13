# [0009]: The branch combinator (ADR 0015)

- **Period / Focus:** 2026-10-13/14 (hardening backlog; ADR 0015 accepted 2026-10-13)
- **Status:** Completed - full suite 1158 passed / 0 failed / 18 skipped
- **Priority:** Medium
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/with-branch` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Make "may this caller act on THIS branch?" structural instead of something each handler must remember to ask (ISS-0001, -0002, -0004 and -0011 were exactly a forgotten call). `withBranch` resolves the branch a handler acts on, checks the caller's authority there, and only then runs the handler, handing it the branch and the role held in it. No response changes.

## 2. Work Breakdown
- [x] `src/lib/auth/with-branch.ts`: `branchGrant(userId, branchId, as)` and `withBranch({ of, as, where?, refuse? }, handler)`; `as` = `administer` | `staff-read` | `staff-write`. The handler's fourth argument is `validate()`'s parsed input, so it composes inside `validate()`; a route with only an id in the URL uses it with no input. `refuse(why, routeContext, input)` lets a route keep its own words or envelope.
- [x] Routes moved over, answers unchanged (same status, code and message): `students/[id]` PATCH + DELETE, `students/[id]/restore`, `academics/sessions/[id]` PATCH (entity: 404 "not found" for unknown or another branch's), `students` POST, `students/import` POST, `academics/sessions` POST, `academics/periods/[id]` PATCH (branch named in the body: 403), `attendance` GET (`staff-read`) and POST (`staff-write`; the route's own `attendanceFailure` envelope through `refuse`).
- [x] Where a route parsed its own body (no `validate()`), the check is applied to the parsed data inside the handler, so the order of answers (bad body = 400 before a foreign branch = 403/404) is exactly what it was. Moving those routes onto `validate()` is NOT part of this task (it would change their error wording).
- [x] The route guard: a handler that names a branch must be wrapped by `withBranch` or be listed in `NOT_WRAPPED` with the reason. Six are listed: lists that narrow to the caller's visible branches (sessions, branches, students), one student read through a visible-branches filter, the invitation create (checked in `lib/members/http`), and public setup. Stale-entry check included.
- [x] Tests: `tests/integration/with-branch.spec.ts` (7: each `as`, a superadmin, a branch admin, a deactivated admin, unknown/null branch, the role held per branch, staff-write FORBIDDEN vs not found, the wrapper's 403 vs 404 and `refuse`, the input and context reaching `of`); the guard's two new tests; every existing API spec unchanged as the proof of "no behaviour change".

## 3. Verification
Targeted (with-branch integration 7, route guard, students, attendance, academics, hardening-input): 46 passed after `pnpm build`; typecheck, lint, prettier clean. Full suite (one worker, all projects, `aleemaan_test`, 44 min): **1158 passed, 0 failed, 18 skipped** (the skips are pre-existing, not re-examined). NOT seen failing first: the with-branch spec and the two guard tests were written with/after the code; the API specs are the pre-existing proof of unchanged answers. Mutation passes NOT RUN - pending, end of Phase 2.
