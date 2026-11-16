# 0079: GitHub Actions: CI on every pull request, and the migrations run from GitHub (staging automatically, production by hand)

- **Period / Focus:** 2026-11-16 (the maintainer, after running the production migration by hand: "can we do this kind of ci?", pointing at proplity's `.github/workflows`)
- **Status:** Built; the first run of the new workflows is the pull request's own checks (section 4)
- **Priority:** Medium (migrations were the one release step that depended on a terminal and a typed URL)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/ci-workflows` / PR into `dev`
- **Started:** 2026-11-16

---

## 1. What, and the maintainer's two choices

Four workflows (`.github/workflows/`), adapted from proplity's: **CI** (every push and pull request to `dev`, `master`, `prod`), **Check migrations** (pull requests that touch the schema or the migrations), **Migrate staging** (push to `master` touching them, and by hand) and **Migrate production** (by hand only, typed confirmation, from `prod`). The maintainer's choices: **Vercel keeps deploying `prod` by itself** (no Actions deploy, no `vercel.json` switch), so production's migration must be run **before** the release merges (documented); and **the GitHub secrets are set from the env files** (done: environments `staging` and `production`, each with a `DATABASE_URL` secret holding the DIRECT address, each restricted to its branch).

## 2. Decisions

- **D1. Differences from proplity:** staging is `master` (not `main`); the migration address is `DATABASE_URL` itself (the direct one: no `DIRECT_URL`); no Actions deploy (the maintainer's choice above); Node 24 (what Vercel runs).
- **D2. Actions are pinned to full commit SHAs** (with the major version in a comment), `permissions: contents: read` on every workflow, no `pull_request_target`.
- **D3. The migration workflows refuse an empty `DATABASE_URL` and a `-pooler` address** (a pooler cannot hold the lock `migrate deploy` takes). Production also refuses a typed confirmation that does not match and any ref but `prod`; the `production` environment is restricted to `prod` by GitHub itself.
- **D4. Check migrations reads no secret.** Proplity diffs the pull request against the staging database; here it validates the schema and checks that the migrations produce exactly the schema, using a throwaway Postgres as the shadow database (`prisma migrate diff --from-migrations ... --exit-code`, the same check `tests/integration/schema-matches-migrations.spec.ts` runs). A pull request's code never receives a database address.
- **D5. Prettier runs on the files a pull request changes, not on the whole repository:** 120 older files are not Prettier-clean (found by running `pnpm format:check` on `dev`), so a whole-repo check would be red from the first run; the long-standing rule is to leave a file as clean as it was found.
- **D6. CI runs the unit project only**, on a Postgres service (two unit specs need a database). The API, browser and https projects (hours) stay manual.
- **D7. Not set, offered:** required status checks on the branches (GitHub branch protection), required reviewers on the `production` environment, an Actions deploy like proplity's.

## 3. Not in this task

Octalve's equivalent; a scheduled full run; caching Playwright browsers (the unit project needs none).

## 4. Record

(filled in from the real runs of the pull request's checks)
