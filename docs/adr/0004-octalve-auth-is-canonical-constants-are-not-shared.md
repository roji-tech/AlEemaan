# 0004 — Octalve's auth design is canonical; product-specific constants are not shared
Status: accepted · Decided: 2026-09-30 · Recorded: 2026-10-07

## Context
Auth, sessions, limiters, passwords, `withAuth` and the UI primitives share names and behaviour with Octalve Edu on purpose. Copying a "shared" file wholesale once carried Octalve's **cookie name** into this repo: 58 tests failed at once, and on the live school it would have signed everyone out. The normalised drift comparison had hidden the difference.

## Decision
Octalve's design wins where the two differ; a change to one repo is ported to the other or logged as a divergence in the shared-names table (plan §0.5.1.6). **Product-specific constants are never shared**: cookie names in `session.ts`, the brand files (`brand.css`, `brand.ts`), the membership model's name. After a port, read the **raw** diff.

## Consequences
Divergences (for example ADR 0002) are recorded in both repos' tables, not just one.

## Enforced by
No single assertion: every signed-in test goes through the sign-in helpers (`tests/support/http.ts`), so a wrong cookie name fails the whole suite at once (as the 58 failures showed). The rest is review: read the **raw** diff of any port.

## Related
`CLAUDE.md` working rule 7 · plan §0.5.1.6.
