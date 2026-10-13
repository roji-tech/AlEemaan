# [0008]: Input hardening - ISS-0006, ISS-0007, ISS-0010

- **Period / Focus:** 2026-10-13 (hardening backlog)
- **Status:** In Progress - built; the full suite is **(running)**
- **Priority:** Medium
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/hardening-iss-0006-0007` -> `dev`
- **Started:** 2026-10-13 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Close the three open hardening issues: the student import has no row cap and returns raw error text (ISS-0006), three routes bypass the shared `validate()` helper (ISS-0007), and the task tracker names a script that does not exist (ISS-0010).

## 2. Work Breakdown
- [x] Tests first: `tests/api/hardening-input.spec.ts` (3) and `tests/unit/no-raw-errors.spec.ts` (1, source-level: no API route returns a caught exception's own text; logging it is fine), seen failing (4 of 4) before the change.
- [x] `students/import` uses `validate()` with `IMPORT_MAX_ROWS = 1000` (400 VALIDATION naming the limit; 413 over 1 MiB; 400 INVALID_BODY); `settings/school` PATCH and `attendance` POST use `validate()` too.
- [x] No route returns an exception's text: the import and the four other student routes return fixed messages. **Wider than the issue named:** the source test also found three academics routes (sessions create/update, set current period) returning raw text; their service now throws a `DomainError` (messages written for the caller: missing branch, duplicate label, not found) and the routes return only a `DomainError`'s message - anything else gets a fixed one.
- [x] ISS-0010: `current-tasks.md` points at `pnpm tasks:check`; the script uses its own checkout's path, an overridable sibling path, and prints no hard-coded parity block.

## 3. Verification
Targeted: hardening-input, no-raw-errors, students, attendance, settings, academics, route-role guard: 38 passed after `pnpm build` (the no-raw-errors test was seen failing against the 8 real offenders, and once against its own over-eager regex, which matched logging lines - the test was fixed, not the routes). Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2.
