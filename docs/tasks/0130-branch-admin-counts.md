# 0130: the Branches page shows the number of admins and members of each branch

- **Status:** Done: built; browser and unit specs pass. No migration.

The maintainer (2026-11-26, Branches page screenshot): "show the number of admins on this page for each branch ... like 0 admins, 0 members".

## Decisions
1. Each branch row (list and grid) reads "N admins · M members" instead of "2 members" / "No members yet", always as numbers (`peopleLabel` in `lib/branches/labels.ts`; the old `memberLabel` stays for the dashboard).
2. Admins are the branch's active memberships with role ADMIN (one `groupBy`, no per-branch query). Members are every active membership, administrators included, so "1 admin · 1 member" is a branch with one person. A deactivated person is in neither number. A superadmin counts only where they hold a membership, as everywhere else.
3. No API change; the page is a server component.

## Tests
`tests/e2e/branches-page.spec.ts` (counts follow the database: none, one, several, an administrator, a deactivated administrator counted in neither; singular), `tests/e2e/list-grid-students-branches.spec.ts` (wording in list and grid), unit `peopleLabel`.
