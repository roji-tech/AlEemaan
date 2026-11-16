# 0080: The school's own website is back at `/` (the old static site, as React and Tailwind in `src/app/(marketing)`)

- **Period / Focus:** 2026-11-16 (the maintainer: "I wanna bring back the old landing page for Aleemaan", the folder `out/aleemanschool`; "the whole old site"; "keep it at /product"; "you can put it all inside (marketing)"; "can't you just convert the pages to original react components and tailwind css"; "convert the html to react component"; "work fast ... secure and quality code"; for the result portal: "Point Portal at AlEemaan's own /portal")
- **Status:** Built (design first; the record is section 6)
- **Priority:** Medium (it is what a visitor to aleemanschool.com sees)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/old-school-site` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`https://aleemanschool.com/` shows the school's own website again: home, About, Academics, Admissions (with the fee schedules), Contact, Anthem, Old students, Subjects and Vacancies, as React and Tailwind pages that run under the application's own security policy, with a way into the school software ("Sign in") in every page's header. The product landing page (task 0048) is kept at `/product`.

## 2. Context

The old site is a separate static repository (`ajiboladev/aleemanschool`, copied in `out/aleemanschool`, git-ignored): plain HTML pages with relative links, inline scripts, styles and event handlers, Font Awesome from cdnjs, Google Fonts, a Google map and, in its result portal, Firebase. The application's page policy (`src/proxy.ts`: nonce, `strict-dynamic`, `'self'` only) would block almost all of that.

## 3. Decisions

- **D1. React and Tailwind, not the old HTML.** A first version served the old pages as whole HTML documents under a looser policy of their own (inline scripts by nonce, `'unsafe-inline'` for handlers and style attributes, gstatic, cdnjs, Google Fonts, Google APIs), on the application's origin. The maintainer asked for React and Tailwind instead, which removes the loosened policy, the same-origin exposure it carried and every inline script, style and handler. That first version was never merged.
- **D2. A route group inside `(marketing)`.** `src/app/(marketing)/(site)` holds the nine pages and a layout (header, footer, scroll button, academic-year note); `src/app/(marketing)/product` is the product landing page. Groups add nothing to an address.
- **D3. The site's look is its own and fixed.** The old site was light, green (`#2e8b57`, `#006400`) and white; the layout fixes those colours and `color-scheme: light`, whatever theme the application is on. It is the school's public face, not part of the application.
- **D4. The application's own policy, plus one frame.** No new policy. The only addition: `buildCsp` takes `frameOrigin` (a host or a list), and `src/proxy.ts` passes the map's two hosts, `https://maps.google.com` and `https://www.google.com` (Google redirects the embed to the second), for `/contact` alone. Nothing else is loosened (a test pins this).
- **D5. No icon library, no new dependency.** `components/site/icons.tsx` is one component over a table of SVG paths, as `components/ui/icons.tsx` is for the application. (A first attempt added `lucide-react`; it was reverted before it was committed.)
- **D6. The old `/academics` is `/our-academics`** because `/academics` is the application's own Academics page (the first build said "Conflicting route and page at /academics"). The old `/portal` is not brought back.
- **D7. The old result portal is NOT carried over** (the maintainer's decision). It looked results up in the old Firebase project `aleeman-primary` with a PIN, on four ~750-line stateful pages, and cannot be tested here. "Portal" in the navigation is AlEemaan's own parent and pupil portal, `/portal`. The old repository keeps the pages.
- **D8. Forms that sent nothing are honest now.** The old admission form (and the contact and tour forms, commented out) showed "submitted" after a timer and sent nothing anywhere. The admission form is now `WhatsAppForm`: it checks its required fields in words, then opens WhatsApp with the answers written in a message to the school (the old vacancy page already applied by WhatsApp). Nothing reaches this server.
- **D9. Invented people are not published as alumni.** The old Old-students script drew ten named people with real employers from a list its own comment called "replace / extend with real alumni data". `src/lib/school-site/alumni.ts` is empty with a note; the page says "Alumni Records Coming Soon" until the school confirms real people.
- **D10. Dead things are not drawn.** Social icons, Events, Privacy and Terms (all `#`), the commented-out forms, and the pictures of a library, a laboratory and an ICT centre that were never in the repository (those facilities are tiles with an icon; the prayer hall has its picture).
- **D11. A link that dialled the wrong number is fixed.** The emergency link showed +234 815 300 5393 and dialled +234 801 234 5678 (a placeholder); it dials the number it shows.
- **D12. Accessible by construction and tested:** one `h1` per page, landmarks, the tab pattern with arrow keys, native `dialog` (focus trap, Escape) and `details`, focus rings, `aria-current`, a menu button with `aria-expanded`, motion only under `motion-safe`, axe (WCAG 2.2 A/AA) and no sideways scroll on every page, on a desktop and a phone.
- **D13. `/` for a signed-in person goes to `/dashboard`** as before (`leaveUnlessVisitor`); the other pages are open to everyone.
- **D14. Print.** "Print / Save as PDF" in the fee dialog prints the dialog alone (`globals.css`: with the dialog open, the rest of the site, marked `site-print-hide`, is hidden in print).

## 4. Not in this task

A visual comparison with the old pages side by side (the look is a faithful rebuild from the old CSS values, not a pixel copy); the content (the old pages carry text such as "over different  students, guided by different  qualified educators" on About, "Formmerly", and a 98% pass rate; they are kept as written and are for the school to review); the old fee amounts (kept as written); the old pictures that never existed; real alumni; a result portal; mutation passes (deferred to the end of PHASE 2); `tests/e2e/setup-handoff.spec.ts`, written before task 0078 (not run here).

## 5. Work breakdown

- [x] Design (this file).
- [x] The frame and the shared pieces (`src/components/site/`), the data (`src/lib/school-site/`), the nine pages, `/product`.
- [x] `buildCsp` `frameOrigin`, the proxy line for `/contact`, `/academics` and `/portal` untouched.
- [x] Tests: `tests/unit/school-site.spec.ts`, `tests/api/school-site.spec.ts`, `tests/e2e/school-site.spec.ts` (desktop and phone); the landing, sign-in and logo specs retargeted to the new addresses.
- [x] Docs: `docs/pages/public.md`, `docs/functions/shared.md`, `docs/components/school-app.md`, HANDOVER 2c, tracker TASK-0080.

## 6. Build record and tests

**Build record (2026-11-16, worktree `AlEemaan-oldsite`, off `origin/dev` `68ebe48`, a production build of the tree tested, database `aleemaan_oldsite_test`).**

- Gates: `tsc --noEmit` clean; `eslint` on every changed file: no errors (the two unused-variable warnings (`isPlaying`, `currentTime`) are in a file this task did not touch); Prettier `--check` clean on every changed file (an early `--write` over all of `src` reformatted unrelated files by mistake and was reverted file by file before anything was staged); `pnpm tasks:check` ran; the catalogue verifier 772 rows, 0 missing, 0 extra.
- **What the browser runs found, fixed before this record** (each was a failure of a real run, not a guess):
  1. `next/image` wrote an inline `style` attribute, which the page policy blocks (the shared fixture fails a test on any policy violation): replaced by `SiteImage`.
  2. The old green `#2e8b57` is 4.2:1 on white (axe `color-contrast`, serious): the site's green is `#2a7f4f`, label text `#1f6b40`, the WhatsApp button `#0f7a3f`, the year note's background more opaque, the About step numbers solid.
  3. The map's embed redirects from `maps.google.com` to `www.google.com`, so `frame-src` names both (still on `/contact` only).
  4. The admission form refused a filled form because a required select had no default ("Number of Children Applying", which the old form defaulted to 1).
  5. Specs that still expected the product page at `/`, and two that clicked "Sign in" without opening the menu on a phone.
- **Final runs.** Full run on the first React build: 149 passed, 44 failed (all of them findings 1 and 2 above, which fail every page's test through the shared fixture, plus the stale URLs). After the fixes, the unit, API and browser school-site specs with the sign-in and logo specs, desktop and phone: **191 passed, 2 failed, 4 skipped**; the 2 were finding 4's assertion (WhatsApp sends the visitor on to `api.whatsapp.com`, which writes the message with `+` for spaces; the test now reads that), rerun alone: **3 passed**.

**Not run, and not claimed:** the whole suite (the rest of the application is untouched; the specs of the landing page, its Arabic page, sign-in and logo were run); the walkthrough harness; a side-by-side look at the old and new pages by a person; a real WhatsApp message to the school; the fee dialog's print output; mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

**For the maintainer (open, not changed):** the old text is kept as written ("over different  students, guided by different  qualified educators", "Formmerly", a 98% pass rate, 16+ years, the fee amounts, the academic-year note "Proudly 2024 / 2025 Set"): please read every page once. `tests/e2e/setup-handoff.spec.ts` expects `/` to go to `/setup` on a fresh install, which task 0078 stopped doing; it was not run here and may be stale.
