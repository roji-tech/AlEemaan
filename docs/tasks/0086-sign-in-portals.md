# 0086: Sign-in portals on subdomains (admin., staff., student., parent.), the landing pages on the school's own address only

- **Period / Focus:** 2026-11-17 (the maintainer: link several subdomains to the one app without hardcoding the domain; the apex is the landing page only; `admin.` for administrators and superadmins, `staff.` for staff, `student.` for students, `parent.` for parents; the landing pages reachable only through the apex; "maybe we can just set up each subdomain name in the env"; "won't this be a security give-away?"; "make sure you don't send the wrong subdomain in the e-mails"; and a staging address)
- **Status:** Built; the record is section 6
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/portals-subdomains` / PR into `dev`
- **Started:** 2026-11-17

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

One deployment answers on the school's own address (the public website) and on four sign-in subdomains. Which subdomain is which portal comes from four optional environment variables; the school's domain is never written in the code.

## 2. Decisions

- **D1. Four optional variables, `ADMIN_SUBDOMAIN`, `STAFF_SUBDOMAIN`, `STUDENT_SUBDOMAIN`, `PARENT_SUBDOMAIN`**, each holding one DNS label (the maintainer's idea). **None set = off**: every host behaves as before, so development, staging that does not want portals, and Vercel preview URLs are unchanged. A value that is not one label, or that repeats another, is ignored and logged once (`[PORTALS]`); the portal it named is then not recognised.
- **D2. The domain is derived, never configured.** A host's first label that is a portal's label makes it that portal; the rest is the school's domain (`staff.example.school` → `example.school`). Everything else (the bare domain, `www.`, a preview URL, `localhost`, an address) is the school's own host. Only the first label counts (`x.admin.example.school` is not a portal).
- **D3. Staging nests**: `admin.staging.<domain>` is the `admin` portal of `staging.<domain>`, so staging's landing redirect can only reach staging. Sibling names (`admin-staging.<domain>`) were compared and rejected: they would need a second variable, and a wrong `APP_URL` could send staging visitors to production. (The maintainer approved nested.)
- **D4. The landing pages are the school's own host's.** On a portal, `/`, `/ar`, `/about`, `/admissions`, `/anthem`, `/contact`, `/oldstudents`, `/our-academics`, `/subjects`, `/vacancy`, `/product` redirect (307, a temporary redirect, so a browser never pins it) to the same path and query on the school's own host, with the request's scheme and port. The check is in `src/proxy.ts`; the application's other paths (`/login`, `/forgot-password`, the app) are not redirected. The bare portal address therefore leads to the landing page, as asked; say if it should open that portal's sign-in instead.
- **D5. A refused sign-in is the same answer as a wrong password.** A message that named the right portal would confirm to someone holding stolen credentials that the password is right and say what the account is (the maintainer saw this at once). So the portal rule is part of the account lookup: before the password is judged, the person's memberships are read (also for an account that does not exist, so the three cases cost the same), and "not admitted" joins "no such account" and "wrong password" in one branch: `401 INVALID_CREDENTIALS`, the same body, no cookie, the same rate-limit count. It is also decided before a two-step challenge is made, so a wrong portal is never told "enter your code". `completeSignIn`, the one place a session is made (sign-in step 1 and step 2), checks again. With the portals on, **the school's own host admits nobody**: signing in happens on a portal.
- **D6. Who a portal admits**: `admin` = an administrator (`ADMIN` role) or a superadmin; `staff` = `TEACHING_STAFF` or `NON_TEACHING_STAFF`; `student` = `STUDENT`; `parent` = `PARENT`. A person with several roles may use every portal that fits one of them. A deactivated membership counts for nothing. A superadmin counts only while they hold an active membership, as everywhere else. The portal decides only where one may sign in, not what one sees after.
- **D7. Each portal's sign-in page says what it is** (a badge with the role's icon, "Administrator sign-in", "Staff sign-in", "Student sign-in", "Parent sign-in", a line for that audience), taken from the host, never from the form. On the school's own host `/login` is a short "Who is signing in?" list of links to the four portals (no form, no account named).
- **D8. Sessions are separate per portal for free**: the session cookie is `__Host-` prefixed and has no `Domain`, so a browser never sends one portal's session to another. The CSRF check compares the request's Origin with its own host, so it already works on every subdomain.
- **D9. No e-mail names a portal that would refuse its reader.** Every link is built in `lib/email/messages.ts`. Each builder that makes a link takes the recipient's portal (`portalForUser`: the first portal that admits them, administrators first): reset, invitation (by the invited role), password changed, email-change request and confirmation, "address taken". A builder not told the portal links to the school's own address (never to a portal). The portal's address is built from `APP_URL` (so staging's links follow staging's address). `tests/unit/email-portal-links.spec.ts` builds every such e-mail for every kind of recipient and checks each link's host.

## 3. Not in this task

DNS and Vercel (the maintainer's, in the order of `docs/DEPLOYMENT.md` 3.3a); the walkthrough (the maintainer put it last); portal-specific colours or logos beyond the heading, badge and line.

## 4. Files

`src/lib/portals.ts` (pure rules); `src/lib/auth/portal-gate.ts`; `src/lib/auth/csrf.ts` (`requestHost`); `src/lib/auth/complete-sign-in.ts`; `src/app/api/v1/auth/login/route.ts`; `src/proxy.ts`; `src/app/login/{page,LoginForm,PortalChooser}.tsx`; `src/lib/email/messages.ts` and its callers (forgot-password, reset-password, change-password, email-change request, invitations mail and resend); `playwright.config.ts` and `tests/support/env.ts` (a sixth test server with the portals on); `.env.example`; `docs/DEPLOYMENT.md` 3.3a.

## 5. Tests

`tests/unit/portals.spec.ts` (host rules, the label rules, who each portal admits), `tests/unit/email-portal-links.spec.ts` (every link of every e-mail), `tests/api/portals.spec.ts` against the portals server (redirects, who may sign in where for every role, byte-for-byte equality of a wrong-portal refusal with a wrong password and with no account, two-step not asked on the wrong portal, the same rate limit, e-mailed links), `tests/e2e/portals.spec.ts` in a browser on `admin.localhost` and the others.

## 5a. Addition 2026-11-18: the switch, the apex rule and the Sign-in page

The maintainer's rules: the portals are turned on and off in the environment, **on by default**; off, everything is on the school's address with no subdomain check; on, the school's address serves only the landing pages and `https://aleemanschool.com/login` is not reachable; the website gets a new Sign-in page with Parent, Student and Staff buttons that goes to the right place (and, off, to the one form on the same address), and the website's Sign-in links no longer go straight to `/login`.

- `PORTALS_ENABLED` (`lib/portals.ts`, `readPortalConfig`): on unless false/0/off/no; any other value stays on and is said once. Labels default to `admin`, `staff`, `student`, `parent` (`DEFAULT_LABELS`), each renamed by its variable.
- `apexServes(pathname)` and `APEX_OPEN`: on the school's own host the proxy sends everything that is not a landing page, an open page or a file to `/select-role` (307). Open pages: `/portal`, `/verify`, `/q`, `/offline`, `/icon`, `/apple-icon`, `/setup` and the four e-mailed token pages. A unit test reads `src/app` and fails when a new top-level route is neither open nor refused.
- `/select-role` (`src/app/(marketing)/(site)/select-role/page.tsx`): parent, student, staff (no administrator button). `SITE_SIGN_IN` and the product page's links point to it. The login page on the school's host redirects to it; the old four-portal chooser (`PortalChooser`) is gone, its icons are in `components/auth/portalIcons.ts`.
- `hostFromHeaders` (`lib/auth/csrf.ts`): the same host rule for server components as `requestHost` for requests.
- Every test server but the portals one sets `PORTALS_ENABLED=false` (`tests/support/env.ts`); the unit process sets it too.
- **Rollout risk:** on by default means a host without subdomains cannot sign anyone in. Production and Preview need `PORTALS_ENABLED=false` until the four subdomains work (`docs/DEPLOYMENT.md` 3.3a).

## 6. Build record and tests

(filled in with the real counts when the suites have run)
