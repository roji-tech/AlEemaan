# 0068: The Prisma schema and the migrations disagreed on nine columns; a test now fails when they drift

- **Period / Focus:** 2026-11-12 (found while checking the migration of task 0066 with `prisma migrate diff`; the maintainer asked for the flaws and gaps to be fixed)
- **Status:** Done
- **Priority:** Low to Medium (no wrong data: the database has the stricter type and the length checks; but `prisma migrate dev` would have proposed a migration that widens nine columns to `text`)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/schema-matches-migrations` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`prisma migrate diff --from-url <migrated test database> --to-schema-datamodel prisma/schema` names four tables. The baseline migration (task 0051) builds these columns as `character varying(n)` and, for most, a `..._len` check constraint (written by hand in the migrations that added the tables: defence in depth against a long value); `prisma/schema/*.prisma` says plain `String`, which Prisma reads as `text`:

| Table | Column | In the database | In the schema |
| --- | --- | --- | --- |
| `FormMarkingAudit` | `feedback` | `varchar(2000)` | `String?` |
| `FormMarkingAudit` | `action` | `varchar(50)` | `String` |
| `FormTurnIn` | `note` | `varchar(500)` | `String?` |
| `FormTurnInAudit` | `action` | `varchar(50)` | `String` |
| `FormTurnInAudit` | `note` | `varchar(500)` | `String?` |
| `QuestionBankPrintLog` | `title` | `varchar(255)` | `String` |
| `QuestionBankPrintLog` | `reason` | `varchar(500)` | `String?` |
| `QuestionBankPrintLog` | `ipAddress` | `varchar(100)` | `String?` |
| `QuestionBankPrintLog` | `userAgent` | `varchar(500)` | `String?` |

Nothing is wrong in the data. The risk is the next person who runs `prisma migrate dev`: it would write a migration that alters these nine columns to `text`, silently dropping the type half of the guard.

## 2. Decision

- **D1. The schema is brought to the database, not the other way round**: `@db.VarChar(n)` on each of the nine fields. No migration (the database already is `varchar(n)`); the Prisma client's types do not change (`String`).
- **D2. A guard so it cannot drift again:** `tests/integration/schema-matches-migrations.spec.ts` runs the same diff against the migrated test database and expects exit 0 (the setup project has just run `prisma migrate deploy` on it). It fails on a column added to the schema without a migration, a migration without the schema change, and a type that differs, as these nine did. It prints the diff's report with the database address replaced.
- **D3. Not changed:** the `..._len` check constraints (the schema cannot express them; they stay in the migrations), Octalve (its own baseline and schema; checked separately).

## 3. Work breakdown

- [x] Design (this file).
- [x] The test first: run on the unfixed schema (see section 4).
- [x] The nine `@db.VarChar(n)` annotations in `forms.prisma` and `question-bank.prisma` (written by hand: `prisma format` is never run on this schema).
- [x] The test passes; `prisma generate` and `tsc --noEmit` (exit 0) are unchanged.
- [x] Docs: the tracker, the HANDOVER line that recorded the drift (task 0066), the note in task 0066's build record.

## 4. Build record and tests

Same setup as task 0064 (no lanes, fixed ports, database `aleemaan_test`, one run at a time, a production build first).

- **Unfixed schema (`origin/dev` a8f8a01 plus the new spec): 1 failed, 1 passed (the setup).** The spec failed and its report named `FormMarkingAudit`, `FormTurnIn`, `FormTurnInAudit` and `QuestionBankPrintLog` (the first run of the same diff, made by hand during task 0066, named the same four tables and nine columns).
- **Fixed schema: 2 passed, 0 failed** (setup and the new spec). `prisma generate` ran; `tsc --noEmit` exit 0; eslint on the spec exit 0; Prettier clean on the spec and this file.
- No application code changed and no migration was added; the Prisma client's types are the same (`String`), so no other spec was run. **Not run:** the whole suite; mutation passes (deferred).
