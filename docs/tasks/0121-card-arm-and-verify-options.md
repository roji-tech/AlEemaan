# 0121: Show or hide the class arm and "Verify these results" on a report card

- **Period / Focus:** 2026-11-20 (two layout options on the report card, both hidden by default)
- **Status:** In Progress (built; targeted specs running)
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/card-options` / not opened yet
- **Started:** 2026-11-20

> **How to tick:** change `[ ]` to `[x]`.

---

## 1. Objective
The maintainer, from a printed card: the "SSS 1 A" class line and the "Verify these results" block at the foot are not wanted by default. A template (or the branch's standard layout) can show either one; with nothing said, both are hidden. Existing templates and layouts are hidden too (the maintainer said yes).

## 2. Design (written before the code)
- Two new layout option keys beside `logo`, `signatureLine`, `nextTermDate`: `classArm` (the arm after the class name) and `verifyLinks` (the per-subject verification links).
- A card shows each one only when its option is exactly `true`. A layout or template that says nothing leaves the option undefined, so EVERY existing card is hidden with no data migration and no new column: the options already live in `ReportCardLayout.options` and `ResultTemplate.layoutOptions` (JSON). This is also why there is no migration in this task.
- Where it is set: Results > Templates (the template form's "What the card shows" tick boxes, for a school-wide template too) and Settings > Report card layout (the branch's standard layout). The same two keys pass the strict option schemas of the template routes, the school-template routes and the layout route.
- Where it is read: `ReportCard.tsx` (standard layouts) and `TemplateReportCard.tsx` (the four printed cards): the class line prints the group only unless `classArm`; the verification section renders only when `verifyLinks`.
- Not changed: the verification itself (the tokens, the `/verify/<token>` page and the QR/links in the portal still work); only whether the card prints the links. The downloadable HTML card (`report-card-export.ts`) does not read layout options today and still prints both: a follow-up, it uses the standard design. The portal's own class label and staff screens keep showing the arm.

## 3. Work Breakdown
- [x] Option keys, strict schemas (templates.ts, school-templates-rules.ts, settings/layouts route)
- [x] Template form and layout panel tick boxes (default off)
- [x] Both cards read the options
- [x] Unit test (silence hides; only true/false keys count) and a browser test (hidden by default, shown when the template says so)
- [ ] Records from the real run, then PR to dev

## 4. Notes
- The walkthrough chapters c14 and c15 look for the "Verification" region on a published card; with the default now hidden they need the option turned on in their setup (walkthrough work is last).
