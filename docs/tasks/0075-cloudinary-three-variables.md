# 0075: Cloudinary is configured with three variables, `CLOUDINARY_NAME`, `CLOUDINARY_KEY` and `CLOUDINARY_SECRET`, not one connection string

- **Period / Focus:** 2026-11-15 (the maintainer, deploying AlEemaan with Cloudinary: "can't you split it like this? CLOUDINARY_NAME= CLOUDINARY_KEY= CLOUDINARY_SECRET=")
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (it is the one thing standing between the maintainer and a Cloudinary deployment)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/cloudinary-three-variables` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A deployment that keeps question-bank pictures on Cloudinary sets `IMAGE_STORE=cloudinary` and **three separate variables**, which are what Cloudinary's dashboard shows as the cloud name, the API key and the API secret:

```
CLOUDINARY_NAME=
CLOUDINARY_KEY=
CLOUDINARY_SECRET=
```

`CLOUDINARY_URL` (the single string `cloudinary://<key>:<secret>@<name>`) is **no longer read**.

## 2. Why, and what changes

Three plain values are what Vercel's environment screen, a password manager and a person pasting from the dashboard handle best: no string to assemble, no `cloudinary://` to mistype, and a message can name **which** value is wrong ("CLOUDINARY_KEY is not a valid API key") where one string could only say "the URL is wrong".

It is also the more defensive shape. The old rule existed because the vendor's package reads **options from the query string** of `CLOUDINARY_URL` (another API host, a proxy), so a string with anything after the cloud name had to be refused. With three values there is no string to carry an option: each value is checked against an anchored pattern that cannot contain `?`, `/`, `#`, `:` or `@`, and the three are handed to the vendor's package as plain arguments, as before (`CloudinarySettings` is unchanged, and so is `cloudinary.ts`).

## 3. Decisions

- **D1. Three variables, all required.** A missing or blank one is named in the message, like the S3 family does ("cloudinary storage needs CLOUDINARY_KEY, CLOUDINARY_SECRET."). Blank is missing; surrounding spaces and a trailing newline are trimmed (a value pasted from a file or a dashboard).
- **D2. The same patterns as before, one per value.** Cloud name `^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$`, API key `^[0-9]{8,24}$`, API secret `^[A-Za-z0-9_-]{16,64}$`. A value that fails is refused with its own variable's name, **never repeated** in the message (a secret must not reach a log).
- **D3. `CLOUDINARY_URL` is not a fallback.** Two ways to say one thing is how a stale value wins silently. If it is set and the three are not, the deployment is "not configured" (503 on the picture routes) and the message names the three. Nothing in the repository, the tests or the deployment guide sets it. No deployment has used it (the hosted projects hold neither, `docs/DEPLOYMENT.md` 3.2), so nothing is migrated.
- **D4. Only the environment-reading function changes.** `resolveCloudinary` in `src/lib/storage/config.ts`. `cloudinary.ts` (the store), the routes, the database, and every image already recorded as held by Cloudinary are untouched; an old image still names the store, and is read with whatever the three variables say now.
- **D4b. A refusal is logged, so the person deploying can see which variable.** The picture routes catch `StorageNotConfiguredError` and answer a plain 503 (`images-service.ts` `storeOrNull`), so the message that names the variable was never shown anywhere: a deployment with a mistyped key would see 503 and nothing else. `getImageStore` now writes `image storage is not configured: <problem>` to the server log (`console.error`) when it cannot resolve a store. The problem text names variables and never a value (D2, proved by the existing "never repeated" tests, now also on the log line); a store that resolves logs nothing.
- **D5. Documentation follows.** `.env.example`, `docs/DEPLOYMENT.md` (the variable table), the HANDOVER's list of what is waiting on the maintainer. The earlier design file (task 0032) is a record of what was decided on 2026-10-19 and is not rewritten; this file is the change to it.
- **D6. Octalve has the same adapter** and was **not** changed here (the maintainer asked about AlEemaan). It reads `CLOUDINARY_URL` today; changing it is the same small change if wanted.

## 4. Not in this task

A real upload, read and delete against a Cloudinary account (it needs the maintainer's credentials; the store has only ever been tested against a stand-in, task 0032). Octalve (D6). The Vercel project's variables (the maintainer sets them).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/unit/storage-config.spec.ts`: the Cloudinary cases rewritten for three variables (resolves; a missing or blank one is named; each malformed one is named and never repeated; `CLOUDINARY_URL` is not read and cannot fill in for a missing one; the other stores' variables are not read; an old image can name Cloudinary while `IMAGE_STORE` names another store) and one new test for the log line (D4b). Failing first on the unfixed code.
- [x] The change: `src/lib/storage/config.ts` (`resolveCloudinary`, and the log line in `getImageStore`).
- [x] `.env.example`, `docs/DEPLOYMENT.md` (the variable table and the 503 row), `docs/HANDOVER.md`, `docs/functions/school-app.md`, tracker TASK-0075.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `AlEemaan-cloudinary`, off `origin/dev` `c354be1`; a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` exit 0 (it first caught a type error in my own test, an array of differently shaped objects passed as `Record<string, string>`; typed and rerun); `eslint` on `src/lib/storage` and the spec exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (`config.ts` and the spec were clean at `HEAD`, so `--write` touched only my lines; `.env.example` has no Prettier parser); the catalogue verifier 746 rows, 0 missing.
- **Failing first, the three-variable cases**, on the unfixed code (the new spec, `src` as on `dev`, built at 22:28): **6 failed, 8 passed**. The five Cloudinary cases each failed for its own reason (the old code read `CLOUDINARY_URL`: it answered "needs CLOUDINARY_URL" where "needs CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET" was expected, and it **accepted** a `CLOUDINARY_URL` that the new rule refuses), and the `getImageStore` test failed because it now configures Cloudinary with the three variables.
- **Failing first, the log line**, with the three-variable change in and the log line not yet written: **1 failed, 14 passed**; the one was the new test, and it failed at its first assertion on the log (received length 0), nothing else.
- **The fixed tree:** `storage-config` and `storage-cloudinary` (the store itself, unchanged): **27 passed, 0 failed**. The whole `unit` project: **1122 passed, 3 failed, 6 did not run**, and none of the 3 is in the storage code: (a) `communication-gateways` and (b) `communication-templates` both call `seedInstance()` and failed with "Authentication failed against database server ... `placeholder`": I ran the unit project with a placeholder `TEST_DATABASE_URL` (no real database), so those two and the 6 that depend on them did not run; (c) `info-tips.spec.ts` ("every key is a dotted lowercase name") fails on the key `programs.lockRelease`, which came in with task 0073 and is on `origin/dev`: a separate finding, not touched here.

**Not run, and not claimed:** the `api`, `e2e-desktop`, `e2e-mobile` and `https` projects (they need the test database and servers; the picture routes' own specs use the in-memory store, which this change does not touch); a **real** Cloudinary upload, read and delete (needs the maintainer's credentials: the store has only ever run against a stand-in); mutation passes (deferred to the end of PHASE 2). **No migration. Environment: replace `CLOUDINARY_URL` with the three variables wherever it was set (no hosted project had it).**
