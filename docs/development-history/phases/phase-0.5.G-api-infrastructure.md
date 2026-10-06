# Phase 0.5.G — Shared API infrastructure (ported from Octalve Edu §0.5.3)

**Status: BUILT, mutation-tested and VERIFIED (2026-10-06).** Branch `claude/aleemaan-0.5.G`. Design of record: plan §"0.5.G", written and committed alone before any code (`4bbfe7b`). It is a **prerequisite for the Users pages**, not a feature.
Everything was ported by reading Octalve Edu's **raw diff**, never by copying shared files (a "shared" file once carried Octalve's cookie name here and failed 58 tests).

## What this delivers
- **Error details.** `fail(message, status, code, details?)` + `ErrorDetail` in `src/lib/api/envelope.ts`; `details` appear only when there is at least one.
- **Pagination** (`src/lib/api/pagination.ts`): offset (`page`/`limit`) and cursor (keyset on `(createdAt, id)`), both strict — a malformed, repeated, signed, decimal, padded or out-of-range parameter is a **400 naming the field**; never clamped, never first-wins; a forged or non-canonical cursor is refused.
- **`validate({ body?, query? }, handler)`** (`src/lib/api/validate.ts`), composed *inside* `withAuth`: non-JSON → 400 `INVALID_BODY`; over 1 MiB (declared or actual) → 413; schema failure → 400 `VALIDATION` with up to 20 `details`; unknown keys stripped.
- **Breached-password check** (`src/lib/auth/pwned-password.ts`): k-anonymity (only the first five hex characters of the SHA-1 leave the server, `Add-Padding: true`), **fail open** (a down service never blocks choosing a password), `PWNED_PASSWORD_CHECK=off` / `PWNED_PASSWORD_URL`.
  User-Agent is `aleemaan-password-check`. Wired into the **setup wizard, password reset and password change** (invitation accept will use it when the Users pages arrive). It runs only when a password is *set*: **no existing account is touched or locked out.**
- **CSRF hardening — a security fix, not a feature** (`src/lib/auth/csrf.ts`): `Sec-Fetch-Site` as a second signal (`same-origin`/`none` pass; `cross-site`/`same-site` refused; absent falls through); the host is `Host`, and **`X-Forwarded-Host` is read only when `TRUST_FORWARDED_HOST=true`** (before, any client could choose the host its Origin was compared with).

## ⚠ Rollout risk on the LIVE school
A reverse proxy that **rewrites `Host`** will make every write fail the Origin check. Before deploying: nginx needs `proxy_set_header Host $host;` (Caddy passes it through), **or** set `TRUST_FORWARDED_HOST=true` and make the proxy *overwrite* (never append) `X-Forwarded-Host`.
Documented in `.env.example`. Reads are unaffected, so the failure is "every save is refused" — check in staging first.

## Not ported, and why
The Redis rate-limit store (one process; in-memory is sufficient), everything tenant-shaped (campus routes, `resolveTenant`, RLS), the auth-event audit (this repo already has `lib/auth/audit.ts`), and `Dialog` / `SelectField` (no consumer yet — untested code; they move with the Users pages).

## Verification
Gate, in order: `pnpm typecheck` → `pnpm lint` → `pnpm build` → the suite. {{FULL_RUN}}

### Mutation testing — 51 injected bugs: 48 caught first time, 3 survived and were fixed; **all 51 caught after the fixes**
Runner: `scripts/mutations/run-mutations.py` with the set `scripts/mutations/0.5.G-mutations.py` (unmutated baseline first; one bug at a time; restored from git in a `finally`).

| id | injected bug | first pass | after fix | note |
| :-- | :-- | :-- | :-- | :-- |
| P1 | a repeated parameter is accepted (first value wins) | CAUGHT | CAUGHT |  |
| P2 | a signed number is accepted ('+2') | CAUGHT | CAUGHT |  |
| P3 | a decimal is accepted ('2.5') | CAUGHT | CAUGHT |  |
| P4 | a padded number is accepted (' 2') | CAUGHT | CAUGHT |  |
| P5 | the limit cap is gone (offset) | CAUGHT | CAUGHT |  |
| P6 | limit 0 is accepted (offset) | CAUGHT | CAUGHT |  |
| P7 | page 0 is accepted | CAUGHT | CAUGHT |  |
| P8 | no page ceiling | CAUGHT | CAUGHT |  |
| P9 | skip is off by one page | CAUGHT | CAUGHT |  |
| P10 | hasNext is true on the last page | CAUGHT | CAUGHT |  |
| P11 | an empty list has 0 pages | CAUGHT | CAUGHT |  |
| P12 | a non-canonical cursor timestamp is accepted | CAUGHT | CAUGHT |  |
| P13 | no cursor length cap | CAUGHT | CAUGHT |  |
| P14 | an empty cursor id is accepted | CAUGHT | CAUGHT |  |
| P15 | the limit cap is gone (cursor) | SURVIVED | CAUGHT | Test added: the cursor form's limit ceiling (edge, over, route-specific cap). |
| P16 | a repeated 'after' is accepted | CAUGHT | CAUGHT |  |
| P17 | an invalid cursor is silently ignored | CAUGHT | CAUGHT |  |
| P18 | the cursor query fetches `limit` rows, not limit+1 | CAUGHT | CAUGHT |  |
| P19 | a next cursor is issued when the page is exactly full | CAUGHT | CAUGHT |  |
| V1 | the real body size is not checked | CAUGHT | CAUGHT |  |
| V2 | the declared content-length is not checked | CAUGHT | CAUGHT |  |
| V3 | the raw body is passed on (unknown keys not stripped) | CAUGHT | CAUGHT |  |
| V4 | no cap on the number of details | CAUGHT | CAUGHT |  |
| V5 | a repeated query parameter keeps only the first | CAUGHT | CAUGHT |  |
| V6 | invalid JSON is reported as a validation error | CAUGHT | CAUGHT |  |
| V7 | an error never carries its details | CAUGHT | CAUGHT |  |
| V8 | an empty details list is still emitted | SURVIVED | CAUGHT | Test added: `fail()` omits `details` when none/empty (`tests/unit/api-infrastructure.spec.ts`). |
| C1 | X-Forwarded-Host is trusted unconditionally | CAUGHT | CAUGHT |  |
| C2 | Sec-Fetch-Site is ignored | CAUGHT | CAUGHT |  |
| C3 | Sec-Fetch-Site: same-site is accepted | CAUGHT | CAUGHT |  |
| C4 | Sec-Fetch-Site: none is refused | CAUGHT | CAUGHT |  |
| C5 | the Referer fallback is ignored | CAUGHT | CAUGHT |  |
| C6 | no Origin and no Referer is accepted | CAUGHT | CAUGHT |  |
| C7 | the port is ignored when comparing Origin with Host | CAUGHT | CAUGHT |  |
| C8 | any non-empty TRUST_FORWARDED_HOST ('false') turns trust on | CAUGHT | CAUGHT |  |
| C9 | an unparseable Origin is accepted | CAUGHT | CAUGHT |  |
| C10 | the HTTPS test server stops trusting the proxy's X-Forwarded-Host | SURVIVED | CAUGHT | The TLS test proxy passed `Host` through, so `TRUST_FORWARDED_HOST` was dead weight in the test. The proxy now rewrites `Host` like nginx's default, so the setting is exercised. |
| W1 | the FULL hash is sent, not the 5-character prefix | CAUGHT | CAUGHT |  |
| W2 | padding is not requested | CAUGHT | CAUGHT |  |
| W3 | an error status fails CLOSED (reports breached) | CAUGHT | CAUGHT |  |
| W4 | a network error fails CLOSED | CAUGHT | CAUGHT |  |
| W5 | a padding row (count 0) counts as a match | CAUGHT | CAUGHT |  |
| W6 | matching is case-sensitive | CAUGHT | CAUGHT |  |
| W7 | PWNED_PASSWORD_CHECK=off is ignored | CAUGHT | CAUGHT |  |
| W8 | the timeout never aborts | CAUGHT | CAUGHT |  |
| W9 | the shape rules are skipped before the breach check | CAUGHT | CAUGHT |  |
| W10 | reset does not check for a breached password | CAUGHT | CAUGHT |  |
| W11 | change does not check for a breached password | CAUGHT | CAUGHT |  |
| W12 | setup does not check for a breached password | CAUGHT | CAUGHT |  |
| W13 | change charges the password-attempt budget for a refused (breached) password | CAUGHT | CAUGHT |  |
| W14 | the breach-check test server has the check switched off | CAUGHT | CAUGHT |  |

## Findings
1. **A test harness that could not fail.** The HTTPS test server was given `TRUST_FORWARDED_HOST=true`, but the test TLS proxy passed `Host` through untouched, so the HTTPS server passed without it (mutation C10). The proxy now rewrites `Host` the way a default nginx does — the deployment the setting exists for.
2. Two small unit gaps (cursor limit ceiling; empty `details`) found by P15 and V8.
3. Octalve Edu's own HTTPS test proxy has the same property (it passes `Host` through); noted as a follow-up in its plan, not changed there.

## Divergences from Octalve Edu (logged in both plans)
User-Agent string; no Redis store; the setup route's breach check runs **after** the setup-token check here (an unauthenticated request with a wrong token must not make the server call out); the TLS test proxy rewrites `Host`; `PWNED_STUB_PORT`/`BREACH_PORT` are fixed (no lanes in this repo).
