# 0001 — One school; branches are not tenants; roles apply school-wide
Status: accepted · Decided: Phase 0 · Recorded: 2026-10-07

## Context
AlEemaan replaces one live school (four branches: Secondary/Primary × English/Arabic). Its sibling, Octalve Edu, is multi-tenant. Importing tenant machinery here would add risk to a live system for no benefit.

## Decision
Exactly one school, ever: no tenant id, no RLS, no tenant-scoped queries. A branch is a place inside the school, not a security boundary. `Membership(userId, branchId, role)` is unique per (userId, branchId), and a role applies **school-wide**; `withAuth({ roles })` checks that a membership with the role exists, not which branch. The ADMIN branch is bookkeeping.

## Consequences
`AuditLog` has no tenantId. Anything copied from Octalve must have its tenant parts removed, not stubbed. If the school ever needs per-branch restriction, that is a new ADR that supersedes this one.

## Enforced by
`tests/integration/with-auth.spec.ts`, `tests/unit/with-auth.spec.ts`; the schema (`prisma/schema/branch.prisma`).

## Related
`CLAUDE.md` "What this project actually is" · Octalve ADR 0001 (the multi-tenant counterpart).
