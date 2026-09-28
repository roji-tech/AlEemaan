# AlEemaan — Feature Reconciliation: Second-Pass Audit

The PRD's §5 (MVP Scope & Feature Reconciliation) has a 14-row table built from a summary
understanding of the legacy system. This is a full line-by-line re-read of
`docs/legacy-feature-inventory.md` (all 308 lines, 6 sections) against that table — not to redo it,
but to find what it missed. It found real gaps: features the original table never mentioned at all,
not just under-specified ones.

Same decision key as §5: **Carry** (build it, core to how the school runs) · **Adapt** (build a
better version, same underlying need) · **Defer** (real need, not MVP) · **Drop** (broken, fake, or
dormant — not rebuilt).

**Action needed**: merge this into the canonical PRD (Claude Doc) §5 once the Claude Docs MCP
connection is reachable again — tracked in `docs/development-history/aleemaan_progress.md`. Until
then this file is the up-to-date version of the reconciliation; the Claude Doc's §5 is stale by
these rows.

---

## Gaps: features §5's original table never mentioned

| Legacy feature | Inventory ref | MVP decision | Reasoning |
| --- | --- | --- | --- |
| Online admission inquiry form | §1.4 | **Carry (finally, for real)** | Currently 100% cosmetic — `admissions.js` never writes anywhere, just fakes a spinner and clears a localStorage draft. This is how a school captures new-student leads; shipping it non-functional again would repeat the legacy system's single biggest missed opportunity on the public site. |
| Fee structure browser ("Fees Modal") — categories, line-item bills, provisions checklist, bank account details, print/PDF | §1.4 | **Adapt** | Real, detailed, data-driven feature (not dormant like the admissions form) — genuinely useful for a family checking costs before applying. Rebuild as CMS-editable content (§8 of the PRD) rather than a hardcoded `fees-data.js`, so fee changes don't need a code deploy. |
| Class position/ranking (computed client-side per result) | §2.1 | **Carry** | Real, used feature — parents expect to see their child's class position. Move the computation server-side (the legacy client-side "count how many have a strictly higher average, +1" doesn't handle ties) so it can't be tampered with or miscounted. |
| Report card print / PDF export (`html2pdf.js`) | §2.1 | **Carry** | Real, used feature. Same UX, better implementation (server-rendered PDF rather than client-side rasterization, so it can't be altered by a savvy student before printing). |
| Overview panel stat cards (teacher/student/result/class counts) | §4.2 | **Carry** | Trivial to build, genuinely useful admin-dashboard landing view. |
| CSV export (students, results) | §4.4, §4.5 | **Carry** | Real, used feature for offline record-keeping/reporting — no reason to drop it. |
| `AssessmentConfig` (per-branch, admin-configurable CA test components + max scores, e.g. 3 tests summing to 30 for secondary vs. 40 for primary) | §3.3, §4.7 | **Carry, as its own model** | This isn't covered by "Settings tabs → Carry" in the original table — it's a real per-branch academic-structure config (test names, max scores, CA/exam split) that the grade state machine (PRD §6) needs to read, not just a generic settings toggle. Needs its own schema model, not folded into `SchoolSettings`-equivalent. |
| `assessmentConfig` snapshot on each `Result` (freezes the test structure at save time so a later admin change to the config doesn't retroactively alter historic report cards) | §5 (data model), §3.3 | **Carry — genuinely good design, worth keeping** | This is one of the few things the legacy system got right. Carry the pattern forward exactly: `Result.assessmentConfigSnapshot Json` captured at submit time. |
| Two-term-only academic calendar for both Arabic branches (First/Second only, no Third Term) vs. three terms for both English branches | §2.2 | **Carry, as branch-level config** | A real, branch-specific fact about how the Arabic sections' academic year is structured — not a bug to fix, a fact to model. `Branch` (or a per-branch academic-calendar setting) needs to know how many terms it runs, so the grade workflow doesn't offer a "Third Term" option where none exists. |
| Class-consistency check (block result view if selected class ≠ student's stored class) | §2.1 | **Carry** | Small, real anti-confusion guard, trivial to keep. |
| No forgot-password / self-service password reset flow anywhere (student, teacher, or admin) | §2.1, §4.3, §6.7 | **Carry (finally, for real)** | Currently a hard gap in the legacy system — even the admin "Edit Student" screen explicitly punts to "use the Firebase Console." Auth.js's credential flow (already planned for both Octalve Edu and AlEemaan) needs a real reset-token email flow; this was simply never built in the legacy system, not a feature to preserve as-is. |
| Admin "force delete" a teacher/student without knowing their password | §4.3, §4.4, §6.7 | **Carry (finally, for real)** | Legacy requires re-authenticating *as* the person being deleted — meaning a forgotten/never-known password makes an account permanently undeletable through the UI. Our `CAN_MANAGE_USERS` permission (PRD §4) should allow a real admin-privileged delete; this was a genuine gap, not a feature worth replicating. |
| Client-side-only login rate limiting (5 attempts, 30s lockout, teacher portal only — not even on the admin login) | §3.1 | **Drop, replaced** | Trivially bypassable (it's just a disabled button). Real rate limiting belongs server-side, already planned for both projects' Phase 0.5 (`LoginAttempt`-backed limiter, same idea as this repo's own setup-wizard rate limiter, just persistent). |
| Dynamic vs. fixed class lists (primary branches configure classes via Settings; secondary branches have them hardcoded in the HTML) | §3.4, §4.7, §4.9 | **Carry, uniformly** | Not a feature to selectively adapt — every branch should get the same admin-configurable class list. The legacy inconsistency (only primary got this) was an implementation gap, not a deliberate design choice. |

---

## Corrections to existing §5 rows

- **"Bulk promotion between classes" (already Carry)** — the original row didn't capture the actual
  rule: promotion is gated to Third Term only, computed as the average of a student's per-term
  averages across however many result documents exist for that class+session (≥50% promotes), and
  is idempotent (`promotionHistory` via array-append, safe to re-run). Worth carrying the exact rule
  forward, not just "bulk promotion" as a vague label — re-deriving it from scratch risks a subtly
  different (and undocumented) threshold.
- **"Settings tabs → Carry" (already Carry)** — this table treated Settings as one generic row. It's
  actually 6 distinct sub-areas (School Info, Session/active-term, Classes, Assessment, Subjects,
  Remarks) with real interdependencies — Assessment and Subjects in particular are pulled out above
  as their own schema-relevant items, not generic toggles.

## What this pass did *not* find anything new about

Sections already thoroughly covered by the original §5 table and confirmed accurate on this re-read:
CRUD (§1–4), the four separate result checkers (§2), the shared-password unlock scheme (§3.3),
manual/no-gateway payment status (§4.4), the public marketing pages and their content-quality issues
(§1.1–1.9, §6.5), `vvv.html`/orphaned `footer.js` (§6.4–6.5), and PWA/offline behavior (§6.6).
