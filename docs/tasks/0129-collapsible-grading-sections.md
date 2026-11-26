# 0129: each section of Assessment and grading folds

- **Status:** In Progress: follow-ups built; tests running. No migration, no API change.

The maintainer (2026-11-26, Academics > Assessment and grading, with a screenshot of the long page): "can you make each section collapsible: Assessment schemes, Grade scales, Scheme levels".

## Decisions
1. **One shared component**, `CollapsibleSection` (`src/components/ui/`), not three copies: a heading that holds one real button (`aria-expanded`, `aria-controls`). The heading keeps its name (the title), Enter and Space work as on any button, and the folded body is `hidden`, so its controls leave the tab order and the accessibility tree. The native `<details>` was not used: the heading, the info icon and the section's own buttons sit on one row, which `<summary>` does not allow without nesting interactive controls inside it.
2. **The body stays mounted when folded**, so what a section loaded, and an open notice, is not lost by folding it.
3. **The section's own buttons ("New scheme", "Use the school-wide scheme", "New grade scale", "New school-wide scheme") show only while it is open.** A folded section is one line. The info icon stays.
4. **Open by default; the choice is remembered per browser** under `collapse:<id>` in local storage (try/catch: with storage blocked it simply stays open, and nothing depends on it). First render is open on server and client; a remembered fold is applied right after hydration, so a folded section may show open for an instant.
5. **Dialogs sit outside the folded body** (a dialog inside a hidden element cannot be shown). Scheme levels' dialog was moved out of its section for this; the grading dialogs already were.

6. **Follow-ups the same day (the maintainer):** "make Grade scales the last", then "make A scheme for one class collapsible". The tab now reads Assessment schemes, Scheme levels, Grade scales: `GradingPanel` takes `betweenSections` (the Scheme levels panel, which has its own state) and shows it between its two sections. The two parts inside Scheme levels, "School-wide default" and "A scheme for one class", are `CollapsibleSection`s too (`headingLevel={3}`: an `h3` in the smaller type, so the walkthrough's `h3` "School-wide default" still resolves). "School-wide default" was folded as well, though only the class part was named, so the two parts of one section behave alike.

7. **Switches (the maintainer, same day):** the two "show" checkboxes, "Show archived schemes and grade scales" (grading tab) and "Preview with results that are not published yet" (Results > Report cards), are now switches (`SwitchField`, a real checkbox input with `role=switch`). Other checkboxes are choices submitted with forms and were left alone.

8. **Pending invitations show when they were sent (the maintainer, same day):** each row in Users > Pending invitations gets a line "Sent 26 Nov 2026, 14:20" (a draft says "Saved ..."), in the viewer's time zone, from `sentAt` (creation time for an old row without one). `sentText` in `components/users/model.ts`. The history list already showed its own dates.

## Not done
The Grading tab's other blocks (the "Show archived" checkbox, the branch picker) are not sections and stay as they are. No "collapse all / expand all" control.

## Tests
`tests/e2e/collapsible-sections.spec.ts`: all three start open, each heading is still named by its title, a dialog opens from an open section, mouse and keyboard (Enter, Space) fold and unfold, the folded body is hidden and the section's button goes with it, sections fold independently, the choice survives a reload, axe in three states; desktop and phone.
