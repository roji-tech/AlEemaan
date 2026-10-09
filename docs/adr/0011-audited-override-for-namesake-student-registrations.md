# 0011 — Audited in-place override for namesake student registrations

Status: Accepted
Decided by: maintainer · Date: 2026-10-09
Recorded: 2026-10-09

## Context

`StudentRecord` duplicate detection matches against `(branchId, firstName, lastName, dateOfBirth)` (trimmed, case-insensitive). In Nigerian school environments—particularly with shared family or patronymic names and common birth dates—cousins and relatives attending the same school branch frequently share the identical first name, last name, and date of birth. Middle names are optional and may also match or be omitted.

A strict duplicate refusal with no administrative override (`POSSIBLE_DUPLICATE`) permanently prevents administrators from registering legitimate namesake students, tempting operators to modify names or dates of birth to bypass validation.

This ports the canonical decision from Octalve Edu's ADR-0014 (`/home/rojitech/Desktop/CODEC/OCTALVE/octalve-edu/docs/adr/0014-audited-override-for-namesake-student-registrations.md`).

## Decision

Retain automatic duplicate refusal as the default barrier to catch accidental double entries. Provide an audited administrative override:

1. **Service & API**: `createStudent`, `updateStudent`, `restoreStudent`, and `importStudents` accept `allowDuplicate?: boolean`. When false (the default), `findDuplicate` yields a 409 `POSSIBLE_DUPLICATE` response naming the conflicting admission number. When true, the write proceeds and records `{ duplicateOverridden: true, existingAdmissionNo }` in the audit event metadata (`STUDENT_CREATED`, `STUDENT_UPDATED`, `STUDENT_RESTORED`).
2. **Zero PII in Audit**: Audit entries log only IDs and admission numbers, never student names or birth dates.
3. **UI Confirmation**: The student registration form intercepts 409 `POSSIBLE_DUPLICATE`, presents an inline warning banner naming the conflicting admission number, and requires checking an explicit checkbox ("Register/Update anyway as a distinct student") before the submission button re-enables. Editing the name or date-of-birth fields automatically resets the override.

## Alternatives Considered

- **Strict zero override**: Rejected. Legitimate namesake students cannot be enrolled without falsifying birth dates or names, corrupting institutional records.
- **Separate approval workflow / queue**: Rejected as unnecessary ceremony for a single-school system when an explicit confirmation checkbox combined with immutable audit logging provides complete accountability.

## Consequences

- Namesake students can be registered cleanly without data corruption.
- Every override is auditable with direct reference to the preexisting conflicting record.
- **Revisit if:** Accidental double-entry rates increase, warranting a two-person "four-eyes" confirmation flow.

## Enforced by

- `tests/api/students.spec.ts` (API 409 vs 200/201 override cycle and audit non-leakage)
- Integration tests in `tests/integration/students.spec.ts`

## Binds

- `src/lib/students/service.ts`
- `src/lib/students/import.ts`
- `src/app/api/v1/students/`
- `src/components/students/`
