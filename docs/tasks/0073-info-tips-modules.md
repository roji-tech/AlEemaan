# 0073: Info icons, the next modules (Programs, Forms, Question bank)

- **Period / Focus:** 2026-11-13 (the maintainer asked on 2026-11-12 for info icons in many places; task 0054 placed the first eight, this places five more)
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/info-tips-modules` / PR into `dev`
- **Started:** 2026-11-13

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Continue the rollout of task 0054 into the modules the walkthrough (task 0033) has now walked: Programs, Forms and the Question bank. The rules are those of 0054: a tip says what a thing IS or DOES in plain words and adds what the screen does not already print; it is a sibling of what it explains, never inside it; it is checked against what the screen really does before it goes in.

## 2. Decisions

- **D1. Five tips, not twenty.** Most of these screens already print an explanation (a hint under the field, a line under the heading), and a tip that repeats it is clutter (0054 D2). Five places had something true, useful and not printed. The ones left out and why are in section 4.
- **D2. `TextField` gets the `info` prop** because its first screen needs it (0054 D8): the same shape as `SelectField`'s (the label and the icon share one row on the left; the icon is a sibling of the label, so the accessible name is the label alone). It is ignored with `hideLabel`.
- **D3. The 24 px touch target is approved by the maintainer (2026-11-12).** 0056 called it "the maintainer's call"; it is decided.

## 3. What was placed, and what each was checked against

| Key | Where | Checked against |
| --- | --- | --- |
| `programs.lockRelease` | `TextField` "Lock is handed back after (seconds)" (a program's Settings, Progress records) | `ProgressEntryDialog.tsx`: opening an entry takes its lock, closing it sends `viewing`, which starts the countdown; `ProgressRecordView.tsx` shows "<name> is editing this entry." to others, who cannot change it; the setting's own hint says only "When someone presses Viewing. 0 hands it back at once." and a walkthrough run (C31) found that a supervisor arriving at once is refused until it runs out |
| `programs.verify` | Beside the "Verify entries before families see them" checkbox | `statusAfterSave` (`lib/programs/progress-rules.ts`): with it on a new entry is a draft, a writer hands it in, a verified one goes back to submitted when edited; the portal shows only verified entries; a returned entry goes back with a comment (C31, C32) |
| `programs.weekGrid` | Beside "Week of ..." on the week grid | `weekDates` (one column for each day the template covers), `entryDayProblem` ("That is before this person's place began." and a future day), the grid disables a day after today (C31 step 310) |
| `forms.marking` | Beside the "Marking" heading (Forms, Marking tab) | `MarkingQueue.tsx` / `MarkingDialog.tsx`: only the answers marked by hand wait; a second sitting shows what was given; only what changed is sent; "Marking history" lists who gave what (C34) |
| `bank.reviewers` | Beside "Current reviewers" (Question bank, Reviewers tab) | a reviewer is named for a subject (C22); a reviewer may write questions and cannot approve their own (C23 step 226) |

## 4. Not placed, and why

- Users "May approve results": the dialog already prints what it does and who may set it.
- Program settings "Hijri date adjustment": its hint says it all.
- Finance "Payment Rules": the screen prints the rule, the stricter-branch rule and the pay-in-full option.
- Practice setup "Show the answer": the two choices say it in their labels, and the result screen says the rest.
- Settings "Results approval": the sections and the approvers already have a line under their headings.

## 5. Tests

- Unit `tests/unit/info-tips.spec.ts` (every sentence held to the rules, none unused): run.
- Browser `tests/e2e/info-tips.spec.ts` has the two icons that need no seeded data (`forms.marking`, `bank.reviewers`) as places, so each is checked for: beside, never inside, a heading or label; its words are the registry's; it moves nothing. The three Programs icons sit behind a seeded program and a person's record; they are seen by the walkthrough, whose axe scan runs on those pages (C31).
