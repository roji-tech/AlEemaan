# 0060: The Finance screens used raw red and green, below the contrast WCAG AA asks for

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's chapter C11 Finance, task 0033: the axe observer logged ONE `color-contrast` blocker at `/finance`, step 85, light theme)
- **Status:** Done
- **Priority:** Medium (a school-facing screen for money, in a project that holds itself to WCAG 2.2 AA; nothing is stored wrongly)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/fix-finance-contrast` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The Finance components hard-code Tailwind's `red-500` (six error boxes and the fee row's **Delete** button) and `green-400` (the batch dialog's success message), where the rest of the application uses the semantic tokens `danger-*` and `ok-*`. Those raw colours do not reach 4.5 to 1 for text this size. Use the tokens, and prove every state of Finance in both themes with a browser spec.

## 2. Context

- **Found by the walkthrough, and why nothing else had.** The observer logged one blocker at step 85, "color-contrast ... (1 element(s))", in the light pass. A first scan of that screen in a spec found **no** violation: the screen is fine until the pointer is on it. After "Create Item" the walkthrough's pointer rests on the new fee's row, which has `hover:bg-surface-2/40`; with the row hovered, the **Delete** button (`text-red-500`) measures 3.67 to 1 in the light theme (3.80 with nothing hovered, 3.17 with the button itself hovered) and, in the dark theme, 4.37 and 4.08 to 1 where 4.5 is asked. The existing `finance-a11y.spec.ts` scans without hovering anything and in the dark theme only, which is why it passes. (The first diagnostic scan also asked for the light theme with the browser's colour-scheme setting, and got the DARK theme, because the app reads a `theme` cookie; the spec sets that, as `program-fees.spec.ts` does.)
- **The whole family, measured on the unfixed build** by the new spec, which scans every state of Finance in both themes (light theme, seven findings; dark theme, five):

  | State | Colours | Ratio |
  | --- | --- | --- |
  | an error box (payment, waiver, new fee) | red-500 on a pale red (light) / on the dark tint | 3.30 / 4.37 |
  | the card "Failed to fetch" (the screen could not load) | red-500 on pale red | 3.14 (light) |
  | the fee row's Delete, row hovered / button hovered | red-500 | 3.67 and 3.17 (light), 4.37 and 4.08 (dark) |
  | **the batch result "Invoicing Complete..."** | `green-400` (#05df72) on a pale green | **1.63** (light) |

  The success message of the batch dialog, the one that task 0059 made visible, was close to unreadable in the light theme: 1.63 to 1.
- **The rest of the app already has the tokens**: `text-danger-fg` 50 uses, `bg-danger-bg` 39, `border-danger-line` 37, `text-danger-text` 26 (inline field errors), `ok-*` for success. Finance was the only place with raw red or green on text.

## 3. Decisions (mine; the maintainer may correct)

- **D1. Use the tokens the other screens use.** Error boxes: `border-danger-line bg-danger-bg text-danger-fg` (the pairing 37 other places use). The inline "Could not pay in full" message in the invoice dialog: `text-danger-text`, the inline-error token. The batch result: `border-ok-line bg-ok-bg text-ok-fg`. The loading-error card: the danger box.
- **D2. The fee row's Delete uses `text-danger-fg border-danger-line hover:bg-danger-bg`**, as the Delete of a coursework assignment already does. In the dark theme `danger-fg` is a pale pink rather than a red, so the button reads less "red" there; `text-danger-text` would keep the red look and also pass. I chose consistency with the other Delete buttons; the maintainer may prefer the other.
- **D3. Not changed: the status pills** (`bg-emerald-500/20 ... text-ok-fg`, `bg-amber-500/20 ... text-warn-fg`) and the discount row. They already use the text tokens, and the spec scans them (the dashboard has a paid, a part-paid and an unpaid row; the invoice shows a discount line) in both themes and finds nothing.
- **D4. The spec: `color-contrast` only, every state, both themes, desktop and phone, and it collects before it asserts.** One test per theme walks the dashboard (a row hovered), an invoice with a receipt and a discount, the payment dialog with its error, the waiver dialog with its error, the batch dialog with its result, the fee schedule (row hovered, Delete hovered), the fee dialog with its error and the loading-error card, scanning after each, and fails with the list of every violation, so a failing run is the whole to-do list. The rule is `color-contrast` only: the whole-WCAG scans stay in `finance-a11y.spec.ts`. Before each scan the spec waits for the running colour transitions to finish (the same reason as `tests/support/theme.ts`: axe samples whatever is painted).
- **D5. Two of its states needed care to reach.** The waiver's error needs an amount EQUAL to the invoice's total: anything above it never reaches the form's message, because the input has `max` and the browser stops the submit with its own bubble first (equal passes `max` and is refused by the form). The loading-error card is reached by aborting the invoices request and reloading.

## 4. Work breakdown

- [x] Design (this file; written after the diagnosis and the spec, before the final gate and run).
- [x] The spec; run against the unfixed build and each violation read.
- [x] The fix (D1, D2).
- [x] The spec and the existing finance specs pass on the fixed build, desktop and phone.
- [x] Docs: the tracker.

## 5. Not in this task

- Thirteen other uses of raw palette colours outside Finance (the video guide, the offline page, attendance, the results review, a few tools, the service worker banner). Many pair a light and a `dark:` variant and none has been found failing; I did not scan them. The walkthrough's observers will flag any that do as the chapters reach them.
- A lint or test that bans raw palette colours: the thirteen above show it would need a decision on what is allowed.
- The walkthrough chapter that found this (its own PR); mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (the AlEemaan test stack on :5434, one run at a time, a production build of the branch before each run; `tsc --noEmit`, ESLint on the finance components and the new spec, Prettier and `pnpm build` all clean).

**Diagnosis first (throwaway specs, not committed).** A scan of the fee schedule with a fee on it found nothing. A scan that asked for the "light theme" through the browser's colour-scheme setting found the DARK theme (the app reads a `theme` cookie), which is why the first runs showed `#151e31` backgrounds. With the theme set properly and the pointer on the row, the one element was the fee's Delete button, in both themes (section 2).

**Run 1, the new spec against the UNFIXED build (desktop and phone): 4 failed, 1 passed (setup).** The first draft failed at the waiver step, not at contrast: the waiver amount I typed (999999) is above the input's `max`, so the browser's own bubble stopped the submit and no alert was ever shown (section 3, D5). That was my spec, and I corrected it (an amount equal to the invoice's total). **Run 2, the corrected spec, unfixed build: the same 4 failed, now at the contrast assertion, each listing its violations.** Light theme, seven: the payment dialog's error, the waiver dialog's error and the fee dialog's error (red-500 on pale red, 3.30:1 each), the batch dialog's result (**green-400 on pale green, 1.63:1**), the fee row's Delete with the row hovered (3.67:1) and with the button hovered (3.17:1), and the loading-error card (3.14:1). Dark theme, five: the three error boxes (4.37:1) and the Delete, row hovered (4.37:1) and button hovered (4.08:1). The phone runs failed the same way.

**Run 3, the FIXED build: 23 passed, 0 failed, 2.3 minutes.** setup 1; `finance-contrast.spec.ts` 4 (both themes, desktop and phone); and, unchanged, `finance-a11y.spec.ts` 4, `finance-fee-edit.spec.ts` 10 and `finance-refresh.spec.ts` 4.

**What the runs do not show.** The spec scans `color-contrast` only; the whole-WCAG scans remain `finance-a11y.spec.ts`'s, in the dark theme and without hovering. A state it does not reach is not scanned (for instance an invoice that is PAID IN FULL, the print view, or the error card of a failed payment request). The Delete button now reads as a pale pink in the dark theme (D2); that is a look I did not show anyone. The disabled and the focus-ring colours were not measured.

**Not run:** the whole suite; the Programs fees screens (`program-fees.spec.ts`, a different set of components that were not changed); mutation passes (deferred to the end of PHASE 2, the maintainer's call); the walkthrough's C11 chapter on this build (the observer's blocker should be gone; to be confirmed by its next run).

**Also in this change (documentation only):** the maintainer said on 2026-11-12 that there is no production data yet, so the "for the maintainer" caveats of tasks 0057 and 0058 (announcements saved as drafts, periods overwritten, fees retyped to every class) are closed in their task files and in the tracker.
