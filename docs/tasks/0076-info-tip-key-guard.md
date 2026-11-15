# 0076: The info-tip registry's key guard allows two-word keys in camelCase (found while running AlEemaan's unit project for task 0075)

- **Period / Focus:** 2026-11-15 (a unit spec that is red on `dev`: `tests/unit/info-tips.spec.ts`, "every key is a dotted lowercase name")
- **Status:** Done (the failing assertion was run first on `dev`; the record is section 3)
- **Priority:** Low (a test, not behaviour; but a red spec on `dev` hides the next real failure)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/info-tip-key-guard` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The registry of info-icon texts (`src/components/ui/info-tips.ts`) has two keys that the registry's own guard refuses, so the guard is red on `dev`. Make the guard say what is meant.

## 2. What is wrong

Task 0054 wrote the guard as `^[a-z]+(\.[a-z]+)+$` ("a dotted lowercase name"), when every key was one lowercase word per part. Task 0073 added `programs.lockRelease` and `programs.weekGrid`, two-word keys in camelCase, which the guard refuses (the spec stops at the first, `programs.lockRelease`, so `programs.weekGrid` was hidden behind it). The other 13 keys are one lowercase word per part.

## 3. Decision, and record

- **D1. The guard allows camelCase parts; the keys stay.** Two-word keys are naturally camelCase (`lockRelease`, `weekGrid`; the code that uses them, `InfoTip tip="programs.weekGrid"`, reads best that way) and renaming them to `lockrelease` would be worse than loosening a pattern. New rule: dotted, at least two parts, each part starts with a lowercase letter and holds letters and digits only: `^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$`. Still refused: an uppercase first letter, a hyphen or an underscore, a space, a single part, an empty part. No behaviour change.
- **Failing first:** on `origin/dev` `b97d17f` the spec's first test fails on `programs.lockRelease` (`Expected pattern /^[a-z]+(\.[a-z]+)+$/`), and `programs.weekGrid` fails the same pattern (listed by a grep of the registry; the spec stops at the first).
- **Build record (2026-11-15, worktree `AlEemaan-cloudinary`, `pnpm exec playwright test --project=unit tests/unit/info-tips.spec.ts` with a placeholder `TEST_DATABASE_URL`, the spec does not use a database):** `tsc --noEmit` and `eslint` on the spec clean, Prettier `--check` clean (the spec was clean at `HEAD`); `info-tips.spec.ts` **5 passed, 0 failed**. `pnpm build` was **not** rerun (a test file and docs changed, no source). Not run: the rest of the unit project (its last whole run, with this one failure, is task 0075's: 1122 passed, 3 failed, 6 did not run), the other projects, mutation passes (deferred).

## 4. Not in this task

Whether keys should be camelCase or lowercase for the other (Octalve) registry: not looked at.
