# Public pages and app-level files — Pages

Everything a person can reach without being signed in to the school app (sign-in, account recovery, invitations, email confirmation, public verification of a document, the
first-run set-up wizard, the landing and offline pages), then the files of `src/app/` that wrap every page (root layout, web manifest, icons, global styles).

## Sign-in, recovery and set-up

| Route | File | Description |
| --- | --- | --- |
| `/login` | `login/page.tsx` | Signed-out visitors. A signed-in person is redirected to `/dashboard`; when first-run setup is not complete (`isSetupComplete() === false`) the visitor is redirected to `/setup`. Renders `LoginForm` (password step, then two-step verification) inside `AuthShell`. `force-dynamic`. |
| `/forgot-password` | `forgot-password/page.tsx` | Signed-out visitors only: a signed-in person is redirected to `/dashboard` (they change the password from `/account`). Renders `ForgotPasswordForm` inside `AuthShell`; the confirmation is the same for every address. `force-dynamic`. |
| `/reset-password` | `reset-password/page.tsx` | Anyone holding a reset link; the page checks no session and does not redirect signed-in people. Renders `ResetPasswordForm` inside `AuthShell`, which reads the token from the URL fragment. `referrer: no-referrer`, `force-dynamic`, `noscript` note. |
| `/accept-invite` | `accept-invite/page.tsx` | Anyone, signed in or not; the page checks no session. The link in an invitation email opens it: `AcceptInviteForm` inside `AuthShell` reads the token from the URL fragment and asks the API what to offer (create the account, sign in first, join as the signed-in invitee, or sign out first). `referrer: no-referrer`, `force-dynamic`, and a `noscript` note that JavaScript is required. |
| `/confirm-email` | `confirm-email/page.tsx` | Anyone, signed in or not. The link mailed to the NEW address of an email change opens it: `ConfirmEmailForm` inside `AuthShell` reads the token from the URL fragment and waits for a click before spending it. `referrer: no-referrer`, `force-dynamic`, `noscript` note. |
| `/verify/[token]` | `verify/[token]/page.tsx` | Public, no sign-in. Server-renders `verifyToken` for the code in the URL: "not found", "exists but does not match the school's record" (`genuine` false), or "This result is genuine" with school, branch, class, term and publish date, plus pupil name, subject, mark and grade as the branch's verification settings allow (default: pupil as first name and last initial, and subject; no mark or grade). `no-referrer` and `noindex`. Unlike `GET /api/v1/verify/[token]` it is not rate limited. |
| `/setup` | `setup/page.tsx` | Anyone while first-run setup is incomplete. Once `isSetupComplete()` is true it redirects to `/login`; when the database read fails (unknown) it still shows the form. Renders `SetupWizardForm` with `requiresToken` (is `SETUP_TOKEN` set) and `insecureBaseUrl` (a production build whose `APP_URL` is not https). `force-dynamic`. |

## Landing and offline

| Route | File | Description |
| --- | --- | --- |
| `/` | `page.tsx` | A pure router that never renders UI (`force-dynamic`). Anyone may open it. A visitor with a session (`getSession()`) is redirected to `/dashboard`; otherwise, if `isSetupComplete()` is `false` (first-run setup not finished), to `/setup`; otherwise to `/login`. When the setup check cannot reach the database it returns `null`, and the visitor goes to `/login`. |
| `/offline` | `offline/page.tsx` | A plain "You are currently offline" card with a "Try Reconnecting" link to `/`; no data and no session check. Anyone may open it; the service worker (`public/sw.js`) lists it for precaching and answers a failed page navigation with it. Its text points to the Quick Tools dock, which this page does not render: `QuickToolsTrigger` is mounted only by `AppShell`. |

## App-level files (`src/app/`)

| Route | File | Description |
| --- | --- | --- |
| `layout (root)` | `layout.tsx` | The root layout of every page, signed in or not; no session check. Sets `<html lang="en">` and `data-theme` from the `theme` cookie (reading it makes every page dynamic, which the nonce-based CSP needs anyway), loads Geist and Geist Mono through `next/font/google`, wraps the children in `ThemeProvider`, and mounts `DevEmailInbox` only when `devToolsEnabled()`. Metadata: title template `%s · AlEemaan`, the brand description, the manifest link `/manifest.webmanifest`, and `appleWebApp` (capable, default status bar). |
| `metadata: web manifest` | `manifest.ts` | Generates the web app manifest served at `/manifest.webmanifest`. Name "AlEemaan School Management", `display: standalone`, `start_url` `/students` (not the `/dashboard` that `/` sends people to), `theme_color` `#0f172a`, `background_color` `#ffffff`, icons `/icon` (512 px, `any`) and `/apple-icon` (180 px, `maskable`), and four shortcuts: Calculator, Lookup and Notes (`/students?tool=…`, which open Quick Tools) and Attendance (`/attendance`). Anyone may fetch it. |
| `metadata: app icon` | `icon.tsx` | Generates the 512 x 512 PNG served at `/icon` with `ImageResponse`: a dark (`#0f172a`) rounded square with a white "A" (hard-coded letter and colours, not read from `brand`). Linked as the page icon and listed in `manifest.ts` as the `any` icon. Anyone may fetch it. |
| `metadata: Apple touch icon` | `apple-icon.tsx` | Generates the 180 x 180 PNG served at `/apple-icon` with `ImageResponse`: a dark (`#0f172a`) rounded square with a white "A" (letter and colours hard-coded, not read from `brand`). Linked as the page's Apple touch icon and listed in `manifest.ts` as the `maskable` icon. Anyone may fetch it. |
| `metadata: favicon` | `favicon.ico` | Binary Windows icon file with four images (16, 32, 48 and 256 px), served by Next at `/favicon.ico`; unchanged since the scaffold commit. `src/proxy.ts` leaves it out of the CSP matcher. |
| `styles: global stylesheet` | `globals.css` | The Tailwind entry (`@import "tailwindcss"`, then `brand.css`). Design tokens as CSS variables for dark (the default) and light (`:root[data-theme="light"]`): `canvas`, `surface`, `field`, `line`, `fg`, the danger, warn, info and ok sets, and shadows. `@theme inline` maps them to the names components use (`bg-canvas`, `text-fg-muted`, `shadow-card`) and sets Geist as the font. Also `.brand-pattern` (sign-in panel grid), a global reduced-motion override and an A4 print rule (12 mm margins, white page) for report cards. |
| `styles: brand colours` | `brand.css` | AlEemaan's brand colours as CSS variables: `--brand` (`#2e8b57`), `--brand-strong` and its hover (filled buttons with white text, 4.94:1), `--brand-deep` (sign-in panel), and `--brand-fg` and `--brand-tint`, which change for the light theme. One of only two per-repo brand files (the other is `src/lib/brand.ts`). Imported by `globals.css`, so it is bundled into the one stylesheet and is not served on its own URL. |
