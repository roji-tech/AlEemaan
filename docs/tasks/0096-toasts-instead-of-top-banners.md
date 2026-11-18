# 0096: Toasts for the outcome of an action, instead of a banner at the top of the page

- **Period / Focus:** 2026-11-18 (the maintainer: "instead of putting the error and success messages on the top, we use something like Sonner toast")
- **Status:** Built; the record is section 6
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/toasts` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

What a person just did, and how it went, appears in the corner for a few seconds and goes by itself. It no longer pushes the whole page down, and it is not lost off-screen when they have scrolled.

## 2. Decisions

- **D1. Our own toaster, not Sonner.** The app's content-security policy refuses inline styles and Sonner injects a style element; a package would also add to every page's bundle. `components/ui/Toaster.tsx` uses classes only and keeps what a screen reader hears under our control.
- **D2. One line per screen.** `useNotice()` is a drop-in for `useState<Notice>(null)`: with a toaster mounted, `setNotice({ variant, text })` shows a toast and `notice` stays `null`, so the old banner never draws; with none (a page outside the app) it is the plain state it replaced, so nothing breaks. 33 screens changed by that one line (and their now-unneeded `Notice` imports); the banner markup stays as the fallback.
- **D3. Behaviour.** Success 5 s, info 6 s, warning 9 s, error 12 s; hovering or focusing a toast holds it; always closable with a 44 px button; at most four on screen; the same message is not stacked twice (the new one replaces the old, so it is announced again); an error or warning is `role="alert"`, the rest `role="status"`; the entrance is a short slide the reduced-motion setting removes. Top right under the header, so the background-save panel (task 0095, bottom right) is never covered.
- **D4. What stays inline.** A failure to LOAD a list (`error` state) is not an outcome of an action: it replaces the content and stays where it is. Form errors stay in their dialogs.

## 3. Tests

Unit `tests/unit/toast-model.spec.ts` (lifetimes, roles, limit, repeats, no mutation); browser `tests/e2e/toasts.spec.ts` (archiving a class shows a toast in the top right and the page does not move; it can be closed and one that is not goes by itself; hovering holds it; axe).

## 4. Build record and tests

(filled in with the real counts when the suites have run)
