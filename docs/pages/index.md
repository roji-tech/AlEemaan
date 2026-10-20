# Pages

Every page route in the app (`page.tsx` under `src/app/`) and the app-level files that wrap them (layouts, web manifest, icons, global styles), one file per part of the product.

| File | Covers |
| :--- | :--- |
| [`school-app.md`](./school-app.md) | The signed-in school app, under the `(app)` route group: overview, account, set-up, teaching, communication and finance screens |
| [`portal.md`](./portal.md) | The parent and student portal (`/portal`), which has its own sign-in and session |
| [`public.md`](./public.md) | Pages anyone can reach (sign-in and recovery, invitations, email confirmation, public verification, the first-run set-up wizard, the landing and offline pages) and the app-level files |

See also [`../components/index.md`](../components/index.md) for what the pages render and [`../functions/index.md`](../functions/index.md) for the logic and the API routes behind them. Navigation (who sees which entry) is defined once in `src/components/shell/nav.ts`.

These tables are kept in step with the code: a file that is added, renamed or removed gets its row changed in the same change.
