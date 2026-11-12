# 0058: The fee "Edit" dialog opened blank and could move a fee to every class; its term select did nothing

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's first run of chapter C11 Finance, task 0033)
- **Status:** Done
- **Priority:** High (a fee that is edited by retyping its name and amount silently changes from "Primary 1 only" to "all classes", and the next batch of invoices then charges it to every class)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/fix-fee-edit-dialog` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On Finance, "Fee Schedules & Structures", pressing **Edit** on a fee opens "Edit Fee Structure Item" with an EMPTY name and amount, the term on the first term of the list and the scope on "All Classes (Universal)", whatever the fee actually is. It is the same family as task 0057: a dialog that is mounted once, and a form that reads its starting values once.

Make Edit open the fee as it is, and every "Add Fee Item" open blank, every time. And a second defect of the same dialog, found while checking what an edit can change: its term select offers a change that the server ignores (below).

## 2. Context

- **Found by the walkthrough** (C11 step 86, "Correct the name and the amount of a fee"): the fee "Tuiton", ₦50,000, scope Primary 1, was created in the step before. Edit opened the form with `Fee Item Name` = `""`; the screenshot shows the amount as its placeholder (`50000.00`, grey), the term on "1st Term (2026/2027)" (the first term, which happened to be right) and the scope on "All Classes (Universal)", although the fee is for Primary 1.
- **The mechanism.** `FeeStructuresPanel` renders `<FeeStructureModal isOpen={modalOpen} initialItem={editingItem} />` all the time. The modal returns `null` while it is closed, but React keeps its state; its fields are `useState(initialItem?.name ?? "")`, `useState(initialItem ? String(initialItem.amount) : "")`, `useState(initialItem?.periodId ?? periods[0]?.id)` and `useState(initialItem?.classGroupId ?? "")`, which read the prop on the first render only, and the first render is with `initialItem = null`. So Edit has never pre-filled anything, on any fee. (On a screen that has just been refreshed after a save, `FinancePanel` shows "Loading finance records..." and remounts the panel, which is why the form is blank rather than showing the previous fee's values; with no refresh in between, a second opening shows whatever the first one was left with.)
- **Why it matters more than a blank form.** The name and the amount are `required`, so the person retypes them. The **scope is a select that already holds a value**: "All Classes (Universal)". Someone who retypes the name and the amount, and presses "Update Item", has changed a "Primary 1" fee to a universal one without being told: the form sends `classGroupId: classGroupId || null`, and `updateFeeStructure` stores a `null` it is sent (it keeps the old value only for `undefined`). The server accepts it, because it is a valid fee. The next "Generate invoices" then charges that fee to every class. That is the silent-corruption path, and the browser spec below shows the stored row: after retyping the name and the amount on the unfixed build, `classGroupId` was `null`.
- **A second defect, in the same dialog: the term select did nothing.** It is live on Edit, but `updateFeeStructureSchema` has no `periodId` (`src/lib/finance/validation.ts`; zod drops unknown keys), so a changed term was sent and silently ignored: the fee stayed in its term and the dialog said "saved". The component catalogue already said so ("a changed term is sent but dropped"), and nothing fixed it. (An earlier draft of this file said an edit could move a fee to another term. That was wrong: the server never changes the term. What the dialog did was show the FIRST term for a fee of the second.)
- **No test opened the dialog.** `grep` over `tests/`: the fee endpoints are covered by `finance.spec.ts` and `finance-access.spec.ts` (API), and no browser spec presses Edit on a fee.
- **Elsewhere.** `ClassesPanel` (`key` on `${title}|${initial}` and `{open && ...}`), `GradingPanel` (`key` per item), `ProgramAssessmentsTab` (`{open && <AssessmentForm key=...>}`) and `CardsPanel` (`key` per card) already start their forms fresh; I read each. The fee dialog is the odd one out in the finance folder.

## 3. Decisions (mine; the maintainer may correct)

- **D1. Remount on every opening, with a `key` in the parent.** `FeeStructuresPanel` counts openings (`openings` state, incremented by `handleCreate` and `handleEdit`) and passes `key={openings}` to the modal. A remount reads `initialItem` again, which is what the form's `useState(initial...)` assumes. This is what `BatchSlotsModal` (timetable), the announcement composer and `SlotEditModal` do after task 0057. The alternative, a `useEffect` that copies the prop into state when the dialog opens, was rejected as in 0057: it needs a second render, races with typing, and the repository's lint rules discourage setting state in an effect.
- **D2. A counter, not the item's id.** Keying on `editingItem?.id` would keep the form of "Add" and "Add again" the same instance, so an "Add Fee Item" that was cancelled half-typed would be shown again on the next "Add". A counter makes every opening a clean one, for Add as well as Edit.
- **D3. Not changed here: `RecordPaymentModal`, `DiscountModal`, `BatchInvoiceModal`.** They are always-mounted too, but their fields are seeded from constants or from a balance, not from an item being edited, and a save refreshes the whole panel (which remounts them). I have not shown that they misbehave, so I do not change them on a guess; C11 steps 90 to 92 exercise them, and a finding there becomes its own fix. `SpeedGraderModal` is the same: the Coursework chapter will exercise it.
- **D4. The browser spec proves it against the real database**, first against the UNFIXED build. Seeded so that every value of the fee differs from the form's defaults: a Primary 1 fee in the SECOND term. Tests: (a) Edit opens with the fee's own name, amount, term and scope; (b) changing only the amount leaves the name, term and scope as stored; (c) one fee is opened, typed into and cancelled without saving (so the panel is not refreshed), then Edit on a second fee opens with the second fee's values and not the first one's leftovers, and "Add Fee Item" afterwards opens blank; (d) retyping the name and the amount of a Primary 1 fee leaves it a Primary 1 fee in the database; (e) the term select of an existing fee is disabled and a sentence says why, while a new fee's is enabled. Each on desktop and phone.
- **D5. The term of an existing fee is shown as fixed, not made changeable.** The select is `disabled` when a fee is being edited, with the note "A fee stays in the term it was made for. To charge it in another term, add it again there." (linked with `aria-describedby`). Supporting a term change on the server was not chosen: it would change what an already-invoiced fee means, I did not look into how invoices use fee items, and nobody asked for it; an honest control is the safe choice. If the maintainer wants fees movable between terms, that is a server change with its own task.

## 4. Work breakdown

- [x] Design (this file).
- [x] The spec first; run against the unfixed build and each failure read.
- [x] The fix (D1, D2).
- [x] The spec and the existing finance specs pass on the fixed build, desktop and phone.
- [x] Docs: the component catalogue rows, the tracker.

## 5. Not in this task

- The other always-mounted finance dialogs and `SpeedGraderModal` (D3); a sweep of every hand-built modal in the app (what was read is listed in section 2); the walkthrough chapter that found this, which expects the fixed behaviour (its own PR, after this one); mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (the AlEemaan test stack on :5434, one run at a time, a production build of the branch before each run). **Gate on the final code:** `tsc --noEmit` exit 0; ESLint on the two changed components and the new spec, no findings; Prettier checked on the changed files; `pnpm build` exit 0.

**Run 1, the first three tests against the UNFIXED build (desktop and phone): 6 failed, 1 passed (setup).** Each failure was read:
- *editing a fee opens it with its own values* (both): "Fee Item Name" was `""`, expected "Sports levy".
- *changing only the amount* (both): after the amount was typed and "Update Item" pressed, the dialog stayed open. The failure screenshot shows why, and it is the defect itself: the dialog for "Sports levy" (Primary 1, 2nd term, ₦12,000) shows an empty name, the term "1st Term (2026/2027)" and the scope "All Classes (Universal)", and the browser says "Please fill out this field".
- *each opening starts from its own fee* (both): the first version failed at its very first check (blank name), so it did not separate the leftovers from the blank form. I removed that check (the first test covers it) and reran only this test against the same unfixed build (run 1b, 2 failed): opening "Library fee" after "Sports levy" had been typed into and cancelled showed **"Sports levy (half typed)"**, expected "Library fee". So the leftovers are shown, not only reasoned.

**Run 2, the same three tests and the existing finance specs on the FIXED build: 27 passed, 2 failed, 6.7 minutes.** The 2 failures were MY locator, not the product: the last test pressed `getByRole("button", { name: "Add Fee Item", exact: true })`, and the button's accessible name is "+ Add Fee Item" (a plus sign in its own span), so it waited until the test timeout. The second opening in that test, which failed before, passed. Locator corrected to match the words. **Run 3, that spec on the fixed build: 7 passed, 40.7 s.**

**Then the second defect was found** (the term select, section 2) **and two tests were added**: the retype test, and the term test. I stashed ONLY the two product files, built the unfixed state, and ran the whole spec.
- **Run 4, UNFIXED build, all five tests, desktop and phone: 10 failed, 1 passed (setup).** The new tests failed as they should: *retyping a fee's name and amount keeps it in its class*: the stored fee had `classGroup: null` where the Primary 1 id was expected (amount 13000 was stored; the class was lost). That is the silent corruption, on the stored row, on desktop and phone. *The term of an existing fee cannot be changed*: it failed on its first check, the select's value (the first term's id instead of the second's), before reaching the disabled check, so I put the disabled check first and reran only that test on the same unfixed build (run 4b, 2 failed): "Expected: disabled, Received: enabled", desktop and phone.
- The stash was popped and the diff checked (16 lines in two files, nothing else) before the fixed build.

**Run 5, the FINAL code, fixed build: 33 passed, 0 failed, 0 skipped, 2.6 minutes.** setup 1; `finance-fee-edit.spec.ts` 10 (five tests, desktop and phone); and, unchanged, `finance-a11y.spec.ts` 4 and `program-fees.spec.ts` 18.

**What the runs do not show.** The assertions that a NEW fee opens blank (name, amount, scope empty) were never reached on the unfixed build (it failed earlier in the same test), so they are guards for the behaviour after the fix, not proven regressions. D2 (a counter, not the item's id) was not tested against an id-keyed variant: it rests on the reasoning in section 3. No accessibility scan (axe) was run on the Edit dialog with its disabled select and note; `finance-a11y.spec.ts` scans the creation dialog, and it passes.

**Not run:** the whole suite; the API finance specs (`finance.spec.ts`, `finance-access.spec.ts`; no server code changed); mutation passes (deferred to the end of PHASE 2, the maintainer's call); the other three finance dialogs and `SpeedGraderModal` (D3, section 5).

**Not mine to decide, noted:** how many fees were edited through this dialog in the school's real data, and whether any lost its class that way, is not something the code can tell. If the school has edited fees by retyping them, an administrator may want to compare each fee's class with what was intended (a fee shown as "Universal / All Classes" that should be for one class) before the next batch of invoices.
