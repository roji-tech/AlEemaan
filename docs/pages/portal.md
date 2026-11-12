# Parent and student portal — Pages

The portal has its own sign-in (a student's admission number and a secret, not a staff account) and its own session cookie, separate from the school app's. See
[`../functions/portal.md`](../functions/portal.md) for how the session works.

## Portal

| Route | File | Description |
| --- | --- | --- |
| `/portal` | `portal/page.tsx` | Parent and student portal; anyone may open it and nothing is checked on the server. A client page (`use client`, wrapped in `Suspense`) that asks `GET /api/v1/portal/session` for the portal cookie. Without a valid one it shows `PortalLoginCard` (`?token=` preselects the token tab); with one it shows `PortalHeader` and four tabs (`PortalOverviewTab`, `PortalResultsTab`, `PortalFinanceTab`, `PortalLmsTab`), each loading its own `/api/v1/portal/students/[studentId]/...` route, with a pupil selector for siblings. Not in the staff navigation; the LMS pages link to it. The Forms tab (Task 0041, slice F3, `PortalFormsTab`) is offered to a pupil only (the session's `actor` is `PUPIL` and the overview is allowed): practice sets (attempt with a countdown, result, PDF), questionnaires and paper work. A guardian never sees it. The Practice tab (slice F4, `PortalPracticeTab`) is offered to whoever may open the overview and has a practice level other than none: a pupil at the full level has Practise now (setup within the daily cap and the school's switches, a session one question at a time with the answer after each question or at the end, the result), History (archive, finish a session left open, PDF) and My reports (with the reviewer's outcome and reason); a guardian, or anyone at the summary level, sees how practice is going and never a question. Task 0044: a "Progress" section appears for a pupil, or a guardian, when the API says there is a progress record to show. |
