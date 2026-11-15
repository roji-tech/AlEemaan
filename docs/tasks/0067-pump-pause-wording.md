# 0067: The sending line said "the server could not be reached" when another screen was sending the rest

- **Period / Focus:** 2026-11-12 (a known flaw of task 0063, recorded in its PR; the maintainer asked for the flaws and gaps to be fixed)
- **Status:** Done
- **Priority:** Low (wording only; no message is lost either way)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/pump-pause-wording` / PR into `dev`
- **Started:** 2026-11-12

> Written after the five-line change, not before it: the fix is small and the failing test was written and run first (section 3).

## 1. Objective

The hook `useQueuePump` stops after five calls in a row that claimed nothing (another screen, or another tab, holds the rows and is sending them). It then showed the same "paused" line as when the server cannot be reached ("Sending is paused at 0 of 8: the server could not be reached"), which is false: the server answered every call. An administrator who reads it looks for a network fault that is not there.

## 2. Decision

The paused state carries a reason: `unreachable` (three calls in a row got no answer, or an error) or `elsewhere` (the server answered, but nothing could be claimed). The line says "another screen is sending the rest. Nothing is lost; choose Try again to check on it." for the second, and keeps its wording for the first. "Try again" is the same button for both. Octalve's hook has the same flaw and is fixed in its own task (Octalve task 0058, follow-up).

## 3. Build record and tests

- **Test first, on the unfixed build (`origin/dev` f6dea70):** `tests/e2e/communication-batches.spec.ts`, desktop: **5 passed, 1 failed.** The new test (the server answers every call "nothing claimed, 8 waiting") failed: the line read "Sending is paused at 0 of 8: the server could not be reached." (screenshot read). The existing "cannot be reached" test now also checks the full sentence and passed.
- **Fixed build: 11 passed, 0 failed** (setup, desktop and phone): the six tests of the spec, including the new one (5 per project plus the setup). tsc exit 0; eslint on the changed files exit 0; Prettier clean on the changed files; the catalogue check is run before the commit.
- **Not run:** the whole suite; mutation passes (deferred).
