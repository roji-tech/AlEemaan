# Phase 0.5.E — Account self-service (profile, change email, active sessions)

**Status: BUILT AND VERIFIED (2026-10-05) — awaiting the maintainer's merge.** Branch `claude/account-self-service` of
`roji-tech/AlEemaan`, **stacked on `claude/dev-email-inbox`** (merge order: … → CSP → password reset → TOTP → dev inbox → this). Live
work log until the merge; append-only after. Design of record: plan → Phase 0.5 addenda → **0.5.E** ("Design for the
self-service half", written before any code) and its "As built" note. Same change in both repos (Octalve Edu has its own
record). Test guide: `tests/README.md`. *Invite & activate* and administrator *deactivation* — the other halves of 0.5.E —
are deliberately deferred to the Users pages (§0.5.2).

## What this phase delivers
A signed-in person can now look after their own account without an administrator, and every step that could be abused by
someone holding only a stolen session asks for something that person would not have.
- **Edit your name.** `PATCH /api/v1/account/profile { name }`. One rule, `checkName()` (`lib/auth/profile-policy.ts`,
  client-safe, used by the form for instant feedback and by the route as the backstop): NFC-normalised, inner whitespace
  collapsed, trimmed, 1–100 *characters* (an emoji counts once), **no control characters and no bidirectional overrides**
  (they can make a name *display* as something else in a member list) — but zero-width joiners are allowed (Persian,
  Arabic, Indic scripts and emoji sequences need them). 10 changes per account per 5 minutes; an unchanged name writes
  and audits nothing; audit `PROFILE_UPDATED` with before and after. Only the caller's own row can be touched — extra
  fields (`id`, `email`, `passwordHash`, `role`) are ignored, never mass-assigned.
- **Change your email address, confirmed by a link to the NEW one.** `POST /api/v1/auth/email-change/request
  { newEmail, password }` re-verifies the **current password**, then answers the same generic `{ requested: true }`
  *whatever the address* — the lookup, the token and every email happen after the response (`after()`), and an address that
  already has an account gets a *notice instead of a link*, so a signed-in person can't probe which addresses exist
  (identical status, body and headers; timing within noise). The link — 256-bit, URL fragment, **hash only at rest,
  single use, one hour, one live request per person** (a new request kills the old link) — goes to the new address; the
  old address gets a notice with the new one masked. `POST …/email-change/confirm { token }` is **public** (the link is
  opened from a mail client) and, in **one transaction**, claims the token with a conditional update, sets the new email
  (`emailVerified` now) and deletes **every session, pending password-reset link, sign-in challenge and other
  email-change request** of that person — the email is the recovery channel, so nothing issued for the old one survives
  it. If the address was taken in the meantime the unique index refuses it, the whole transaction rolls back and the
  answer is the same generic "this link can't be used" (unknown, expired, used, malformed and contested are
  indistinguishable). It does *not* sign anyone in and clears the browser's session cookie. The old address is told it
  happened; audit `EMAIL_CHANGE_REQUESTED` / `EMAIL_CHANGED` with before and after.
  Limits: wrong passwords 5 per account per 5 minutes (a right one is refunded; typos cost nothing); *verified*
  requests 3 per account per 5 minutes; 3 per target address per 5 minutes (beyond that the same generic answer, but no
  mail — no mail-bombing a stranger through us, and no 429 that would reveal how often an address was asked for); confirm
  failures 10 per IP per 5 minutes, a success refunded.
- **Active sessions.** `GET /api/v1/auth/sessions` lists the caller's own unexpired sessions — *this device* first, a short
  description parsed from the stored user agent ("Chrome on Windows", "Safari on iPhone"), when it was created and last used,
  whether "Keep me signed in" was ticked — and never a token, a token hash or an IP address (none is stored; none was added).
  `POST …/sessions/revoke { sessionId }` ends one of the caller's *other* sessions (the current one is refused — that is
  Sign out); a session that isn't theirs answers **exactly like one that doesn't exist**, so ids can't be probed.
  `POST …/sessions/revoke-others` ends all but this one (it can only reduce access, so it needs no password). Audit
  `SESSION_REVOKED` / `SESSIONS_REVOKED` (nothing when nothing was revoked). The page fetches the list in the browser, so
  "5 minutes ago" uses the viewer's clock and language and there is no hydration mismatch; a device that was ended
  elsewhere in the meantime simply disappears from the list.
- **The screens.** The account page: **Profile** (Edit → Save / Cancel / Escape; unchanged = nothing sent), **Email
  address** (idle → form → "Check your inbox", the same screen whether or not the address is taken), Password, Two-step,
  **Active sessions** (live region announces what was ended; focus returns sensibly). `/confirm-email`: ready (waits for a
  click) → "Email address changed" → Continue to sign in, or "This link can't be used". Phone and desktop, both themes.

## Operations
Nothing to configure. Needs working email in production (`RESEND_API_KEY` + `EMAIL_FROM`, as since 0.5.C) — an address
change is impossible without the mail reaching the new address. Locally and on staging the dev inbox (0.5.F) shows the
link. The migration is one new table (`EmailChangeToken`), additive and live-data-safe. Operator note: a person who lost
access to *both* addresses is an administrator's problem (and one of the things the Users pages will solve); `mfa:reset`
and the password-reset flow are unchanged.

## Verification
`pnpm test` (AlEemaan): **833 passed, 18 skipped by design, 0 failed** (20.1 min; it was 715) — unit 114, integration 137,
api 245, e2e-desktop 173, e2e-mobile 173, https 8. Static: `tsc`, ESLint, `next build` clean. The new specs are the same as
Octalve Edu's (`tests/{unit,integration,api,e2e}/account-self-service.spec.ts`, the two a11y blocks and the reset-page
"two links in one tab" test); the differences are the ports: the session cookie is `aleemaan.session-token`
(`COOKIE_NAME`), memberships are branch memberships, and the name shown after a save is asserted on the **account menu in the
app shell's top bar** ("Account menu for …", present at every width) instead of a header. Coverage is unchanged — see
Octalve Edu's record for the full list (28 unit, 18 integration, 40 api, the browser journeys on desktop and phone, axe in both
themes with ≥ 44 px targets on the phone for every state of `/account` and `/confirm-email`). Every browser test is still a
CSP test.

### Mutation testing — 25 injected bugs (a subset of Octalve Edu's 78), 25 caught
Octalve Edu's record has the full 78. Because 22 of the touched files here are byte-identical, AlEemaan re-ran a **25-bug
subset chosen to cover each kind of defence and everything that differs**: tokens (reusable; sessions kept after a confirm;
other requests kept; "address taken" thrown instead of refused); the device list (expired sessions listed; revoke ignoring the
owner; revoke-others ending this session or everyone's); the profile route (no limit; unchanged names audited; no "before" —
the **single-row audit** variant is the part that differs); sessions routes (the current session revocable; an audit row for
nothing); change-email request (password not re-checked; a taken address answering differently or also getting a link; no
per-address limit; a success not refunded; no audit); confirm (a success not refunded; the cookie not cleared; the change not
audited); the UI (the confirm page acting on arrival; a second link in the same tab ignored; Sign out on the current device;
the header/menu not following a rename). **All 25 caught the first time.**

## Findings and decisions
| # | Found by | What | Resolution |
| :-- | :-- | :-- | :-- |
| 1 | Writing the API tests | The per-account request limit (3) was spent *before* the password check, so three typos locked the person out and the "5 wrong passwords" limit was unreachable. | The password limit comes first (refunded unless the password was wrong); the request limit counts only *verified* requests. Test: wrong passwords and typos don't spend the request budget. |
| 2 | First browser test | Two fields labelled "Current password" on one page (Password card and the new Email card). | The email form's field is "Your password" with a hint. |
| 3 | Browser test "link already used" | A second link opened in the same tab changes only the `#fragment` — no reload — so the page kept the first link's state. The same latent bug existed on `/reset-password` since 0.5.C. | `useFragmentToken()` (listens for `hashchange`, returns a `version`); both pages key their state on it. Tests on both. |
| 4 | Browser test | After Save, focus fell to `<body>`: a 0 ms timer runs before React commits after an `await` (Cancel, a click handler, worked). | Focus returns in an effect, after the commit. Same pattern in the email panel. |
| 5 | Reading the screenshots | The name editor showed "NAME" twice on a phone (the `<dt>` and the field's own label); the address wrapped mid-word. | The term is screen-reader-only while editing; `break-words` instead of `break-all`. |
| 6 | Design | An emailed confirmation link that acts on arrival can be spent by a mail scanner before the person ever sees it. | The page waits for a click; a test proves no request is made on arrival. |
| 7 | Mutation N11 | `relativeTime`'s early "just now" return was redundant (the fall-through returns the same) — an equivalent mutant. | Removed the dead branch. |
| 8 | Mutation P2 | The injected bug did not compile (type narrowing). | Re-done as P2b; caught. |

## Explicitly not done
*Invite & activate* and administrator *deactivation* (Users pages, §0.5.2); a "new sign-in from an unrecognised device"
notice; device location or IP (not stored); administrator-initiated email change; self-service account deletion;
per-device names or icons (every device shows the same monitor icon). **Next:** Octalve §0.5.2 (tenant trust boundary + RLS,
the app shell) / AlEemaan Phase 0.5.2 (School Settings), then the Users pages that finish 0.5.E.

## AlEemaan-specific notes
- **Audit** is one row per event (`auditPersonEvent` here has no tenant column — a divergence kept on purpose since 0.5.C); it
  gained the same `{ before, after, reason }` details parameter, written into the existing `beforeValue` / `afterValue` /
  `reason` columns. Octalve Edu writes one row per school the person belongs to.
- **The account page lives inside the app shell** (`(app)/account/page.tsx`): Profile, **Your access** (unchanged), Email
  address, Password, Two-step, Active sessions. `router.refresh()` after a rename updates the shell's account menu.
- **Migration** `20261006090000_email_change_tokens` is additive and live-data-safe (one new table; nothing existing is touched),
  so it is safe to apply to the live school's database before or with the deploy.
- The live school needs working email for an address change (`RESEND_API_KEY` + `EMAIL_FROM`, set since 0.5.C).
