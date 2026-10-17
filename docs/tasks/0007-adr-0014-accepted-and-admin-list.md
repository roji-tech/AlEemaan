# [0007]: Accept ADR 0014; the administrator list; the Arabic branches start fresh

- **Period / Focus:** 2026-10-13 (the maintainer's review of the open decisions)
- **Status:** Completed
- **Priority:** Medium
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/adr-0014-accepted-and-admin-list` -> `dev`
- **Started:** 2026-10-13 UTC
- **Ended:** 2026-10-13 UTC
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Record what the maintainer decided on 2026-10-13 and give them the one tool they need before the branch-admins migration goes live.

## 2. Context & Related Docs
- ADR 0014 (branch administrators and superadmins), task 0006, the plan's Phase 7 note, the legacy inventory section on the Arabic branches.
- The maintainer accepted every recommendation of the review, and answered the open Phase 7 question: **the Arabic branches' data is not available at all, so the school starts them fresh.**

## 3. Work Breakdown
- [x] **ADR 0014 -> Accepted**, with the condition on the live deploy written into its Decision: read `pnpm admins:list`, decide who stays a superadmin, deploy, then remove the flag from the others on the Users page (not the other way round).
- [x] `pnpm admins:list` (`scripts/list-admins.mjs`): read-only; every person with an active ADMIN membership, the branches they administer, superadmin yes/no, two-step on/off. `tests/integration/list-admins-script.spec.ts` (3 passed) was written before the script but NOT run failing first.
- [x] **Phase 7 unblocked:** roadmap, plan and legacy inventory say the migration covers the two English branches' Firestore projects only; the Arabic branches start from zero through the ordinary portal.
- [ ] **Waiting on the maintainer:** run `pnpm admins:list` against the LIVE database (the AI has no access to it) and say who stays a superadmin.

## 4. Verification
Integration list-admins spec 3 passed (one worker, `aleemaan_test`). Not run: the full suite (a read-only script and docs only); mutation passes NOT RUN - pending, end of Phase 2.
