# 0090: A pupil's date of birth is not required (only the first name, the last name and the gender are)

- **Period / Focus:** 2026-11-18 (the maintainer, after the upload said `A "Date of birth" column is missing from the first row`: "make date of birth not required ... and others as well", then "maybe only first, last names and gender should be [required]")
- **Status:** Built; the record is section 6
- **Priority:** High (it blocks loading the school's real pupil files)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/optional-dob` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The school's exports (Firebase era: Name, Email, Class, Gender, UID) have no date of birth. A pupil can now be registered, edited and loaded in bulk without one. Required: first name, last name, gender. Everything else was already optional.

## 2. Decisions

- **D1. The column becomes nullable** (`StudentRecord.dateOfBirth`), by migration `20261118150000_pupil_dob_optional` (`ALTER ... DROP NOT NULL`). **Gender stays required.** Relaxing a NOT NULL is safe on a live table, but **the migration must be run BEFORE the new code is released** (the lesson of the e-mail-change incident): the new code writes a null that the old column refuses.
- **D2. A missing date of birth cannot tell two pupils apart, so a namesake is still caught.** Same first and last name, and (the dates are equal, **or either date is missing**) means "possible namesake": registering needs the same confirmation as before (`allowDuplicate`, recorded against the person's name; in bulk, the "Add even if a pupil with the same name is already here" box). Without this a file loaded twice would register every pupil twice, which is the mistake a repeatable import must not allow.
- **D3. The middle name counts, when both pupils have one.** "Abdulbasit Balqees Zakariyya" and "Abdulbasit Romlah Zakariyya" are sisters (found in the school's real file: three such families). A pupil with no middle name cannot be told from one that has it, so that is still a namesake.
- **D4. Editing is not a namesake check.** The check ran on every edit; with no date of birth, two pupils with the same name would have to be confirmed again every time one's guardian phone changed. It now runs only when the first name, the middle name, the last name or the date of birth changes.
- **D5. A date that IS given must be real** (not in the future, a real calendar day, 1900 or later), as before. In the form a blank date is "not given"; on edit, `null` clears the date and leaving it out keeps it.
- **D6. The result portal.** A pupil's date of birth is one of the secrets that signs a pupil in (the others are the guardian's phone and e-mail). With none on record, the date cannot match (`matchesDateOfBirth(input, null)` is false); the guardian's phone or e-mail still work.
- **D7. No invented dates.** The legacy (Firebase) mapper filled a missing date of birth with 1 January 2010 or 2016. Besides being false, a date that common is guessable and the portal accepts it as a secret. It now leaves the date empty.
- **D8. Where it shows.** The Students list says "born ..." only when there is a date; the form's field is "Date of birth (optional)"; the list and detail API return `null`, never a placeholder.

## 3. Not in this task

Making gender optional (the maintainer wants it required); the programs' people (already optional); the public admissions form on the website; the walkthrough.

## 4. Files

`prisma/schema/students.prisma` and the migration; `src/lib/students/service.ts` (schemas, `findDuplicate`, create, update, restore, list, detail); `src/lib/bulk/pupils.ts` (the column, the rule) and `pupils-server.ts` (namesakes in the branch and inside the file, save); `src/lib/portal/auth.ts`; `src/lib/migration/legacy-mapper.ts`; `src/components/students/StudentsPanel.tsx`; `src/app/api/v1/students/import/route.ts` (comment).

## 5. Tests

`tests/unit/bulk-pupils.spec.ts` (missing, blank and bad dates; gender and names still required; the headers), `tests/api/pupil-optional-dob.spec.ts` (register without a date; the namesake rule both ways; sisters are not namesakes; an unrelated edit does not ask; clearing the date; null in the list and detail; bulk save, the same file again, rows of one file; the portal matcher). The existing students, bulk and portal specs run unchanged.

## 6. Build record and tests

(filled in with the real counts when the suites have run)

### The school's data files (`out/live_data`), through the real rules (client side, 2026-11-18)

| File | Rows | Ready | Refused |
|---|---|---|---|
| `classes_primary.csv` | 10 | 10 | 0 |
| `classes_secondary.csv` | 6 | 6 | 0 |
| `pupils_primary_template.csv` | 144 | 144 | 0 |
| `pupils_secondary_template.csv` | 144 | 143 | 1 (a one-word name, no last name) |
| `students_export (2).csv` (raw) | 144 | 144 | 0 (Email and UID are ignored with a warning) |
| `students_export (3).csv` (raw) | 144 | 143 | 1 (the same one-word name) |
| `staff_teachers.csv` | 32 | 26 | 6 (one-word names) |

Two things the client rules cannot see, found by reading the server rules: **a class must have an arm before a pupil can be placed in it** (the class files had empty Arms, so every pupil row would have been refused; they now say `Main`, the app's default arm, which a blank Arm in a pupil file means), and **each branch needs an active academic session** (not checkable from here).
