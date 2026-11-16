import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { NAV, QUESTION_BANK_HREF } from "@/components/shell/nav";
import { pageExcluded, pageOverridesFor, staffKindsOf, type PageFacts } from "@/lib/shell-pages";

// `session.user.pages` (the pages shown or hidden for one person on top of their role) is worked out by `pageOverridesFor`, a pure function, so each rule is a table. Whether the
// reviewer assignment it is given is a live one is `hasLiveReviewerRow`'s business (question-bank-rules.spec.ts); how the shell applies the result is shell-nav.spec.ts.

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  isAdmin: false,
  isTeacher: false,
  isStaff: false,
  isBankReviewer: false,
  ...over,
});
const NONE = { included: {}, excluded: {} };

test.describe("which kinds of staff a person is", () => {
  test("a teacher is staff; non-teaching staff is staff but no teacher; a pupil, a guardian and a person with no membership are neither", () => {
    expect(staffKindsOf([{ role: Role.TEACHING_STAFF }])).toEqual({ isTeacher: true, isStaff: true });
    expect(staffKindsOf([{ role: Role.NON_TEACHING_STAFF }])).toEqual({ isTeacher: false, isStaff: true });
    expect(staffKindsOf([{ role: Role.NON_TEACHING_STAFF }, { role: Role.TEACHING_STAFF }])).toEqual({ isTeacher: true, isStaff: true });
    for (const role of [Role.STUDENT, Role.PARENT, Role.ADMIN])
      expect(staffKindsOf([{ role }]), role).toEqual({ isTeacher: false, isStaff: false });
    expect(staffKindsOf([])).toEqual({ isTeacher: false, isStaff: false });
  });
});

test.describe("pages for one person", () => {
  test("a member of non-teaching staff with a live reviewer assignment is offered the Question bank; without one, nothing changes", () => {
    expect(pageOverridesFor(facts({ isStaff: true, isBankReviewer: true }))).toEqual({
      included: { [QUESTION_BANK_HREF]: true },
      excluded: {},
    });
    expect(pageOverridesFor(facts({ isStaff: true }))).toEqual(NONE);
  });

  test("an administrator or a teacher has the Question bank from their role, so there is nothing to add whatever the assignment says", () => {
    expect(pageOverridesFor(facts({ isAdmin: true, isStaff: true, isBankReviewer: true }))).toEqual(NONE);
    expect(pageOverridesFor(facts({ isTeacher: true, isStaff: true, isBankReviewer: true }))).toEqual(NONE);
  });

  test("a person who is not staff gets nothing, even if a stale reviewer row exists", () => {
    expect(pageOverridesFor(facts({ isBankReviewer: true }))).toEqual(NONE);
  });

  test("every page it names is a page the shell lists (a mistyped address would silently do nothing)", () => {
    const hrefs = new Set(NAV.flatMap((item) => (item.href ? [item.href] : [])));
    for (const isAdmin of [false, true])
      for (const isTeacher of [false, true])
        for (const isStaff of [false, true])
          for (const isBankReviewer of [false, true]) {
            const { included, excluded } = pageOverridesFor({ isAdmin, isTeacher, isStaff, isBankReviewer });
            for (const href of [...Object.keys(included), ...Object.keys(excluded)]) expect(hrefs.has(href), href).toBe(true);
          }
  });
});

test.describe("what a page asks", () => {
  test("a page is refused only when `excluded` names it: `included` never opens anything, and another page's entry changes nothing", () => {
    expect(pageExcluded({ included: {}, excluded: { [QUESTION_BANK_HREF]: true } }, QUESTION_BANK_HREF)).toBe(true);
    expect(pageExcluded({ included: { [QUESTION_BANK_HREF]: true }, excluded: {} }, QUESTION_BANK_HREF)).toBe(false);
    expect(pageExcluded({ included: {}, excluded: { "/forms": true } }, QUESTION_BANK_HREF)).toBe(false);
    expect(pageExcluded(NONE, QUESTION_BANK_HREF)).toBe(false);
    // an object's own property names are not pages
    expect(pageExcluded(NONE, "constructor")).toBe(false);
    expect(pageExcluded(NONE, "__proto__")).toBe(false);
  });
});
