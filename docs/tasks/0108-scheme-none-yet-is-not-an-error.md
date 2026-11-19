# 0108: A class with no assessment scheme yet is not an error (the red 404s on Assessment and grading)

- **Period / Focus:** 2026-11-19 (the maintainer, twice, with the network tab of production open: `GET /api/v1/academics/schemes/class-group/<id>` answers `404 Not Found`, `{"error":{"code":"NOT_FOUND","message":"Scheme not found"}}`; "I'm getting the error when I click on Assessment and grading")
- **Status:** Built; the record is section 4
- **Priority:** Medium (nothing was broken for a user; it looked broken)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/scheme-null` / PR into `dev`
- **Started:** 2026-11-19

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What was happening

Opening Academics > Assessment and grading draws the "Scheme levels" section, which asks for the assessment scheme of EVERY class of the branch, one request per class (`SchemeLevelsPanel`: ten classes, ten requests). A class that has not been given its own scheme yet (the normal state of a new school: marks fall back to the branch default, then the school-wide one) was answered `404 NOT_FOUND "Scheme not found"`. The screen read any answer that was not OK as "this class has none" and drew the right thing ("No assessment schemes yet"), so users saw nothing wrong; but the browser's network tab showed one red 404 for each such class, and the console counted them as errors. It reads as a fault, and a real fault would be hidden among them.

## 2. Decision

- **D1. "No scheme yet" is a state, not a missing thing.** `GET /api/v1/academics/schemes/class-group/[id]` answers `200` with `{ "scheme": null }` for a class of the caller's branch that has no live scheme. The 404 stays for what really is not found: a class that does not exist, or that belongs to another branch (answered exactly alike, so a response never confirms that a class exists elsewhere), as before.
- **D2. The one caller reads it as it already did** (`scheme: null` means none), with the type made explicit (`Scheme | null`).
- **D3. Not in this task:** the screen still makes one request per class. One request for the whole branch would be cheaper (ten requests become one); that is a change of the API's shape and is left for its own task.

## 3. Files

`src/app/api/v1/academics/schemes/class-group/[id]/route.ts` (GET), `src/components/academics/SchemeLevelsPanel.tsx` (the type), `docs/functions/school-app.md` (the route's row), `tests/api/scheme-none-yet.spec.ts` (new).

## 4. Build record and tests

(filled in with the real counts when the suites have run)
