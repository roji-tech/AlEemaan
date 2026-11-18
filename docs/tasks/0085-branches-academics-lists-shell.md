# 0085: A branch has its own page (rename, guarded delete); Classes and Subjects are two tabs; lists get a Filters button and paging; the phone shell stops hiding things

- **Period / Focus:** 2026-11-17 (the maintainer, from screenshots: edit and delete branches, a page per branch; the green tools button covers "More"; the guide's header overlaps; Academics needs a better design with Classes and Subjects as tabs, paging and filtering; "the filter should be a button beside search" that opens and collapses; the More sheet at most 80% high with collapsible sections; the bottom bar has one item)
- **Status:** Done (the record is section 6)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/ui-branches-nav-academics` / PR into `dev`
- **Started:** 2026-11-17

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Seven requests from screenshots, one PR. Two further requests are **not in this task** and stay open (section 5): a nicer way to add many classes, subjects and invitations, and approval of an e-mail change.

## 2. Decisions

- **D1. A branch's page is `/branches/[id]`; the list's rows are links to it.** Superadmin only, as the list is. The page shows the name, the code, when it was made, and **what the branch holds**.
- **D2. Rename changes the name only.** The branch `code` is part of every invoice number already issued (`INV-<code>-2026-0001`), so it is shown and never edited. `PATCH /api/v1/branches/[id]` takes `{ name }` and nothing else (a key it does not name is refused); the same name is a success that changed nothing and writes no audit row; a taken name is 409; `BRANCH_RENAMED` is audited with before and after.
- **D3. Delete is refused for a branch that holds people or history.** Nearly every table cascades from `Branch`, so `branch.delete()` on a branch with pupils, results, invoices or forms would remove all of it in one statement. The rule is the other way round: everything that points at the branch must be *set-up*. The tables are read from the database's own foreign keys (`lib/branches/holdings.ts`), so a table added later is counted, and, not being in `FOLDS_WITH_BRANCH`, it **blocks** until someone decides it is set-up. Set-up that goes with the branch (classes, subjects, terms, settings, deactivated memberships, open invitations) is counted and listed in the confirmation. An **active member** blocks (they would lose their place silently). The **last branch** cannot be deleted.
- **D4. The confirmation is the exact name typed back**, not a password step: the deletion can only ever remove set-up, and `step-up` is kept for changes of authority. The check and the delete are one transaction with the branch row locked (`FOR UPDATE`), so a pupil added while it is being checked waits and then fails on the missing branch. `BRANCH_DELETED` is audited with what went with it. Restricting tables (the question bank) answer with a foreign-key error that becomes the same 409.
- **D5. Classes and Subjects are two tabs; the branch choice is shared between them.** Search, the filters and the paging are the browser's (a branch has tens of rows). Classes: search by class, arm or subject name; filter "No subjects set" / "No arms yet"; 8 a page, as cards in two columns from `lg`. Subjects: search by name or code; filter "No class studies it"; 12 a page. Every button keeps its accessible name (`Add an arm to X`, `Subjects of X`, `Rename X`, `Archive X`, `Edit S`).
- **D6. One toolbar for lists: `ListToolbar` and `Pager`.** A search box with a **Filters** button beside it; the button opens a panel of the filters and closes it (the filters keep their values; the button shows how many are set; `aria-expanded`, the panel is a labelled group). The Users page uses it in place of four stacked selects (server-side paging kept). The panel only exists while open, so a collapsed one holds nothing focusable.
- **D7. Phone shell.** The green tools button sits above the bottom bar below `lg` (it covered "More" from 640 px). The More sheet is at most 80% of the screen high and each section folds (`aria-expanded`). The bottom bar fills its four slots from the More pages in menu order when a role has fewer own pages (non-teaching staff had Overview and More). The video guide's header wraps and uses short link labels on a phone.

## 3. Not in this task

Nothing in the walkthrough: its chapters still name the tab "Classes and subjects" and C16/C03 use the Users filters directly. They are updated in the walkthrough pass, which the maintainer put last.

## 4. Files

`src/lib/branches/holdings.ts`; `src/app/api/v1/branches/[id]/route.ts`; `src/app/(app)/branches/[id]/{page,BranchDetailView}.tsx`; `src/app/(app)/branches/{page,BranchesView}.tsx`; `src/components/branches/BranchDialogs.tsx`; `src/components/ui/{ListToolbar,Pager}.tsx`; `src/components/academics/{ClassesPanel,AcademicsSections}.tsx`; `src/components/users/UsersPanel.tsx`; `src/components/shell/{MobileNav.tsx,nav.ts}`; `src/components/tools/QuickToolsTrigger.tsx`; `src/app/video-guide/page.tsx`; `src/app/globals.css` (the `filters-in` keyframe).

## 5. Still open (asked, not built here)

- A better way to add **many classes, subjects and invitations** (new bulk kinds for classes with arms and subjects, a clearer start screen).
- **E-mail change needs approval**: a member's by an administrator or superadmin, an administrator's by a superadmin. Needs a design (a request table and so a migration) before code.
