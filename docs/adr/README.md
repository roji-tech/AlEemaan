# Decisions (ADRs) — AlEemaan

One short file per decision that someone might later **reverse by mistake**, or that **cost real effort to learn**. Not every change gets one.

| Document | Role |
|---|---|
| `development-history/aleemaan_progress.md` | what is built |
| `development-history/domain-implementation-plan.md` | the design record ("Build design", "As built") |
| `development-history/phases/*.md` | append-only history per phase |
| `docs/adr/` (here) | the decisions and the reasons, half a page each |
| `/home/rojitech/Desktop/CODEC/out/tasks/` | the task tracker (workspace, not in git) |

Plans and phase records link to the ADR instead of re-arguing the reason.

## Rules
- Template: follow [`docs/adr/template.md`](template.md) for the 11 canonical ADR rules.
- Files are `NNNN-kebab-title.md`, numbered in the order they are written.
- **Never edit an accepted ADR's decision.** To change a decision, write a new ADR that supersedes it, and change the old one's status to `superseded by NNNN`. The only other edits allowed: the status line, typos and broken links.
- Keep it to about half a page. Fields: Title, Status, Decided, Recorded, Context, Decision, Consequences, **Enforced by** (the test, trigger or file that holds it in place), Related.
- *Decided* is when the decision was made (a phase is fine if the date is not known); *Recorded* is when this file was written. Many first ADRs record decisions made earlier.
- Octalve Edu has its own `docs/adr/` (`/home/rojitech/Desktop/CODEC/OCTALVE/octalve-edu/docs/adr/`). Where a decision is shared, each repo has its own ADR and links to the other. Octalve's ADRs on row-level security, locks and permissions do not apply here (single school, no RLS); its 0002 (refusal after a write must roll back) is a rule to follow when a service here returns a refusal inside a transaction.

## Index
| # | Decision | Status |
|---|---|---|
| [0001](0001-single-school-branches-are-not-tenants.md) | One school; branches are not tenants; roles apply school-wide | accepted |
| [0002](0002-deactivated-membership-is-no-membership.md) | A deactivated membership is no membership; the last one also signs the person out | accepted |
| [0003](0003-live-data-safety.md) | Migrations are additive and tests never touch the live database | accepted |
| [0004](0004-octalve-auth-is-canonical-constants-are-not-shared.md) | Octalve's auth design is canonical; product-specific constants are not shared | accepted |
| [0005](0005-last-admin-is-counted-by-person-under-a-lock.md) | The last administrator is counted by person, under a row lock | accepted |
| [0006](0006-mutation-passes-deferred-to-end-of-phase-2.md) | Mutation passes for new work are deferred to the end of Phase 2 | accepted |
| [0007](0007-a-person-may-belong-to-several-branches.md) | A person may belong to several branches | accepted |
| [0008](0008-branching-dev-master-prod-and-merge-approval.md) | Development on `dev`; `master` needs approval; `prod` reserved | accepted |
| [0009](0009-the-docker-database-is-a-local-dev-database.md) | The docker `aleemaan` database is a local dev database | accepted |
| [0010](0010-commit-and-pr-messages-are-comprehensive.md) | Commit and PR messages are comprehensive | accepted |
