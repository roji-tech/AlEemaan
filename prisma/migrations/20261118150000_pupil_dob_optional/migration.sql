-- A pupil's date of birth is no longer required (the maintainer, 2026-11-18: only the first name, the last name and the gender are): the exports the school loads from do not have it.
-- Relaxing a NOT NULL is safe on a live table: no row changes, and the code that reads the column today keeps working until a row without it exists, which only the new code can create.
-- Run this BEFORE the new code is released.
ALTER TABLE public."StudentRecord" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
