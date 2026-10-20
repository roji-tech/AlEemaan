# Shared — Components

Building blocks used across the app: the form and layout primitives (`ui/`), the app shell and navigation (`shell/`), the service-worker registration (`pwa/`), the
development-only inbox (`dev/`) and the quick-tools drawer (`tools/`).

## `src/components/ui/`

The form fields, buttons, dialog, alert, card, icon set and theme switch that other components build on, styled only with the semantic Tailwind tokens (`bg-surface`, `text-fg`, `bg-brand-strong` and so on) that `src/app/globals.css` maps to CSS variables.

| File | Description |
| --- | --- |
| `Alert.tsx` | `Alert` with `variant` `error`, `warning`, `info` or `success`, optional `title`, `id`, `className`, `announce`. Every variant has an icon as well as colour. `error` and `warning` render `role="alert"`, `info` and `success` render `role="status"`; pass `announce={false}` when the alert sits inside a live region the caller already owns, or it is read twice. |
| `Button.tsx` | `Button` with `variant` `primary` (default), `secondary`, `ghost` or `danger`, and `loading`, which shows a spinner, sets `aria-busy` and disables the button. `type` defaults to `"button"`, so a submit button must pass `type="submit"`. Minimum height 44 px. |
| `Card.tsx` | `Card`: the standard raised surface (a `div` with border, `bg-surface`, `shadow-card` and padding). Passes every `div` attribute through and appends `className`. |
| `CheckboxField.tsx` | `CheckboxField` (`label` plus any `input` attribute except `type`): a real checkbox inside a real `label`. The visible box is drawn in CSS (brand fill when checked, focus ring) over an invisible 44 x 44 px input, and the tick follows the system text colour under `forced-colors`. |
| `Dialog.tsx` | Client component: a modal on the native `<dialog>` (`open`, `onClose`, `title`, `description`, `wide`). The children are mounted only while `open`. It does not close on an outside click, so a half-filled form survives a stray tap. `onClose` is called by the Close button and by the dialog's `close` event (Escape, or the owner setting `open` to false), so keep it idempotent. On open, focus goes to the element marked `data-initial-focus`, otherwise to the first `input`, `select` or `textarea`. |
| `icons.tsx` | 36 inline SVG icon components (`EyeIcon`, `SpinnerIcon`, `AlertTriangleIcon`, `HomeIcon`, `UsersIcon`, and so on), with no icon library. Each takes SVG props, defaults to 20 px, strokes in `currentColor` and is `aria-hidden`, so the meaning must come from adjacent text or an `aria-label` on the control. `CheckCircle2Icon` is exported but nothing imports it. |
| `PasswordField.tsx` | Client component: a `TextField` of type `password` with a show/hide button (`aria-pressed`, `aria-controls`, label "Show password" / "Hide password"). Takes the `TextField` props except `type` and `trailing`; always sets `autoCapitalize="none"` and `spellCheck={false}`, which the caller cannot override. |
| `SelectField.tsx` | `SelectField`: a labelled native `<select>` wired like `TextField` (`label`, `options` as `{ value, label }[]`, `hint`, `error`, `hideLabel`). `hideLabel` keeps the label as the accessible name but hides it, for filter bars. A placeholder is an ordinary option with an empty `value`. |
| `TextField.tsx` | `TextField`: a labelled `<input>` with the accessibility wiring done once: a real `label`, `hint` and `error` linked through `aria-describedby`, `aria-invalid` on error. Extra props: `trailing` (inside the right edge), `labelAction` (right end of the label row), `ref`. The `error` replaces the `hint` on screen. Generates an `id` when none is given. |
| `ThemeProvider.tsx` | Client component: `ThemeProvider` (`initialTheme`, read from the `theme` cookie by the root layout) and `useTheme()` returning `{ theme, toggleTheme }`, which throws outside the provider. `toggleTheme` sets `data-theme` on `<html>` and writes the `theme` cookie (path `/`, one year, `SameSite=Lax`, `Secure` only on https). No inline script is involved. |
| `ThemeToggle.tsx` | Client component: the icon button that calls `toggleTheme`. Its accessible name says what will happen ("Switch to light theme" / "Switch to dark theme") and the icon shows the theme you would switch to. Used by `AppShell` and `AuthShell`. |

## `src/components/shell/`

The frame around every signed-in page (the `(app)` route group): sidebar, top bar, phone tab bar, and the navigation list they are all built from.

| File | Description |
| --- | --- |
| `AppShell.tsx` | The frame the `(app)` layout wraps every signed-in page in (`user: ShellUser` with `name`, `email`, `roleLabel`, `isAdmin`, `isSuperAdmin`, `isTeacher`). From `lg` up: a 248 px sidebar (`SidebarNav`, signed-in person) and a 60 px top bar (`Breadcrumb`, `ThemeToggle`, `ProfileMenu`). Below `lg`: `MobileNav`. Also mounts `SessionRevalidator` and `QuickToolsTrigger`, and puts a skip link to `#main` first. Sidebar, top bar and tab bar are hidden when printing. It only displays who is signed in; every page still checks the session itself. |
| `Breadcrumb.tsx` | Client component: the two-level crumb in the top bar, shown from `lg` up. The first crumb is the `section` prop; the second is `PAGE_LABELS[pathname]`, an exact match, so a path that is not listed (including any sub-path of a listed page) shows only the section. `aria-current="page"` marks the last crumb. |
| `MobileNav.tsx` | Client component: phone navigation below `lg`. A floating bottom tab bar of the `navFor` entries that are not `inMore`, plus a "More" button that opens a native modal `<dialog>` sheet with the `inMore` entries, any entry without an `href` (with a Soon tag), Profile (`/account`) and Sign out (`useSignOut`, error shown inline). A tap outside the sheet and any path change close it. |
| `nav.ts` | The single source of truth for navigation. `NAV` (15 entries: `label`, `href`, `icon`) with flags `superAdminOnly` (Branches, Settings), `adminOnly` (Academics, Communication, Finance, Approvals, Question bank, Users), `staffOnly`, meaning administrators or teachers (Students, Coursework, Attendance, Results, Timetable), and `inMore` (phone More sheet). Overview and Announcements are unflagged. `navFor(isAdmin, isSuperAdmin, isTeacher)` filters it; the flags only hide links, the page and API enforce access. Also `PAGE_LABELS`, `isActive`, `FOCUS_RING` and `initialsOf`. |
| `PageHeader.tsx` | `PageHeader` (`title`, optional `description` and `actions`): the page's one `<h1>`, a one-line description under it and an action area on the right (stacked below `sm`). Section headings below it should be `<h2>`. Used by the `(app)` pages. |
| `ProfileMenu.tsx` | Client component: the top-bar account menu (`name`, `email`, `roleLabel`, `isAdmin`). A disclosure, not an ARIA menu, holding Profile (`/account`), Sign out (`useSignOut`, error shown inline) and, when `isAdmin`, a non-link "Settings" entry with a Soon tag, although `/settings` is built and is in `NAV` for superadmins. Closes on Escape, an outside click, Tab leaving the panel and navigation. |
| `SidebarNav.tsx` | Client component: the desktop sidebar list built from `navFor(isAdmin, isSuperAdmin, isTeacher)`. The current page gets `aria-current="page"` (via `isActive`: the exact path or a sub-path) and the active style keys off that attribute. An entry with a null `href` renders as plain text with a `SoonTag`; no `NAV` entry is null today. |
| `SoonTag.tsx` | `SoonTag`: a decorative "Soon" pill plus screen-reader text ", coming soon". Rendered by `SidebarNav` and `MobileNav` for entries without an `href`, and by `ProfileMenu` for its Settings entry. |

## `src/components/pwa/`

Offline support: the registration of the service worker and the offline indicator.

| File | Description |
| --- | --- |
| `ServiceWorkerRegister.tsx` | Client component, mounted by `QuickToolsTrigger` and so only inside the app shell: registers `/sw.js` (`public/sw.js`) on mount, ignoring a failed registration, and shows a fixed "Offline Mode — Cached resources available" status pill while `navigator.onLine` is false. It starts as online and reads `navigator.onLine` only after mount, so the server HTML never contains the pill. The worker is network-first for page navigations with the cached `/offline` page as the fallback, cache-first for images, fonts and styles, and ignores `/api/` and non-GET requests. |

## `src/components/dev/`

Development-only affordances, rendered only where `devToolsEnabled()` (`src/lib/dev-tools.ts`) is true, so never in production.

| File | Description |
| --- | --- |
| `DevEmailInbox.tsx` | Client component mounted by the root layout only where `devToolsEnabled()` is true: a mail button (bottom right) that opens a dialog, marked "Dev", listing the messages the `inbox` email transport captured, with a message view, "Clear all" (`DELETE`) and an unread badge (seen ids kept in `sessionStorage`). Polls `GET /api/v1/dev/email-inbox` every 4 s while the answer is good and removes itself on a 404. On a staging deployment (401) it asks for the dev tools token, keeps it in `sessionStorage` and sends it as `x-dev-tools-token`. Bodies are shown as text; only `http(s)` URLs become links. |

## `src/components/tools/`

The Quick Tools panel opened from the floating wrench button in the app shell (calculator, student lookup, scratchpad); nothing in it is saved on the server.

| File | Description |
| --- | --- |
| `calculator/CalculatorTool.tsx` | Client component: the Calculator tab. An on-screen keypad only (no keyboard entry, no backspace, `C` clears the display) feeding `evaluateArithmetic` from `lib/tools/calculator`; keeps the last 10 results and shows 3. The fee helpers (`−5% Sibling`, `−10% Staff`, `+7.5% VAT`, hard-coded) apply `applyDiscountWaiver` or `applyTaxSurcharge` to the current result but leave an expression such as `250000 − 5%` on screen, and `=` evaluates that as 250000 − 0.05. |
| `QuickNotesTool.tsx` | Client component: the Scratchpad tab. A textarea saved on every keystroke to `localStorage` under `aleemaan_quick_notes` (one note per browser: the key has no user id and sign-out does not clear it), with Copy, Clear and a character count. Storage and clipboard errors are swallowed. Nothing is sent to the server. |
| `QuickToolsDrawer.tsx` | Client component: the Quick Tools panel (`open`, `onClose`, `initialTool`, default `calculator`) with three tabs: Calculator, Student Lookup, Scratchpad. It renders nothing while closed, so a tool's state is lost on close (only the notes persist). A hand-built `role="dialog"` with `aria-modal`: Escape and a backdrop click close it, but there is no focus trap and focus does not return to the trigger, unlike `ui/Dialog` and the `MobileNav` sheet. |
| `QuickToolsTrigger.tsx` | Client component mounted once by `AppShell`: the floating wrench button that opens `QuickToolsDrawer`. Ctrl/Cmd+K and Alt+T toggle it from anywhere on the page and call `preventDefault`. A `?tool=calculator`, `lookup` or `scratchpad` query present when a shell page first loads opens the drawer on that tool (the shortcuts in `src/app/manifest.ts` use it); a later in-app navigation to such a URL does not. Also mounts `ServiceWorkerRegister`, so the service worker is registered only on shell pages. |
| `students/StudentLookupTool.tsx` | Client component: the Student Lookup tab. From 2 characters and after a 300 ms pause it calls `GET /api/v1/students?q=…&status=live&limit=10` (allowed for administrators, teaching and non-teaching staff) and lists name, admission number, class, arm and branch. A picked student shows branch, gender, class, session, guardian name with `tel:` and `mailto:` links, and a link to `/students/[id]`. Errors are swallowed: a failed search leaves the previous results or "No students found". A student without a branch shows as "Main Branch". |
| `types.ts` | `QuickToolId` (`calculator`, `lookup`, `scratchpad`), used by the trigger and the drawer, and the `QuickToolDefinition` interface, which nothing imports (the drawer builds its tab list inline). |
