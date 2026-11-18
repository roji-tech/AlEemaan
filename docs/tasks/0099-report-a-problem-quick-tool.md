# 0099: A "Report" tool in Quick Tools: people tell the developer about a problem; it is recorded and mailed to DEVELOPER_EMAIL

- **Period / Focus:** 2026-11-18 (the maintainer: "i wanna add report to the list of Quick tools, it sends me an email and records each report, DEVELOPER_EMAIL" ... "SO USERS CAN REPORT ISSUES")
- **Status:** Built; the run is recorded in section 5
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/report-tool` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Any signed-in person (staff, pupil, parent, administrator) can open Quick Tools, choose Report, say what is wrong, confusing or missing, and send it. The report is kept in the database and mailed to the developer.

## 2. Decisions

- **D1. Who:** every signed-in person, every role (the point is that users report). Signed out: refused (401).
- **D2. What the form asks:** a kind (Something is not working / Something is confusing / An idea to make it better / Something else) and a message of 10 to 2,000 characters. Nothing else to fill in.
- **D3. What goes with it, and where it comes from.** The page the person is on (the **path only**: a query string can hold a token or a name, so it is dropped), their screen size, and the time come from the browser. **Who they are** (name, e-mail address, roles, branches) and their browser come from the server, from the session and the request: never from the body, so a report cannot claim to be from someone else. The body is strict: an unknown field is a 400.
- **D4. Recorded first, mailed after.** The report is saved (`ProblemReport`, a new table), the answer is sent, and the mail goes afterwards, so a mail failure can never lose a report or fail the person's request. `emailed` says whether the mail was handed to the mail service. The person is told "Your report is recorded" with a reference, and never whether the mail went.
- **D5. `DEVELOPER_EMAIL`** is a new, optional environment variable (the maintainer's to set in Vercel; see `docs/DEPLOYMENT.md`). Unset or not an address: reports are still recorded, `emailed` stays false, nothing breaks. The mail is plain text, built from cleaned values (control characters removed from every one-line value, the subject is one line of at most 90 characters), and drawn by the same mail renderer as every other mail, which escapes everything.
- **D6. Abuse.** At most 5 reports per person in five minutes (the sliding window used elsewhere), then 429 "You have sent several reports just now". The message is capped at 2,000 characters.
- **D7. Reading them.** `GET /api/v1/reports` (superadmin only) returns the 50 newest. A screen for them is not built here (the mail is the notice; the table is the record).
- **D8. No attachments and no screenshots** in this task (a file upload is a new attack surface).

## 3. Work

- [x] `prisma/schema/reports.prisma`, migration `20261118180000_problem_report` (additive: one enum, one table)
- [x] `src/lib/reports/report.ts` (pure rules and the mail), `service.ts`; `POST` and `GET /api/v1/reports`
- [x] `ReportTool.tsx` and the fourth tab of `QuickToolsDrawer`; `?tool=report` opens it
- [x] `DEVELOPER_EMAIL` in `.env.example` and `docs/DEPLOYMENT.md`
- [x] `tests/unit/problem-report.spec.ts`, `tests/api/problem-reports.spec.ts`, `tests/e2e/report-tool.spec.ts`

## 4. Migration and the variable (the maintainer's)

`prisma/migrations/20261118180000_problem_report/migration.sql`: one enum and one table. Staging runs it by itself when `master` receives it; production: merge to `prod`, THEN `gh workflow run migrate-production.yml --ref prod -f confirm="migrate production"`. Until it has run, sending a report answers an error and nothing else is affected.

To receive the mail: `vercel env add DEVELOPER_EMAIL production --scope portfolio-frontend-react-team-2` (and Preview if wanted), then redeploy. I do not set environment variables.

## 5. Record of the runs

Filled in from the run's summary, not from memory; see the PR.
