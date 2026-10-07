@AGENTS.md

# AlEemaan — orientation for whoever (or whatever) picks this up next

This file exists so a fresh AI session with access to this repo (and its sibling, Octalve Edu) can
get productive in minutes, not hours. Read this whole file before touching code. It tells you what
to read next, in what order, which files are living documents you must keep current, and which are
stable references you can trust without re-verifying. `@AGENTS.md` above is Next.js's own
auto-generated framework-version notice — unrelated to this file, don't edit it, `next dev` rewrites
it.

## What this project actually is

AlEemaan is a from-scratch replacement for a real, currently-live school-management system (Aleeman
School, Ibadan, Nigeria) — one school, four branches (Secondary/Primary × English/Arabic), currently
run on 5 separate vanilla-HTML/Firebase repos with no shared identity between branches. This is
**single-tenant** — exactly one school, ever. Do not add multi-tenancy here; that's the other project.

**Read `docs/legacy-feature-inventory.md` before assuming you know what the old system does** — it's
a factual, no-opinion catalog of all 5 legacy repos, extracted from their actual source. The legacy
repos themselves live at `out/` (gitignored, not in this repo — see `docs/legacy-repos.md` for the
exact `git clone` commands to check them out locally if you need to read the original code directly).

## The sibling project: Octalve Edu — read this section, it matters

`/home/rojitech/Desktop/CODEC/OCTALVE/octalve-edu` is a separate but deliberately parallel project:
same stack (Next.js 16, TypeScript, Prisma 6.19.3/Postgres, hand-rolled auth against database
sessions), same architect, built alongside this one — but **multi-tenant** (many schools in one
database, Postgres RLS for isolation) where AlEemaan is single-tenant. The two projects share design
decisions on purpose, and as of 2026-09-30 **Octalve Edu's auth design is canonical for both** — see
`docs/development-history/domain-implementation-plan.md` §0.5.1.5 for the full reasoning. This means:

- A security finding in one project's auth almost certainly applies to the other's — check the
  sibling's `docs/auth-review-*.md` files before assuming a fix here is complete.
- A schema/API convention decided in one project (e.g. `{ data, meta, error }` response envelope,
  multi-file Prisma schema under `prisma/schema/`, admin-role-crosses-every-branch semantics) is
  meant to match the other unless a section explicitly says why it diverges (this project's
  single-tenancy is the main deliberate divergence).
- **Before starting any auth or schema work here, check whether Octalve Edu's own
  `docs/development-history/domain-implementation-plan.md` has moved ahead of this one** (or vice
  versa) — whichever project's plan is more recently revised on a shared topic is probably the one to
  sync from.

Two more repos show up in comments/history but are **not siblings to keep in sync with** — they're
one-off pattern sources, referenced once for a specific technique and then done:
- `/home/rojitech/Desktop/CODEC/NextJS/proplity` — where the first-run setup-wizard pattern and the
  atomic-conditional-update bootstrap race-guard came from. Also has its own real auth implementation
  reviewed in detail 2026-09-30 (`proplity/docs/auth-review-2026-09-30.md`) — worth reading for what
  a JWT+refresh-token architecture gets right (timing-safe compare, reuse-detection/rotation) and
  wrong (a real logout-doesn't-revoke bug), but **do not port its JWT+refresh model here** — database
  sessions were a deliberate, audit-driven choice, not an oversight.
- `/home/rojitech/Desktop/CODEC/OCTALVE/ims` — where the multi-file Prisma schema convention
  (`prisma/schema/*.prisma` instead of one `schema.prisma`) came from.
- `/home/rojitech/Desktop/CODEC/NextJS/TheNiche` — where the mobile bottom-tab-bar dashboard pattern
  (used in the Figma-like design artifact, not yet in real code) came from.

## Read in this order, first session

1. **This file.**
2. **`/home/rojitech/Desktop/CODEC/out/tasks.md`** — the maintainer's single task tracker for both repos (outside the repos, so it is not in git). **Check that it exists and read it at the start of every session**: it says what is done, in progress, blocked, and what the maintainer has decided. If the file does not exist, **create it first** (a legend `[x] done · [~] in progress · [ ] to do · [!] blocked / needs the maintainer`, the rules in force, then one section per repo) and fill it from the progress tracker, rather than working without one. Then continue from it.
3. **`docs/development-history/aleemaan_progress.md`** — the single source of truth for "what's
   actually built right now," checked against the real repo, not what any plan says should exist.
   Has a "Next action" section at the bottom — that's the actual todo list.
4. **`docs/development-history/domain-implementation-plan.md`** — the step-by-step build plan.
   Design-first: every phase gets designed here *before* it's coded. Read whichever phase section is
   currently "next" before writing any code for it.
5. **`prisma/schema/*.prisma`** — the actual current data model. This is ground truth; if a doc and
   the schema disagree, the schema is right and the doc is stale (fix the doc).
6. **`docs/development-history/phases/*.md`** — one completion record per finished phase, for history
   and reasoning you don't need to re-derive. Skim titles, read the ones relevant to what you're
   touching.
7. The PRD — **not yet synced to this repo** (tracked gap, see below). Lives only as a Claude Doc;
   ask the user for the link if you need it and Claude Docs tools are unavailable.

## Files that change constantly — update these every session that changes anything real

- **`/home/rojitech/Desktop/CODEC/out/tasks.md`** — the single task tracker for Octalve Edu *and* AlEemaan. Update it as work moves, not at the end: mark `[~]` when you start a task, `[x]` when it is done *and verified*, `[!]` when you are blocked on the maintainer; add every new task, open question and deferred item the moment it appears; record real numbers (tests passed/failed/not run), branch names and PR links. Never mark something done that was not run. Before a context compaction or hand-off, make sure it holds everything the next session needs.
- **`docs/development-history/aleemaan_progress.md`** — update its "Last Updated" date and "Next
  action" section after *any* real change (code, schema, or a design decision), not just at the end
  of a phase. This is the first file any future session reads to know current state; letting it go
  stale defeats the entire point of it existing.
- **`docs/development-history/domain-implementation-plan.md`** — add to it *before* writing code for
  a new phase, and correct it in place (with a note on what changed and why, not a silent edit) when
  implementation reveals the design was wrong — e.g. §0.5.1.1's documented mid-flight correction on
  Auth.js's Credentials+database-session incompatibility, or §0.5.1.5's full realignment to Octalve
  Edu's design. Don't let this drift from what's actually built.
- **`prisma/schema/*.prisma`** — grows one file per new domain area as phases are built (see the
  roadmap in `domain-implementation-plan.md`'s "Roadmap: Phase 1 → 7" section for what's coming:
  `academics.prisma`, `students.prisma`, `results.prisma`, `finance.prisma`, `cms.prisma`).

## Files that are stable reference — read once, trust, don't expect them to move

- `docs/decisions/` — short ADRs (one per decision someone might reverse by mistake); read the index before changing RLS, locks, permissions, deactivation or migrations. Rules are in its README: never edit an accepted decision, supersede it.
- `docs/legacy-feature-inventory.md` — a frozen factual snapshot of the 5 legacy repos as read on
  2026-09-28. Won't change unless the legacy system itself is re-audited.
- `docs/feature-reconciliation-audit.md` — the second-pass gap analysis against the PRD's original
  §5 table. **Not yet merged into the canonical PRD** (needs Claude Docs MCP reachable) — until then,
  this file is more current than the PRD on feature scope.
- `docs/legacy-repos.md` — exact clone commands for `out/`. Only changes if the legacy repos move.
- `docs/development-history/phases/*.md` — append-only history, never edited after being written.

## Working rules in this repo (follow these without being asked)

**Task tracking (applies to every session, in both repos).** Check that `/home/rojitech/Desktop/CODEC/out/tasks.md` exists before starting work (create it if it does not — see the read-order step) and update it as tasks start, finish, block or appear — it is the maintainer's view of progress, separate from the in-repo progress tracker (which records what is *built*). Note: this is the *workspace* `CODEC/out/`, not the repo's own gitignored `out/` folder.

1. **Design before code.** Write or extend the relevant phase section in `domain-implementation-plan.md`
   first. If you discover the design was wrong while implementing, fix the doc *and* explain the
   correction inline (see §0.5.1.1 for the pattern) — don't just silently patch the code.
2. **Verify live, not just "it compiles."** Every phase so far has been verified against a real local
   Postgres (`docker compose up -d`, port 5434) with actual `curl`/cookie-jar requests, not just
   `pnpm build` passing. Truncate test data afterward (`TRUNCATE ... CASCADE` via
   `docker exec aleemaan-db-1 psql ...`) so the dev DB starts clean for the next session.
3. **Always update docs in the same pass as the code change** — the progress tracker and, if the
   design changed, the plan doc. Don't treat this as a follow-up task.
4. **Cite reasoning, not just conclusions**, in comments and docs — why a decision was made, not just
   what it is. This whole doc culture exists so nobody (human or AI) has to re-derive a decision that
   was already made once.
5. **Multi-file Prisma schema** (`prisma/schema/*.prisma`, `prisma.config.ts` points the CLI at the
   folder) — add new files per domain area, don't grow one file indefinitely.
6. **Tests ship with the change, and a security test must be seen to fail.** Every security-relevant
   assertion in `tests/` was mutation-checked: inject the bug it claims to catch, confirm the suite goes
   red, restore — and run it *unmutated* first, since a test that fails both ways proves nothing. Drive UI
   changes in a real browser and read the screenshots. The limiter functions are `async`: every call
   must be `await`ed (`if (!reserveAttempt(k))` without it is `!Promise`, always false, and silently
   disables the limit — TypeScript won't flag it).
7. **Keep the sibling in sync.** Auth/session/limiter/password/`withAuth`/UI-primitive files share names
   and behaviour with Octalve Edu on purpose (table in the plan doc, §0.5.1.6). A change to one gets
   ported to — or explicitly logged as a divergence from — the other. **But product-specific constants are
   not shared:** the cookie names in `session.ts`, the brand files, the membership model's name. Copying a
   "shared" file wholesale once carried Octalve's cookie name into this repo (58 tests failed at once; on the
   live school it would have signed everyone out) — and the normalised drift comparison had hidden it. After
   porting, read the *raw* diff.
8. **UI is tokens, not colours.** Components name semantic tokens (`bg-surface`, `text-fg-muted`,
   `border-line`, `bg-brand-strong`, `text-brand-fg`, …) and never palette classes (`slate-400`,
   `emerald-600`). Exactly two files are brand-specific — `src/app/brand.css` (colours) and
   `src/lib/brand.ts` (words) — and everything in `src/components/ui` and `src/components/auth` stays
   **code-identical with Octalve Edu's**. Light/dark is a `theme` cookie read on the server
   (`<html data-theme>`), not an inline script — the nonce-based CSP (plan §0.5.B) depends on there being
   none. New UI must pass axe in **both** themes, be ≥ 44 px on phones, and be added to
   `responsive-and-a11y.spec.ts`. Signed-in pages live in the `(app)` route group inside the shell; **every
   page calls `requirePageSession()` itself** (a layout isn't re-run on client-side navigation, so it is
   display, never the guard). Navigation is one list, `components/shell/nav.ts`. Design and numbers: plan
   §0.5.A; work log: `docs/development-history/phases/phase-0.5.A-design-language.md`.

## Current state, as of 2026-09-30 (verify against `aleemaan_progress.md` — it may have moved since)

- Phase 0 (scaffold), 0.5.0 (setup wizard), 0.5.1 (auth + branch management) are built.
- **Auth was fully rebuilt 2026-09-30** against a hardened design (session tokens hashed at rest,
  timing-safe login compare, a fixed rate limiter, `__Host-` cookies) — Auth.js was dropped entirely
  (`next-auth`/`@auth/prisma-adapter` removed). Record:
  `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md` (committed — `b3ddbcd`; an earlier
  version of this file warned it was still uncommitted, which stopped being true the same day).
- **Then synced to Octalve Edu's built-and-verified implementation (Phase 0.5.1.6) — built and verified,
  on branch `claude/octalve-auth-sync`, awaiting the maintainer's review/merge.** Two-level session
  expiry, DB-enforced lowercase emails, limiter parity, the 72-byte password policy, `withAuth()`
  replacing `requireAdmin()`, `GET /api/v1/auth/me`, security headers, `/login` + `/dashboard` + `/setup`
  screens, and a real test suite. **Read `docs/development-history/phases/phase-0.5.1.6-octalve-sync.md`
  and `tests/README.md` before touching auth or those screens.**
- **Phase 0.5.A (AlEemaan's own look + the admin shell + a real "Keep me signed in") is BUILT AND VERIFIED,
  on branch `claude/design-tokens-shell`, stacked on the sync branch above (merge that first).** Sea-green
  brand from the design artifact on the shared token system, a server-rendered light/dark theme, the app
  shell (sidebar + top bar; phone tab bar + "More" sheet), `/dashboard` with real figures, `/branches` with
  live member counts and a working "New branch" form, `/account`. *Behaviour change on the live school:* the
  default session is now a browser-session cookie with a 12-hour server cap; ticking "Keep me signed in"
  gives the old 30 d / 90 d policy (7 d for admins). **Read
  `docs/development-history/phases/phase-0.5.A-design-language.md` before touching the shell, the pages or
  the sign-in screen.**
- **There is a test suite: `pnpm test`** (build + Playwright: unit, integration, API, browser at desktop
  and phone sizes, axe accessibility, and a real-HTTPS cookie run). It needs a Postgres
  (`docker compose up -d db`), Chromium (`pnpm exec playwright install chromium`) and `openssl`; it uses
  its own `aleemaan_test` database. Run it before opening a PR.
- **Phase 0.5.G (shared API infrastructure, ported from Octalve Edu §0.5.3) is BUILT AND VERIFIED** — branch `claude/aleemaan-0.5.G`. **Rules that follow:** (1) new routes use `ok`/`fail(message, status, code, details?)`,
  `parseOffsetPagination` / `parseCursorPagination` and `validate({ body, query }, …)` *inside* `withAuth` — a bad parameter is a **400 naming the field**, never clamped, never first-wins; unknown body keys are
  stripped, never passed on; (2) **`X-Forwarded-Host` is never trusted unless `TRUST_FORWARDED_HOST=true`** — set only behind a proxy that *overwrites* it; the default is to compare `Origin` with the `Host` header, so a reverse
  proxy must pass `Host` through (nginx: `proxy_set_header Host $host;`) — **check this before deploying 0.5.G on the live school or every write is refused**; CSRF also refuses `Sec-Fetch-Site: cross-site|same-site`;
  (3) a NEW password is checked with `checkNewPasswordOnServer` (shape, then breach — k-anonymity, fail-open, `PWNED_PASSWORD_CHECK=off` for an air-gapped install); it runs only when a password is *set*, so no existing
  account is affected; (4) the test servers run with the breach check OFF except the one `BREACH_PORT` server pointed at `tests/support/pwned-stub.mjs` — nothing in the suite may call the public service; (5) the TLS test proxy
  rewrites `Host` on purpose (it is the deployment `TRUST_FORWARDED_HOST` exists for). `Dialog`/`SelectField` were deliberately **not** ported here — they arrive with the Users pages. Record:
  `docs/development-history/phases/phase-0.5.G-api-infrastructure.md`.
- **Phase 0.5.E (account self-service) is BUILT AND VERIFIED** — branch `claude/account-self-service`, stacked on the
  dev-inbox branch. A signed-in person can edit their name, change their email (confirmed by a link to the **new**
  address) and see / end the places they are signed in. **Rules that follow:** (1) the change-email request gives the
  **same answer whatever the address is** (status, body, headers, timing) — the lookup, the token and every mail run in
  `after()`, and an address that already has an account gets a notice instead of a link; (2) confirming an email change is
  **one transaction** that sets the address *and* deletes every session, password-reset link, sign-in challenge and other
  change request of that person — if you add another credential-like table keyed by user, it goes in that transaction;
  (3) a page opened from an emailed link **must not act on arrival** (scanners open links) — the person clicks; (4) read a
  one-time token from the URL fragment with `useFragmentToken()` (it copes with a second link opened in the same tab) —
  don't re-implement it; (5) a session id that isn't the caller's answers **exactly like one that doesn't exist**, and no
  IP address is stored for sessions — don't add one without a design; (6) names go through `checkName()` (no control or
  bidi-override characters; ZWJ allowed); (7) the per-account request limit counts only *verified* requests — keep guess
  limits and volume limits separate. *Invite & activate* and deactivation wait for the Users pages. Record:
  `docs/development-history/phases/phase-0.5.E-account-self-service.md`.
- **Phase 0.5.F (dev email inbox) is BUILT AND VERIFIED** — branch `claude/dev-email-inbox`, stacked on the
  TOTP branch. A fourth email transport, `inbox`, keeps the last 50 messages in process memory and an in-app
  widget (bottom-right launcher, unread badge, text bodies, clickable links) shows them — so reset links and
  security notices are readable locally and on a staging deploy with no mail provider. **Rules that follow:**
  (1) **`devToolsAccess()` in `lib/dev-tools.ts` is the only decision** about whether any dev affordance exists
  (`off` | `open` | `{token}`) — never test `NODE_ENV` or `VERCEL_ENV` yourself, and never mount, route or run a dev
  tool without it; production is *never* on, a mistyped `APP_ENV` is production, staging needs `DEV_TOOLS=true`
  **and** `DEV_TOOLS_TOKEN`; (2) message bodies are rendered as **text**, never HTML; (3) `EMAIL_TRANSPORT=inbox`
  where the tools are off must fail loudly, and the log line never carries the body; (4) the inbox is per process —
  do not rely on it across serverless instances. Env: `APP_ENV`, `DEV_TOOLS`, `DEV_TOOLS_TOKEN`. The Paystack half
  of the maintainer's guide waits for Finance (plan §0.5.F says what must change in it first). Record:
  `docs/development-history/phases/phase-0.5.F-dev-email-inbox.md`.
- **Phase 0.5.D (TOTP two-step verification) is BUILT AND VERIFIED** — branch `claude/totp-mfa`, stacked on the
  password-reset branch. Password → (if the account has an *active* second factor) a short-lived, attempt-limited
  **challenge and no session** → `POST /api/v1/auth/login/mfa` with a code or a recovery code → session. TOTP is
  our own RFC 6238 (`lib/auth/mfa/`), secrets AES-256-GCM-encrypted under `MFA_ENCRYPTION_KEY` (required — no key,
  no MFA; **never add a development fallback key**), recovery codes keyed-hashed. **Rules that follow:** (1) a
  session from a sign-in is created in **`completeSignIn()` only**; (2) every "use it once" rule (a TOTP step, a
  recovery code, a challenge, a confirmation) is a **conditional UPDATE whose row count decides**, never a read
  then a write; (3) `lib/auth/mfa/codes.ts` is imported by client components — keep it free of `node:crypto`;
  (4) the enrolment secret lives in component state only, and the QR is drawn in the browser, never by an online
  service; (5) a password reset/change kills pending challenges but a reset **never** turns MFA off. Lost both
  factors: `pnpm mfa:reset -- <email>`. Record: `docs/development-history/phases/phase-0.5.D-totp-mfa.md`;
  next: 0.5.E (self-service built — see above; invite/deactivate wait for the Users pages), then the §0.5.2 work.
- **Phase 0.5.C (password reset and change) is BUILT AND VERIFIED** — branch `claude/password-reset`, stacked on
  the CSP branch. Forgot → emailed single-use link (token in the URL *fragment*, hashed at rest, 30 min) → reset
  deletes all the person's sessions; change-password re-verifies the current password and keeps only this
  session. One shared rule for new passwords: `checkNewPassword()`. Email via `lib/email` (`EMAIL_TRANSPORT`
  = resend | console | file; production needs `RESEND_API_KEY` + `EMAIL_FROM`). **Never make the forgot-password
  response depend on whether the account exists** (content or timing). Record:
  `docs/development-history/phases/phase-0.5.C-password-reset.md`; next: 0.5.D (TOTP — built, see above), then 0.5.E extras (plan).
- **Phase 0.5.B (nonce-based script CSP) is BUILT AND VERIFIED** — branch `claude/csp-nonce`, stacked on the
  0.5.A branch. `src/proxy.ts` mints a nonce per page request and sets the policy (`src/lib/security/csp.ts`);
  `CSP_REPORT_ONLY=true` is the live-deployment valve; the API has a static `default-src 'none'` policy. **Rules
  that follow:** no inline `<script>` and no `style=""`/`<style>` in our markup; every page stays dynamic; new
  third-party origins are a CSP change, not a convenience. The `csp` test fixture fails any browser test that
  triggers a violation. Record: `docs/development-history/phases/phase-0.5.B-csp.md`.
- Phase 0.5.2 (School Settings) is designed, not built — waiting on a go-ahead.
- Phase 1 (Academic Structure) is next in the roadmap after 0.5.2, and is the real dependency root
  for everything after it (see the plan doc's roadmap section).
- The UI design (Login, Branches, Settings, Mobile dashboard, both landing pages) is a private Claude
  Artifact, "Octalve Edu & AlEemaan — UI Design" (`https://claude.ai/artifact/8wGBA2trirEDaTQq1sUf74`). The
  login, shell, Branches and mobile screens are now built (0.5.A); Settings is Phase 0.5.2 and the landing
  pages are Phase 5.

## Known open items (not forgotten, deliberately not yet done)

- PRD not synced to `docs/PRD.md` locally, and the Claude Doc's §5 is stale by
  `feature-reconciliation-audit.md`'s 15 rows — both blocked on Claude Docs MCP being reachable.
- A real open question for the school, not an engineering one: what's actually populating the two
  Arabic branches' data today (no admin/teacher portal exists for them in any of the 5 legacy repos)
  — ask before Phase 7 (migration) gets designed.
- MFA, password reset, a nonce-based script CSP, the active-devices UI — deliberately deferred; **designed
  next as plan §0.5.B (CSP), §0.5.C (password reset/change), §0.5.D (TOTP MFA)** and built in both repos
  together. DB-level email case-insensitivity and absolute session expiry + purge were deferred by 0.5.1.5
  and are done (0.5.1.6).
- ~~AlEemaan's own visual identity — a re-skin, not yet decided.~~ **Decided and done (0.5.A).** The
  artifact's search box and notification bell are omitted (nothing behind them), Settings and Users show as
  "Soon" until Phase 0.5.2 / 1.7 build them, and the marketing sites are Phase 5.
