# Functions

Every non-component logic file in the app — the libraries under `src/lib/`, the request proxy and start-up checks under `src/`, and every API route under `src/app/api/v1/` — one file per part of the product plus a shared file for logic used across all of them.

| File | Covers |
| :--- | :--- |
| [`school-app.md`](./school-app.md) | Services, helpers and API routes of the school app: academics, attendance, students, staff, timetable, promotion, coursework, announcements, communication, finance, members, branches, settings and the question bank |
| [`portal.md`](./portal.md) | The portal's session and sign-in, and its API routes |
| [`public.md`](./public.md) | The API routes behind sign-in, account security, invitations, first-run set-up and public verification |
| [`shared.md`](./shared.md) | `src/lib/auth/` (sessions, passwords, two-step verification, rate limiting, CSRF, `withAuth` and `withAuthGated`), `src/lib/api/`, email, the CSP, the database client, the request proxy and the start-up checks |

See also [`../components/index.md`](../components/index.md) for the components these files back. Every API route also has an entry (and a reason) in the allowlists of `tests/unit/route-role-guard.spec.ts`.

These tables are kept in step with the code: a file that is added, renamed or removed gets its row changed in the same change.
