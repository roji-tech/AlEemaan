# Deploying AlEemaan to production

Written for the maintainer: the person who approves a promotion, runs the migrations and holds the Vercel and database accounts. Facts were checked on **2026-11-13** (each says how to check it again); anything not checked says so. Nothing in this file needs a secret written into it, and none should ever be: a value is made on the command line and goes straight into Vercel.

## 0. The short version

1. The decisions of section 2 are made; two actions remain for you (the Vercel Production Branch, the second database).
2. Do the one-time set-up in section 3 (once): the database, the environment variables, the domain, the first sign-in.
3. For every release, follow section 4 in order. The order that matters most: **the database migration first, then the code**.
4. If something looks wrong, section 5 (rollback) and section 6 (symptoms) come before anything else.

Two rules sit over every step:

- **Migrations run before the code that needs them, and they are additive.** New code on an old schema fails; old code on a new additive schema keeps working. That is what makes a rollback of the code safe.
- **Nothing reaches `master` or `prod` without your approval of that specific pull request, and nobody but you runs a migration or writes a Vercel secret.** The AI helper is blocked from all three on purpose and will give you the command to run (section 7).

## 1. How it is wired today

| Item | Value | How to check it again |
| --- | --- | --- |
| Branches | `dev` (development, the GitHub default) → `master` (staging by the rule) → `prod` (production by the rule). ADR 0013 records the rule. | `git branch -r` |
| Vercel project | `portfolio-frontend-react-team-2/al-eemaan`, project id `prj_uTO9tpYOuAkTG6KFLc6zbwkbOmRz`, address `https://al-eemaan.vercel.app` | `vercel project inspect al-eemaan --scope portfolio-frontend-react-team-2` |
| Node, framework | Node 24.x, Next.js preset | the same command |
| Build | The project's own `build` script, `prisma generate && next build`. `next build` does not need the secrets; the server does (section 3.2). | `package.json` |
| **Production Branch in Vercel** | **`master` today; decided: `prod`** (2.1). Until it is changed, every merge into `master` deploys to Vercel's *Production* environment, at the real address. | `vercel api /v9/projects/al-eemaan --scope portfolio-frontend-react-team-2` and read `link.productionBranch` |
| Previews | Every push to `dev` and every pull request gets its own preview address and the **Preview** environment variables. | the pull request's Vercel check |
| Where `master` and `prod` stand | `prod` was last moved on 2026-11-12 (the merge of pull request 162) and has everything `master` has; `master` is at pull request 161 (2026-11-10). On 2026-11-13 `dev` was **76 commits ahead of `master`**. | `git rev-list --count origin/master..origin/dev` |
| Automated checks | There is **no GitHub Actions workflow**. The tests are run by hand (section 4, step 1); the only automatic check on a pull request is Vercel's build. | `.github/` does not exist |
| Branch protection | **None** on `master` or `prod` (checked 2026-11-13). Your approval is a rule between you and the helper, not something GitHub enforces. | `gh api repos/roji-tech/AlEemaan/branches/master/protection` answers "Branch not protected" |
| Database | PostgreSQL through Prisma. The hosted one named in `docs/HANDOVER.md` section 3 is `db.prisma.io` with the **old** 26-migration history applied. **Its content and its state were not looked at for this guide.** You said on 2026-11-12 that there is no production data yet. | see section 3.1 |
| Environment variables on Vercel | Seen on 2026-11-10: `DATABASE_URL` (Production and Preview) and `SESSION_SECRET` (a different value in each). Everything else in section 3.2 is **not set**. | `vercel env ls --scope portfolio-frontend-react-team-2` (names only) |
| Scheduled jobs | None. There is no `vercel.json` and no cron route. A broadcast is sent from the Communication screen ten recipients at a time and **needs the page to stay open**. | |
| Rate limiting | In the server's memory (one count per running instance). On Vercel several instances can run, so a limit is looser than its number says. `REDIS_URL` in `.env.example` is for the local Docker only; the code does not read it. | `src/lib/auth/rate-limit.ts` |

## 2. Decisions (made by the maintainer, 2026-11-13) and what each still needs from you

**2.1 `prod` is production, `master` is staging, `dev` is development.** Vercel is **not set that way yet**: its Production Branch is still `master`. **Your action: change it to `prod`** (Vercel dashboard → the project → Settings → Git → Production Branch; newer dashboards: Settings → Environments → Production → Branch Tracking). After that, a merge into `master` builds a **preview** deployment, which is the staging site and uses the **Preview** variables and the Preview database, and only a merge into `prod` goes live. **Until you change it, a merge into `master` deploys to production, so do not merge `dev` → `master` before you have.** The helper does not change Vercel settings.

**2.2 Preview and Production use different databases.** Decided. **Your action:** make the second database and give `DATABASE_URL` a different value for Preview (which serves staging and every pull request's preview) and for Production (3.1). Compare the two values on the Vercel page afterwards (the dashboard shows them to you; do not paste them anywhere): if they are equal, a test on staging writes into production.

**2.3 The hosted database starts empty.** Decided: each environment gets a **new empty database** and the migrations are applied to it from the baseline. The old database (`db.prisma.io`, with the old 26-migration history) is not adopted or reused. Leave it untouched until you have confirmed nothing in it is wanted (you said on 2026-11-12 that there is no production data yet), then delete it at the provider. (AlEemaan's `docs/HANDOVER.md` section 6, task 0052, describes adopting an old database; it is not needed on this path.)

## 3. One-time set-up (before the first production release)

### 3.1 The database

1. Make two new empty PostgreSQL databases with your provider, one for Production and one for Preview (staging and previews; 2.2), and a connection string for each (TLS on, `sslmode=require`).
2. **Look before you touch.** These are new databases (2.3). Should you ever point at one that already holds data, list what is in it and take a backup (step 3 below) before anything else. Never run `prisma migrate reset` or `db push` against a hosted database: both erase or reshape it.
3. A backup, whenever a database holds anything, from a terminal where the connection string is set for this one command only:

   ```bash
   pg_dump --format=custom --file=aleemaan-before-$(date +%F).dump "$HOSTED_DATABASE_URL"
   ```

   Keep the file somewhere private; it holds every person's data.
4. Apply the migrations to each empty database (section 4, steps 3 and 6 give the command and the checks).

**Keep tests away from the hosted database.** `pnpm test` derives a `<name>_test` database from `DATABASE_URL` and creates it on whatever server that URL points at. Never run the tests, and never keep the hosted URL in a checkout's `.env`, in a shell where you also run tests.

### 3.2 The environment variables

Set each in Vercel for **Production**, and for **Preview** with its own, different, value where the value is a secret. Names only are listed here; make a value with the command given, and let it go straight into Vercel:

```bash
# a generated secret, never printed or typed:
openssl rand -base64 48 | vercel env add SESSION_SECRET production --sensitive --scope portfolio-frontend-react-team-2
# a value you hold, typed at the prompt:
vercel env add EMAIL_FROM production --scope portfolio-frontend-react-team-2
```

A new variable reaches **new deployments only**: redeploy after adding one (section 4, step 6).

| Name | Needed? | What happens without it | How to make it |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Nothing works. | The hosted database's connection string. |
| `SESSION_SECRET` | **Yes, hard** | The server **exits at start-up**; Vercel still shows the deployment "Ready", and every request is a 500 (`MIDDLEWARE_INVOCATION_FAILED`). This happened on 2026-11-09. 32 characters at least, not repetitive. | `openssl rand -base64 48`; a different one in each environment. |
| `APP_URL` | **Yes** | The session cookie is not `Secure` and does not get the `__Host-` prefix, the page policy does not upgrade insecure requests, and **every link in an email (invitations, password resets) points to `http://localhost:3000`**. | The public address, **`https://`**, no trailing slash. Production: the domain you serve. |
| `MFA_ENCRYPTION_KEY` | Yes, if anyone is to use two-step verification | The account page says it is unavailable; enrolment answers 503. | `openssl rand -base64 32`. **Back it up privately: losing it means everyone sets two-step verification up again.** |
| `SETUP_TOKEN` | Recommended for the first day | `/setup` is open to whoever finds the address until setup is done. | `openssl rand -hex 24`; you type it once into the wizard. |
| `EMAIL_FROM`, `RESEND_API_KEY` | **Yes, for any email** | Invitations, password resets and notices are printed to the server log and reach **no one**. You cannot invite staff. | A domain verified with Resend; the sender `School Name <no-reply@yourdomain>`; Resend's API key. |
| `PAYSTACK_SECRET_KEY` | If the school takes online payments | Online payments and the webhook answer 503; a production server never falls back to a mock. | Paystack's secret key. Webhook address to give Paystack: `https://<your domain>/api/v1/webhooks/paystack`. |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_SECRET_HASH` | Only if Flutterwave is used | | The provider's dashboard. |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | If the school sends SMS or WhatsApp | A message is recorded as failed ("is not set up on this server"); Retry works once the keys are set. | Termii's dashboard. |
| `IMAGE_STORE` and that store's variables (`S3_*`, `R2_*` or `CLOUDINARY_URL`) | If the question bank is to hold images | Image upload and reading answer 503; nothing else is affected. | `.env.example` explains each; keep the bucket private. |
| `SCHOOL_TIME_ZONE` | Recommended | Day-based limits count a UTC day, which starts at 01:00 in Lagos. | `Africa/Lagos` for the Ibadan school. |
| `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS` | Leave unset on Vercel (see the note) | | |
| `PWNED_PASSWORD_CHECK` | Optional | The breached-password check stays on. | `off` only on an air-gapped install. |
| `NEXT_PUBLIC_VIDEO_GUIDE_BASE_URL` | Optional | The video guide reads `/media/video-guide` on this site. | An `https://` address of the host that serves the video. |

**Never set on a real deployment:** `FORCE_MOCK_PAYSTACK`, `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION`, `DEV_TOOLS`, `DEV_TOOLS_TOKEN` and `APP_ENV`. The dev email inbox is never available in production, whatever these say (`VERCEL_ENV=production` always wins), and `APP_ENV` has no job on Vercel.

*Note on `CLIENT_IP_HEADER`.* The rate limiter reads the client's address from a header that the platform in front of the app sets. The default, `x-real-ip`, is what Vercel sets, so no variable is needed there. **This was not tested from here**: after the first deployment, read the logs once (step 7); if the header were missing the server would log `[RATE_LIMIT] No client IP` and every visitor would share one limit.

### 3.3 The domain

1. Vercel → the project → Domains → add the domain; make the DNS record Vercel asks for.
2. Set `APP_URL` (Production) to that `https://` address and redeploy.
3. Open `https://<domain>/login`, then `https://<domain>/` (the landing page).

### 3.4 The first sign-in (the first run only)

1. Open `https://<domain>/setup` (it is the page `/` and `/login` send you to while the set-up is not finished). Type the `SETUP_TOKEN`.
2. The wizard makes the first superadministrator and the four branches (Secondary and Primary, English and Arabic). Use a real address you can read and a long password.
3. Sign in. Turn on two-step verification under Account → Security.
4. Settings → the school profile: the school's name, principal, telephone, motto, address, e-mail and website. The report cards use them, and (from task 0070) the landing pages show the motto and contact details when they are filled in.
5. Invite the branch administrators from Users. This needs the email variables (3.2).
6. If every superadministrator is ever lost, on a machine that has the production `DATABASE_URL` in its environment only for that command: `pnpm superadmin:make -- <email>`.

## 4. Every release, step by step

Do these in order. Where a step is the helper's and where it is yours is in section 7.

**Step 1. Be sure `dev` is ready.** On a clean checkout of `dev`:

```bash
pnpm install --frozen-lockfile && pnpm prisma:generate
pnpm typecheck && pnpm lint && pnpm format:check
env -u TEST_DATABASE_URL -u DATABASE_URL pnpm build
```

then the tests (`pnpm test` runs a build and every suite: unit, integration, API, browser, HTTPS; it takes hours, and only against a throwaway `_test` database, section 3.1). Read the failures before explaining them. The release pull request must say what was run and what was not.

**Step 2. Read what this release carries.**

```bash
git fetch origin
git log --oneline origin/master..origin/dev | wc -l                 # how many commits
git diff --stat origin/master origin/dev -- prisma/migrations       # new migrations: the ones to run in step 3
git diff origin/master origin/dev -- .env.example                   # new environment variables for section 3.2
git diff --stat origin/master origin/dev -- package.json pnpm-lock.yaml   # a new dependency
```

Write down: the migrations (in order), the new variables, and anything in `docs/HANDOVER.md` marked "for the maintainer".

**Step 3. Migrate the staging (Preview) database. You do this, before the staging code is merged.**

1. In a terminal that is not used for tests, with the connection string of the **Preview** database set for these commands only:

   ```bash
   export DATABASE_URL='…'          # the Preview database; paste it, do not save it in .env
   pnpm prisma migrate status       # what is pending
   pnpm db:migrate:deploy           # applies the pending ones, in order, and nothing else
   pnpm prisma migrate status       # must say: Database schema is up to date
   unset DATABASE_URL
   ```

2. A migration that fails stops the run and leaves a failed row: read the error, do not rerun blindly, and do not deploy the code. Tell the helper, or fix it with a new migration.

Today's pending migrations on a new empty database: the baseline `20260928081559_baseline` and then `20261112210000_coursework_states` (adds the Closed assignment state, a material's type and draft state; additive). `migrate deploy` applies both in order.

**Step 4. Set what is new.** Add every new variable from step 2 (3.2) for **Preview** and, with its own value where it is a secret, for **Production**. Remember a variable reaches new deployments only.

**Step 5. Staging: a pull request `dev` → `master`, and approve it.**

1. Open the pull request. The description lists the commits' themes, the migrations (already run on the staging database, step 3), the new variables, what was tested and what was not. Check that its base is `master` and its head is the commit you tested.
2. Wait for Vercel's check to be a success and GitHub to say the pull request is mergeable.
3. **You approve and merge.** (Only after 2.1 is done: before it, this merge deploys to production.) Vercel builds the staging site from `master`; find its address on the project's Deployments page, filtered to the `master` branch.
4. Run the checks of step 7 against staging. Fix what they find on `dev` and promote again; do not go on to step 6 with a staging that is wrong.

**Step 6. Production: migrate its database, then a pull request `master` → `prod`.**

1. Take a backup if the production database holds anything (3.1, step 3). A migration cannot be undone by a rollback of the code.
2. Run step 3's commands with the connection string of the **Production** database. Read `migrate status`: it must say the schema is up to date.
3. Open the pull request `master` → `prod`, check its base and head, wait for the green check, **approve and merge**. Vercel deploys to production.
4. If you added variables after the last build, redeploy so they take effect: Vercel → Deployments → the latest → Redeploy (leave "use existing build cache" off if a variable changed that the build reads).

**Step 7. Check it is really up.** Read the deployment first, then use the site.

```bash
vercel ls al-eemaan --environment production --scope portfolio-frontend-react-team-2     # the newest should be Ready
vercel inspect <deployment address> --scope portfolio-frontend-react-team-2
vercel logs --deployment <dpl_id> --since 15m --scope portfolio-frontend-react-team-2     # read the first minutes
```

A green "Ready" is **not** proof: a missing `SESSION_SECRET` also shows Ready. Do this on staging after step 5 (with its address) and again on production after step 6. In a private window:

- [ ] `/login` answers 200 and shows the sign-in form (a 500 here is almost always a missing secret, section 6).
- [ ] `/` shows the landing page (signed out); `/ar` the Arabic one.
- [ ] Sign in as the superadministrator; the dashboard opens; two-step verification works.
- [ ] Open the page that the release changed, and one page that it should not have (Students, Results).
- [ ] An email arrives: use Users → invite yourself with a second address, or Forgot password.
- [ ] A pupil or guardian can sign in to `/portal`.
- [ ] `vercel logs` shows no repeating error, and no `[RATE_LIMIT] No client IP` line.

**Step 8. Record it.** In `docs/HANDOVER.md` write the date, the commit on `master`/`prod`, the migrations run and the variables added. Tag the release if you tag (`git tag -a v… prod-commit`).

## 5. Rolling back

- **The code:** Vercel → Deployments → the previous good production deployment → "Promote to Production" (or Instant Rollback). It takes seconds and does not touch the database. It is safe because migrations are additive: the old code ignores new columns. (After a rollback the next push to `prod` deploys the new code again: fix it in git too, by reverting on `master` and promoting the revert.)
- **A bad migration:** there is no automatic undo. Stop the release, restore the backup of step 3 into a new database if data was damaged, point `DATABASE_URL` at it, and write a corrective migration. A migration that drops or rewrites data is not additive and needs its own plan, written before step 3.
- **A leaked or wrong secret:** replace it in Vercel and redeploy. `SESSION_SECRET` replaced means everyone signs in again to the portal; `MFA_ENCRYPTION_KEY` replaced means everyone sets two-step verification up again (`pnpm mfa:reset -- <email>`).

## 6. When something is wrong

| Symptom | Cause to check first |
| --- | --- |
| Every page is a 500, the deployment says Ready, the response header has `x-vercel-error: MIDDLEWARE_INVOCATION_FAILED` | `SESSION_SECRET` missing or weak (the log says "The server cannot start"). Add it for the right environment and redeploy. |
| Sign-in works on one deployment and not another | A variable set for Production only (or Preview only). `vercel env ls` shows which environment each name is in. |
| Links in emails open `http://localhost:3000` | `APP_URL` is not set for this environment (3.2). Set it, redeploy, and send the email again. |
| A page says a table or column does not exist | The code is live but a migration was not run (step 3 was skipped). Run it; the old code still works meanwhile, so rolling back is an option. |
| `migrate deploy` says the database is not empty or has a failed migration | The database is not a new empty one (2.3), or an earlier run failed. Read `prisma migrate status`; do not mark anything resolved until you know which. |
| No emails arrive | `EMAIL_FROM` and `RESEND_API_KEY` missing (the link is in the server log), or the sending domain is not verified. |
| A broadcast stays "Sending" | The Communication page must stay open; there is no scheduled sender in this app. Reopen it and it resumes. |
| Online payment answers 503 | `PAYSTACK_SECRET_KEY` missing for this environment. |
| Image upload answers 503 | `IMAGE_STORE` and its credentials are not complete. |

## 7. Who does what

- **You** (the git user `roji-tech`): decisions in section 2, approving and merging into `master` and `prod`, running the migrations (step 3), writing every Vercel secret, changing Vercel and DNS settings, the Resend, Paystack and Termii accounts.
- **The AI helper:** may merge into `dev` after the checks pass; may read Vercel (`ls`, `inspect`, `logs`, `env ls` shows names only); prepares the pull requests and this checklist's evidence. It does not merge into `master` or `prod`, run a migration on a hosted database, write a secret or redeploy production, because it is blocked from each (and the rule says so). When it needs one of them it gives you the exact command and waits.
- **Nobody** pastes a connection string, a secret or a key into a chat, a pull request, a commit or a log.

## 8. The checklist, to copy into the release pull request

```
[ ] Vercel Production Branch is `prod` (2.1)        [ ] Preview and Production databases differ (2.2)
[ ] dev is green: tsc, lint, format, build, tests (step 1) — what was NOT run is written down
[ ] migrations listed (step 2) and run on the Preview database (step 3)
[ ] new variables set for Preview and Production (step 4)
[ ] PR dev -> master: base and head checked, Vercel check green, approved and merged (step 5)
[ ] staging checks passed (step 7)
[ ] Production database migrated, backup taken if it held anything (step 6)
[ ] PR master -> prod: base and head checked, approved and merged (step 6)
[ ] production checks passed, logs read (step 7)
[ ] HANDOVER updated (step 8)
```
