# Parent and student portal — Pages

The portal has its own sign-in (a student's admission number and a secret, not a staff account) and its own session cookie, separate from the school app's. See
[`../functions/portal.md`](../functions/portal.md) for how the session works.

## Portal

| Route | File | Description |
| --- | --- | --- |
| `/portal` | `portal/page.tsx` | Parent and student portal; anyone may open it and nothing is checked on the server. A client page (`use client`, wrapped in `Suspense`) that asks `GET /api/v1/portal/session` for the portal cookie. Without a valid one it shows `PortalLoginCard` (`?token=` preselects the token tab); with one it shows `PortalHeader` and four tabs (`PortalOverviewTab`, `PortalResultsTab`, `PortalFinanceTab`, `PortalLmsTab`), each loading its own `/api/v1/portal/students/[studentId]/...` route, with a pupil selector for siblings. Not in the staff navigation; the LMS pages link to it. |
