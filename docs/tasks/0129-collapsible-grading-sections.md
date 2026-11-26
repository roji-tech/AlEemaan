# 0129: each section of Assessment and grading folds

- **Status:** Done: built, browser tests pass (27 on desktop and phone with the related scheme specs). No migration, no API change.

The maintainer (2026-11-26, Academics > Assessment and grading, with a screenshot of the long page): "can you make each section collapsible: Assessment schemes, Grade scales, Scheme levels".

## Decisions
1. **One shared component**, `CollapsibleSection` (`src/components/ui/`), not three copies: a heading that holds one real button (`aria-expanded`, `aria-controls`). The heading keeps its name (the title), Enter and Space work as on any button, and the folded body is `hidden`, so its controls leave the tab order and the accessibility tree. The native `<details>` was not used: the heading, the info icon and the section's own buttons sit on one row, which `<summary>` does not allow without nesting interactive controls inside it.
2. **The body stays mounted when folded**, so what a section loaded, and an open notice, is not lost by folding it.
3. **The section's own buttons ("New scheme", "Use the school-wide scheme", "New grade scale", "New school-wide scheme") show only while it is open.** A folded section is one line. The info icon stays.
4. **Open by default; the choice is remembered per browser** under `collapse:<id>` in local storage (try/catch: with storage blocked it simply stays open, and nothing depends on it). First render is open on server and client; a remembered fold is applied right after hydration, so a folded section may show open for an instant.
5. **Dialogs sit outside the folded body** (a dialog inside a hidden element cannot be shown). Scheme levels' dialog was moved out of its section for this; the grading dialogs already were.

## Not done
The Grading tab's other blocks (the "Show archived" checkbox, the branch picker) are not sections and stay as they are. No "collapse all / expand all" control.

## Tests
`tests/e2e/collapsible-sections.spec.ts`: all three start open, each heading is still named by its title, a dialog opens from an open section, mouse and keyboard (Enter, Space) fold and unfold, the folded body is hidden and the section's button goes with it, sections fold independently, the choice survives a reload, axe in three states; desktop and phone.
