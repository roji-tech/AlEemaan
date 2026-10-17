# 0014 — An ADMIN membership administers one branch; school-wide authority is a flag on the person

Status: Accepted
Decided by: the maintainer — chose the model and accepted its four defaults on 2026-10-11; accepted this record on 2026-10-13 ("I'll accept all your suggestions or recommendations", in answer to the review that advised acceptance **after** the administrator list is read) · Date: 2026-10-11
Recorded: 2026-10-11
Amends: 0012 (its interim bullet "an ADMIN membership in any branch still administers every branch"); 0005 (the last administrator becomes the last superadmin)
Supersedes in part: 0001 (the school-wide meaning of ADMIN)

## Context

ADR 0001 made `ADMIN` school-wide; ADR 0012 kept that as an interim while the maintainer's end state was designed: **branch administrators** (an administrator of their own branch) plus **superadmins** (administer everywhere). On 2026-10-11 the maintainer chose the model and accepted all four defaults of the design (plan S1–S8): a flag on the person, not a new role; a branch administrator cannot create another administrator; every current administrator becomes a superadmin on migration; branch administrators manage their branch's academic sessions. Roles are per branch (ADR 0007), so a school-wide authority does not belong in a per-branch row.

## Decision

**Condition on the live deploy (the maintainer's accepted recommendation, 2026-10-13):** before the migration runs on the live database, run `pnpm admins:list` (read-only), decide who stays a superadmin, deploy, then remove the flag from the others on the Users page. Do not deploy first and clean up later: until then every branch administrator would have school-wide power.

- **`User.isSuperAdmin`** (default false) is school-wide authority: every branch, branches and school settings, other administrators, granting and revoking the flag. It counts only while the person has at least one active membership (as signing in does).
- **An `ADMIN` membership administers that branch only.** One helper decides: `canAdminister(userId, branchId)` = superadmin OR an active ADMIN membership in that branch; `adminScope()` gives the same answer for lists.
- **A branch administrator** manages the people, invitations, students, attendance and academic sessions of their own branch; **cannot** make, change, deactivate or reactivate an administrator or a superadmin, cannot move a person to a branch they do not administer, and cannot create branches or change school settings. Another branch's entity is "no such" (404, like an unknown id); a branch named in a request body that is not theirs is 403.
- **Granting or revoking superadmin** is for superadmins only, re-types the caller's own password, is audited, and is never one's own.
- **The school always has a superadmin** (ADR 0005 extended): counted by person, under a row lock on the superadmin `User` rows taken before counting. Only deactivating a superadmin's last active membership, or revoking the flag, can threaten it; a role or branch change never removes authority.
- **Migration** `20261011120000_super_admin_flag` is additive, runs before the code (ADR 0003), and in the same file makes every person with an active ADMIN membership a superadmin — nothing changes for the live school until someone is demoted by choice. `scripts/make-superadmin.mjs` (`pnpm superadmin:make -- <email>`) is the way to create the first superadmin or recover; the setup wizard marks the first administrator one.
- `withAuth({ roles: [ADMIN] })` is satisfied by a superadmin without an ADMIN membership; `withAuth({ superAdmin: true })` requires one.

## Alternatives Considered

- **A `SUPER_ADMIN` value in `Role`:** rejected; a role is per branch (ADR 0007), a school-wide authority does not belong in a per-branch row, and adding an enum value is the harder migration to reverse.
- **"ADMIN in all four branches":** rejected; the next new branch silently breaks it.
- **Branch administrators may create other branch administrators:** rejected by the maintainer (default); only a superadmin makes an administrator.
- **Leave ADMIN school-wide and add only a "read-only" branch role:** rejected; it does not answer "administrator of Primary only".

## Consequences

- The Users page now has two kinds of control: a branch administrator sees only their branches and no controls on administrators; a superadmin sees "Make / Remove superadmin". The API enforces every rule; the page only hides what would be refused.
- The route-role guard test gains a second assertion: a handler that names a branch or a branch-owned entity must call one of the branch helpers or be allowlisted with a reason. It finds a forgotten check; it does not prove a right one (the API specs do).
- `withAuth({ roles })` still means "a role somewhere"; a deeper fix (the branch as part of the guard, `withAuth({ roles, branch })`) is a separate follow-up (see ADR 0012, Consequences).
- Demoting a superadmin's ADMIN membership to another role leaves them a superadmin (the flag is separate). That is deliberate and visible (the "Superadmin" badge) but surprising if you expect the role to be the whole story.
- **Revisit if:** per-class teacher assignment arrives (a teacher's authority then follows the class, not the branch); a parent or student portal is built (own-data access, not a branch role); or the school adds a branch with its own head who must not be demotable by other branch administrators.

## Enforced by

`pnpm exec playwright test tests/integration/super-admin.spec.ts tests/integration/members.spec.ts tests/integration/make-superadmin-script.spec.ts tests/api/branch-admins.spec.ts tests/api/branch-admin-scope.spec.ts tests/unit/route-role-guard.spec.ts --workers=1`.

## Binds

- `prisma/schema/auth.prisma`, `prisma/migrations/20261011120000_super_admin_flag/migration.sql`
- `src/lib/auth/branch-access.ts`, `src/lib/auth/with-auth.ts`, `src/lib/members/service.ts`, `src/lib/members/http.ts`, `src/lib/invitations/service.ts`, `src/lib/students/scope.ts`
- `src/app/api/v1/members/**`, `src/app/api/v1/invitations/**`, `src/app/api/v1/students/**`, `src/app/api/v1/academics/**`, `src/app/api/v1/branches/route.ts`, `src/app/api/v1/settings/school/route.ts`
- `scripts/make-superadmin.mjs`
- the tests listed above
