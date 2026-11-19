# 0111: Staff details (title, gender, job title, qualification, NYSC corps member), a details popup, nicer cards, real filters, menu icons and themed scrollbars

- **Period / Focus:** 2026-11-19 (maintainer requests, Academics > Staff and the whole dashboard)
- **Status:** In Progress
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/staff-details-corps` / PR to `dev`
- **Started:** 2026-11-19

---

## 1. Objective

The maintainer, 2026-11-19, on the staff edit dialog and the staff cards:

> "I wanna be able to add qualification (optional) and I wanna be able to toggle is_corp_member and also be able to add specific title for non-teaching staff and also add gender and make the name clickable on the list then it displays a popup of their full information. Can you make these cards more nicer UI/UX designs"
>
> "I told you to upgrade this filter but you haven't, add is corp member to it, add gender and teaching/... and other addables"
>
> "why is there no icon for terminate?"
>
> "can you redesign the scroll bars too, make sure it suits the dashboard and its colors"
>
> On the bulk file's header names: "don't drop title, we might need it for Mr/Mrs ... don't drop role either ... even if we leave it optional"

## 2. Context

- `StaffRecord` already had `gender`, `designation` (job title) and `qualification` columns, but the API took only kind, names, phone and email, so nothing ever wrote them.
- Task 0101 (designed, not built) decided the corps member flag as **D5**: a boolean, a checkbox, a badge, a filter and a bulk column. This task builds D5 now. Its "update in the other branches too" part waits for 0101's R1.
- Task 0103 decided the staff filter **D2** (kind, in the browser), "with room for the filters of task 0101 later". This task builds that, plus gender, corps member, sign-in and standing.

## 3. Decisions

- **Title** (Mr, Mrs, Miss, Dr, Mallam, Ustadh…): a new optional column `title`, free text up to 30 characters. The form suggests the common ones. It is shown before the name ("Mrs Amina Yusuf").
- **Job title** (`designation`): asked on the form for **non-teaching** staff only (the maintainer). A teacher's stored value is left as it is. Up to 120 characters.
- **Qualification:** optional, up to 120 characters, for everyone.
- **Gender:** optional, Male or Female (the pupils' enum).
- **NYSC corps member:** `corpsMember` boolean, default false.
- **Blank values:** null or blank means "not given" everywhere (form, API, bulk). A PATCH with null or a blank clears a value.
- **Migration** `20261119090000_staff_corps_member`: `corpsMember BOOLEAN NOT NULL DEFAULT false` and `title TEXT`. Additive. **The maintainer's to run**: staging migrates by itself on a master push; production by the workflow.
- **Bulk file:** five more optional columns.
  - Title, read from columns named Title, Honorific, Salutation or Prefix, so a sheet's "Title" column is the Mr/Mrs one.
  - Gender: M/F, Male/Female, Boy/Girl.
  - Job title, also read from columns named Role, Position or Designation.
  - Qualification.
  - Corps member: Yes/No, Y/N, True/False, 1/0; empty is No.
- **Cards:**
  - the title before the name;
  - under it, what they do: the job title of a non-teaching member or the kind, then the qualification;
  - the contact on one line (cut with "…", the full text on hover and in the details), instead of an email broken mid-word;
  - pills for the kind (Teaching in blue, Non-teaching in green) and "NYSC corps member";
  - two icon chips: sign-in (green when they can) and assignments.
- **Details popup:** the name is a button that opens every detail of the person. Phone and email are links. Edit is offered to an administrator for a live record, and Manage (View for someone who only reads) to everyone.
- **Filters:** Show (current, archived) plus Kind of staff, Gender (including "Not given"), NYSC corps member, Sign-in and Standing. They run in the browser, as Show and the search do, because the branch's staff come in one answer.
- **Menu icons:** Terminate had none, because the icon rules knew `expel` and not `terminate`. Ending a person's place (Terminate, Expel, Withdraw) now shows a red "leaves" icon; Remove and Delete keep the bin. Manage gets a sliders icon so it is not Edit's pencil, and View an eye.
- **Scrollbars:** thin, a rounded green thumb (the brand green toned with `--line-strong`, about 3.2:1 on the canvas in each theme) on a clear track, everywhere. Standard properties for Chrome, Edge and Firefox; WebKit pseudo-elements, with a hover colour, for Safari.

## 4. Work breakdown

- [x] Schema + migration (`title`, `corpsMember`); rules in `staff-rules.ts` (`staffTitle`, `staffDetail`, `staffGender`, `detailOrNull`, `STAFF_TITLE_SUGGESTIONS`); `staff.ts` input, patch, view, create and update.
- [x] Bulk: `bulk/staff.ts` columns and row rules; `bulk/staff-server.ts` save; `toGender` moved to `bulk/fields.ts` (pupils and staff share it).
- [x] UI: `StaffPanel.tsx` (form, card, filters, details), `StaffDetails.tsx` (dialog, pills), `staff-model.ts` (pure filters and wording); `ui/action-look.tsx`; `app/globals.css`.
- [x] Tests:
  - unit `tests/unit/staff-details.spec.ts` (filters, wording, field rules, the bulk columns and Yes/No, the menu icons); `tests/unit/bulk-export.spec.ts` (the staff headers);
  - API `tests/api/staff-assignments.spec.ts` (saved, listed, changed, cleared, audited, refused when invalid);
  - browser `tests/e2e/staff-details.spec.ts` (card, details, filters, form; desktop and phone; accessible).
- [x] Docs: `docs/functions/school-app.md`, `docs/components/school-app.md`, `docs/components/shared.md`, task 0101 (D5 built).

## 5. Verification

Filled from the run logs before merge.
