# 0034: Bounded body read, source hygiene, two test repairs and the names check

- **Period / Focus:** 2026-10-20 (follow-ups of the bug hunt: request bodies, invisible characters in the source, two test repairs, a names check)
- **Status:** Completed (merged into `dev` on 2026-10-20 as PRs #73 to #77, 20:00 to 20:01 UTC; the full suite on the merged `dev` is still to run, see section 4)
- **Priority:** Medium
- **Assignee:** Agent (Claude); merged at the maintainer's instruction ("merge all the PRs in order")
- **Target Branch / PR:** `dev`; PRs #73 to #77, listed in section 6

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A request body is read no further than its cap whoever reads it, the source has no invisible or direction-changing characters (and a test keeps it so), two tests stop depending on luck or on the developer's `.env`, and a name needs something visible in it.

## 2. Context & Related Docs
- Builds on the branch gate of PR #71 (`src/lib/auth/branch-gate.ts`, which read the body with a copy of the cap logic) and the code catalogs of PR #72: each branch changes the catalog rows of the files it touches in the same commit.
- Octalve Edu has the same changes as its own pull requests (#36 `claude/fix-bounded-body-read`, #42 `claude/chore-source-hygiene`, #43 `claude/fix-names-need-a-visible-character`, merged into its `dev` the same day, task 0017 there); the code is kept the same on purpose.

## 3. Work Breakdown

### Module A: Request bodies (#73 `claude/bounded-body-read`, two commits)
- [x] `validate()` reads the body through a new helper, `readBoundedText` (`src/lib/api/read-body.ts`): a declared length over the cap is refused without reading anything, and a body with no declared length is refused as soon as it passes the cap, whether or not the sender ever finishes it. A route's own higher cap (`maxBodyBytes`) works as before; the 413 answer is unchanged.
- [x] The branch gate reads its body through the same helper (it had a copy of the logic). The helper does not await the stream's cancel, on purpose: when the body is one half of a `tee`, a cancel settles only when the other half is cancelled too.

### Module B: Source hygiene (#74 `claude/chore-source-hygiene`)
- [x] No literal invisible, direction-changing or control characters in the tracked source: nine files fixed (they are written as escapes), and `tests/unit/source-hygiene.spec.ts` fails on a literal one.

### Module C: Test repairs
- [x] #75 `claude/test-outbox-strict`: a corrupt line in the test inbox is an error, not "no mail" (ported from Octalve Edu; `tests/unit/outbox.spec.ts`).
- [x] #76 `claude/test-startup-secrets-hermetic`: `tests/integration/startup-secrets.spec.ts` is independent of the developer's `.env` and no longer leaves a server running.

### Module D: Names (#77 `claude/fix-names-need-a-visible-character`)
- [x] `checkName` refuses a name made only of characters that take no room on the screen (zero-width spaces and joiners, the word joiner, the byte-order mark, variation selectors, the soft hyphen, fillers): "Enter your name." Joiners between letters stay welcome. New spec `tests/unit/profile-name-visible.spec.ts`; catalog row updated.

### Module E: Docs
- [x] Catalog rows in the commits that need them (`docs/functions/shared.md`).
- [x] This task file, `current-tasks.md`, `aleemaan_progress.md`, `HANDOVER.md` section 6 and the banner of `CLAUDE.md`.
- [x] Open the pull requests into `dev` and merge them in order (#73 to #77, each after its Vercel check passed and with `base.ref` checked to be `dev`), at the maintainer's instruction.

---

## 4. Verification
- [x] Bounded body read: `tests/unit/api-infrastructure.spec.ts` 21 passed (three new); typecheck 0 errors; on a production build, 54 API tests passed (the branch-gate spec, announcements, communication, lms, timetable, promotion, cross-branch-isolation, question-bank-foundation, hardening-input). Before the change, the two stream unit tests failed (the whole 20 MiB offered was taken) and the stalled-socket test failed.
- [x] Hygiene: the guard has 2 tests and passes; the scan finds no file with a literal character on the branch.
- [x] Outbox: 4 unit tests pass. Startup secrets: on a build, the 4 cases pass with the developer's `.env` present.
- [x] Names: the unit run passed (30 tests), the new spec included.
- [x] The whole unit project on the merged `dev` (a tree identical to `8db6101` apart from this docs commit): 481 passed in 4.8 min. The chore and the names changes both edit `src/lib/auth/profile-policy.ts`, on different lines, and merged without a conflict.
- [ ] NOT run: the API, integration and e2e projects and the https project on the merged `dev`, and any of them on each branch alone beyond the 54 API tests above (no full suite was started for AlEemaan).

## 5. Notes
- Found on the way: the guard test's own comment first held a literal direction-changing character (written by a tool that turns an escape sequence into the character); the comment now spells the escape out, and a check of the result after any edit by a tool is part of the routine.
- The email-change timing check (`tests/api/account-self-service.spec.ts`) was repaired separately on `dev` (`6d3d9fe`): its tolerance had been below its own noise.

## 6. Output & Deliverables
- **Pull requests, all into `dev` (off `38556d4`), merged in this order on 2026-10-20 with a merge commit each; the remote branches are kept:**

| PR | Branch | Merge commit | Merged (UTC) |
|---|---|---|---|
| #73 | `claude/bounded-body-read` (two commits) | `414b116` | 20:00:17 |
| #74 | `claude/chore-source-hygiene` | `a380ab6` | 20:00:30 |
| #75 | `claude/test-outbox-strict` | `00e43ca` | 20:00:44 |
| #76 | `claude/test-startup-secrets-hermetic` | `5866bb2` | 20:01:02 |
| #77 | `claude/fix-names-need-a-visible-character` | `8db6101` | 20:01:16 |

- **Merge gate used:** state open, `base.ref` is `dev`, the head is the commit that was verified, the Vercel check (type-check and build of the preview) is SUCCESS, GitHub reports the PR mergeable. No other CI runs on a pull request here.
- **Docs:** `docs/functions/shared.md` (catalog rows), this file, `docs/tasks/current-tasks.md`, `docs/development-history/aleemaan_progress.md`, `docs/HANDOVER.md`, `CLAUDE.md`.
