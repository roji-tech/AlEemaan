-- Programs, slice P2 (task 0043, section 9.5), step 1 of 2: a person who has no school record can be suspended or expelled from a program, so the history of standing gains a subject.
--
-- ADDITIVE ONLY: one enum value. It is a migration of its own because PostgreSQL does not let a value that was added in a transaction be used in the same transaction; the next
-- migration (20261105100000_program_people) uses it in a check constraint. Run the two in order, before the code that uses them is deployed. The hosted databases are migrated by
-- the maintainer, never by an AI session.

-- AlterEnum
ALTER TYPE "StandingSubject" ADD VALUE 'PARTICIPANT';
