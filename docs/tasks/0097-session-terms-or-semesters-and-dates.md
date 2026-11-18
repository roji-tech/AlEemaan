# 0097: A session is made of terms or semesters, 2 or 3 of them, and the dates of each can be set when it is made and changed afterwards

- **Period / Focus:** 2026-11-18 (the maintainer: "When creating a session, I want to be able to select the number of terms if 2 or 3. And to select if the session is going to be using terms or semesters. And I also want to be able to edit the start date and end date of terms and semesters. During creation, and after creation of the session.")
- **Status:** Built; the run is recorded in section 5
- **Priority:** High (the first real use of the Sessions tab, task 0093)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/list-grid-views` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When an administrator creates a session they choose whether the year is cut into **terms** (2 or 3) or **semesters** (2), see and change the first and last day of each, and can change all of those dates later. Until now the server cut the year into equal shares and the person could neither see nor change them.

## 2. Decisions

- **D1. The rules are one pure module**, `src/lib/academics/session-schedule.ts`, used by the form, the "Edit dates" dialog and the server, so the browser and the server cannot disagree: real calendar days; the session ends after it starts; each period ends after it starts; each lies inside the session; each starts after the one before it ends. **A gap between two periods (a holiday) is allowed; an overlap is not.** A session has between 1 and 4 periods (`MAX_PERIODS`).
- **D2. Terms are 2 or 3, semesters are 2** (`COUNTS`). The number starts at the usual one for the branch (Arabic branches 2, the others 3, as the server has always chosen) and can be changed. The same choice applies to every branch when a session is made in several at once.
- **D3. The days start as equal shares** (`defaultSchedule`, the split the server always made) and stay so while the person changes only the session's days or the number. Changing one date makes the schedule theirs (shown by "Share the days equally", which goes back). Changing the session's days, the kind or the number shares them equally again, so a stale date can never sit outside the new session.
- **D4. Create** (`POST /api/v1/academics/sessions`) takes `kind` (default `TERM`) and `periods: [{ startDate, endDate }]` (1 to 4, "YYYY-MM-DD"). Without `periods` the server shares the days equally as before; `termsCount` still works and must match `periods` when both are sent. A refusal names the reason (overlap, outside the session, backwards, not a day, a session of semesters that is not two). Nothing is created on a refusal.
- **D5. Edit afterwards** (`PUT /api/v1/academics/sessions/[id]/schedule`, administrators of the session's branch; another branch's session is the same 404 as an unknown id): the dates of the session and of **every** period at once, `{ startDate, endDate, periods: [{ id, startDate, endDate }] }`, checked as a whole and saved in one transaction. Every period must be named once (a period cannot be added, removed or taken from another session); unknown fields are refused. Labels, kind and the current term are not changed. One audit entry `ACADEMIC_SESSION_SCHEDULE_UPDATED` with the before and after.
- **D6. The kind cannot be changed after creation** (terms to semesters would rename and renumber periods that pupils' records may point at). To change it, make a new session. Said in the info tip.
- **D7. Words follow the kind.** "Terms of 2026/2027" or "Semesters of 2026/2027", "Current term" or "Current semester", "Make 2nd Semester the current semester".
- **D8. The period dates in the form are real fields**, `1st Term starts` and `1st Term ends` (not "first day", so they never share a name with the session's own First day and Last day fields).

## 3. Work

- [x] `src/lib/academics/session-schedule.ts` and `tests/unit/session-schedule.spec.ts`
- [x] `createSession` (kind, periods), `updateSchedule`, the `PUT .../schedule` route
- [x] `SessionsPanel` New session: kind, number, a row of dates per term, "Share the days equally"; "Edit dates" on each session (`SessionDates.tsx`)
- [x] Info tips `sessions.kind`, `sessions.periodDates`; `sessions.dates` and `sessions.terms` reworded
- [x] `tests/api/session-schedule.spec.ts`; three more cases in `tests/e2e/academic-sessions.spec.ts`
- [x] The create route no longer logs an expected refusal as an error
- [ ] Mid-term and mid-semester holidays and their announcement: task 0098

## 4. Not done

- Changing the kind after creation (D6).
- Adding or removing a term after creation: the number is chosen when the session is made.

## 5. Record of the runs

See section 7 of the PR; filled in from `summary.txt` of the run, not from memory.
