# 0104: The app can be installed on a phone: a manifest each address earns, the icons Chrome asks for, and an Install button

- **Period / Focus:** 2026-11-18 (the maintainer: "check on the status of the PWA installation, it seems not to be bringing it up on my phone", then "OK" to the proposed fix). The phone in their screenshots is an Android phone.
- **Status:** Built; the run is recorded in section 6
- **Priority:** High (parents and pupils are meant to use the portals from a phone)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/pwa-install` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What was wrong (read from the live site, 2026-11-18)

Checked on `aleemanschool.com`, `parent.`, `student.` and `staff.`: the manifest, both icons and `sw.js` answer 200 on every address, the page links the manifest, the service worker is registered, and the CSP blocks none of it. So the files are there; what Chrome reads in them is the problem:

1. **No 192 x 192 icon.** Chrome offers "Install app" only when the manifest has icons of at least 192 and 512 px. It had one 512 and one 180.
2. **The 180 px icon was declared `maskable`** although the picture is not padded for it: on a phone the launcher would crop the logo.
3. **`start_url` was `/students`**, a staff page, for every address. An app installed from `parent.` or `student.` would have opened a page those people cannot see.
4. **No `id` and no `scope`.** Without an `id` the browser makes one from `start_url`, so changing the start page later makes a second app.
5. **The service worker was registered only inside the signed-in shell** (`ServiceWorkerRegister` was mounted by `QuickToolsTrigger`, which `AppShell` mounts). The pages people install FROM, the sign-in pages and the website, never registered it. It is now mounted once by the root layout.
6. **Nothing in the page offers the install.** Chrome's own mini bar is shown at its discretion and is easy to dismiss for good; there was no button of ours, and nothing told an iPhone user (Safari never shows an install prompt) what to do.

## 2. Decisions

- **D1. One manifest per address** (`src/app/manifest.ts` reads the request's host with `hostFromHeaders`, the same way the proxy does, and asks `manifestFor`, a pure function in `src/lib/pwa/manifest.ts`):

  | Address | Name | Starts at | Shortcuts |
  | --- | --- | --- | --- |
  | `parent.` | AlEemaan Parents | `/portal` | none |
  | `student.` | AlEemaan Students | `/portal` | none |
  | `staff.` | AlEemaan Staff | `/dashboard` | the four tools |
  | `admin.` | AlEemaan Admin | `/dashboard` | the four tools |
  | the school's own host, portals on | AlEemaan School Management | `/select-role` | none |
  | any host, portals off (development, a preview URL) | AlEemaan School Management | `/dashboard` | the four tools |

  The pupils' and parents' start page is `/portal`, as the maintainer said; when the "one door" change (task 0094) turns `/portal` into a page that sends signed-out visitors to the address's own `/login`, the installed app follows without a change here. Every manifest has `id: "/"` and `scope: "/"` (an address is its own origin, so one `id` is enough and never changes).
- **D2. Icons: 192 and 512 "any", and a real 512 "maskable".** `/icon` (512, rounded white square) stays. New: `/pwa-icons/icon-192.png` (the same picture at 192) and `/pwa-icons/icon-512-maskable.png` (full-bleed white, the logo inside the middle 62 %, well within the 80 % circle the launchers keep). The `.png` ending also lets the school's own host serve them while the portals are on (`apexServes` lets any file through). The 180 px `/apple-icon` is no longer in the manifest (iOS reads it from the page's head); it is not declared maskable any more.
- **D3. An Install button where the browser offers one.** A small client module (`src/lib/pwa/install.ts`) listens for `beforeinstallprompt` from the moment the page's scripts load (it is imported by the always-present `ServiceWorkerRegister`, so no page misses the event), keeps it, and `InstallApp` shows "Install the app" which calls `prompt()`. It disappears once the app is installed or is running installed (`display-mode: standalone`, or `navigator.standalone` on iOS). Where: under the sign-in forms (`/login` and `/portal`) and in the signed-in shell's account menu and phone "More" sheet.
- **D4. iPhone and iPad: a line, not a button.** Safari has no prompt to call, so the same component shows "To install on an iPhone or iPad: tap Share, then Add to Home Screen." when the device is one (`isAppleTouch`, which also catches an iPad that says it is a Mac) and the page is not already installed.
- **D5. Nothing is claimed that cannot be done.** On a browser that fires no `beforeinstallprompt` and is not an Apple device (Firefox, a desktop Safari, a page Chrome has already decided not to offer), the component renders nothing: a button that does nothing would be worse than none.
- **D6. The service worker is unchanged** except for its cache name's version (`aleemaan-pwa-v2`) so the two new icons are precached and an old cache is cleared; it already has the `fetch` handler Chrome wants and an `/offline` page.

## 3. Not in this task

A real "offline" experience for signed-in pages (only the shell and `/offline` are cached, as before), push notifications, and store listings. A device test (the maintainer's phone) is the one thing a browser test cannot replace: see the checklist in section 5.

## 4. Files

`src/lib/pwa/manifest.ts` (new, pure), `src/lib/pwa/install.ts` (new, the store), `src/app/manifest.ts`, `src/app/pwa-icons/[file]/route.tsx` (new), `src/components/pwa/InstallApp.tsx` (new), `src/components/pwa/ServiceWorkerRegister.tsx`, `public/sw.js`, the sign-in pages and the shell's account menu and "More" sheet (one `<InstallApp />` each), `docs/components/`.

## 5. Tests, and the phone checklist

Unit: `tests/unit/pwa-manifest.spec.ts` (every address's manifest: start page, scope, id, icons meet Chrome's rule of a 192 and a 512, one maskable, shortcuts only where staff may use them) and the install helpers (`isAppleTouch`, the state names). API: `tests/api/pwa-manifest.spec.ts` (the real server's answers per host; every icon the manifest names is served as a PNG of exactly the size it declares; the school's own host serves them while the portals are on). Browser: `tests/e2e/app-icons.spec.ts` updated for the new list; the install button appears when the browser's event is dispatched, calls `prompt()`, and goes away on `appinstalled`.

On the maintainer's phone, after the deploy (Chrome, Android): open `parent.<school domain>` once, wait a few seconds, then the menu should say "Install app" (not "Add to Home screen"), and the Install button of the page should appear. A reload after clearing site data is needed if the old manifest was cached.

## 6. Build record and tests

Gates in this order: `tsc --noEmit` clean; `eslint` on every changed file 0 errors and 0 warnings (the generator's `<img>` carries a disable comment with its reason); `next build` clean (`/manifest.webmanifest` is now a dynamic route, `/pwa-icons/[file]` a new one); `prettier --check` clean.

Browser and unit (Chromium, one worker, the shared test database; counts read from the run logs):

| Run | What | Result |
| --- | --- | --- |
| p1 | `pwa-manifest` unit (every address's manifest, the install rules), `quick-tools` unit (its manifest test now asks `manifestFor`), `pwa-manifest` API (real servers, per host), `pwa-install` and `app-icons` browser | 50 tests: 46 passed, 4 failed. All four were my tests, not the product: three fired the browser's install event before the page's scripts had run (nothing was listening yet; Chrome fires it seconds after load), and one asked the school's own host for a name with no file ending, which that host redirects by the proxy's rule before the route is reached. |
| p2 | the two API and browser files after the fix (a `visit` helper waits for the worker to register, which happens after hydration; the 404 checks use a portal host) | 25 of 25 passed |

What the tests prove: each address's manifest (start page, name, id, scope, shortcuts); every icon the manifest names is a PNG whose real width and height, read from its header, equal what the manifest says (on every host); the maskable icon is opaque white at its corners and edge, white everywhere outside the launcher's 80 % circle, with the logo's green inside it; the two drawn icons are cached for a day and not "immutable"; unknown names (`constructor`, `__proto__`, an encoded `../`) are 404 or 400, never a picture; the Install button appears only after the browser's event, cancels the browser's own bar, calls `prompt()` once, goes away afterwards and on `appinstalled`, is never offered to an app running installed, is on `/login`, `/portal`, the account menu (wide screens), and shows the Share / Add to Home Screen line on an iPhone user agent; the worker is registered on `/login` and `/portal`.

**Not run, and why it matters:** a real install on a phone. A browser test cannot make Chrome decide to offer the install; that is the maintainer's check, with the steps in section 5. The `e2e-mobile` project's More-sheet path of `pwa-install.spec.ts` was not run.
