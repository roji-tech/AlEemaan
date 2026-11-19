import { test, expect } from "@playwright/test";
import {
  DRAFT_FILTER_OPTIONS,
  missingText,
  pupilMissing,
  staffMissing,
  type PupilDraftFacts,
  type StaffDraftFacts,
} from "@/lib/drafts/rules";
import { LIVE_PUPIL, LIVE_STAFF, NOT_DRAFT } from "@/lib/drafts/live";
import { activePupilFilters, pupilFilterQuery, readPupilFilters } from "@/lib/students/list-filters";
import {
  FILTER_OPTIONS,
  NO_STAFF_FILTERS,
  activeStaffFilters,
  countDrafts,
  filterStaff,
  type StaffLike,
} from "@/components/academics/staff-model";
import { invitable } from "@/components/academics/StaffAccess";
import { actionLook } from "@/components/ui/action-look";

// Task 0101 D1 (batch 3a), the pure parts: what "complete" means for a staff record and for a pupil, the one definition of "a record that counts", the draft filter of the two lists, who can
// be invited, and the menu's look for Complete and Mark as draft.

const staff = (over: Partial<StaffDraftFacts> = {}): StaffDraftFacts => ({
  firstName: "Amina",
  lastName: "Yusuf",
  category: "TEACHING",
  gender: "FEMALE",
  email: "amina@school.example",
  phone: null,
  ...over,
});
const pupil = (over: Partial<PupilDraftFacts> = {}): PupilDraftFacts => ({
  firstName: "Zainab",
  lastName: "Aliyu",
  gender: "FEMALE",
  dateOfBirth: "2017-03-04",
  hasClass: true,
  guardianName: "Mr Aliyu",
  guardianPhone: "08031234567",
  guardianEmail: null,
  ...over,
});

test.describe("a staff record is complete when", () => {
  test("it has the names, the kind, the gender and an e-mail OR a phone", () => {
    expect(staffMissing(staff())).toEqual([]);
    expect(staffMissing(staff({ email: null, phone: "08031234567" }))).toEqual([]);
    expect(staffMissing(staff({ email: null, phone: null }))).toEqual(["e-mail or phone"]);
    expect(staffMissing(staff({ gender: null }))).toEqual(["gender"]);
  });
  test("blank text counts as missing, and everything missing is listed in the order the form asks", () => {
    expect(staffMissing(staff({ firstName: "  ", lastName: "", category: null, gender: "", email: " ", phone: "" }))).toEqual([
      "first name",
      "last name",
      "kind of staff",
      "gender",
      "e-mail or phone",
    ]);
  });
});

test.describe("a pupil is complete when", () => {
  test("it has the names, gender, date of birth, a class and a guardian contact", () => {
    expect(pupilMissing(pupil())).toEqual([]);
    expect(pupilMissing(pupil({ dateOfBirth: new Date("2017-03-04T00:00:00Z") }))).toEqual([]);
    expect(pupilMissing(pupil({ guardianPhone: null, guardianEmail: "dad@example.com" }))).toEqual([]);
  });
  test("each missing thing is named, in the order the form asks", () => {
    expect(pupilMissing(pupil({ dateOfBirth: null }))).toEqual(["date of birth"]);
    expect(pupilMissing(pupil({ hasClass: false }))).toEqual(["class"]);
    expect(pupilMissing(pupil({ guardianName: null }))).toEqual(["guardian name"]);
    expect(pupilMissing(pupil({ guardianPhone: "", guardianEmail: "  " }))).toEqual(["guardian phone or e-mail"]);
    expect(
      pupilMissing(
        pupil({ firstName: "", lastName: " ", gender: null, dateOfBirth: null, hasClass: false, guardianName: null, guardianPhone: null }),
      ),
    ).toEqual(["first name", "last name", "gender", "date of birth", "class", "guardian name", "guardian phone or e-mail"]);
  });
});

test("the sentence under a draft", () => {
  expect(missingText([])).toBe("");
  expect(missingText(["gender", "e-mail or phone"])).toBe("Missing: gender, e-mail or phone");
});

test("a record that counts is one that is neither archived nor a draft; the same words for both kinds", () => {
  expect(LIVE_PUPIL).toEqual({ archivedAt: null, isDraft: false });
  expect(LIVE_STAFF).toEqual({ archivedAt: null, isDraft: false });
  expect(NOT_DRAFT).toEqual({ isDraft: false });
  expect(DRAFT_FILTER_OPTIONS.map((o) => o.value)).toEqual(["ANY", "YES", "NO"]);
});

test.describe("the pupil list's draft filter", () => {
  test("YES and NO are read, anything else is refused, and the same filter makes the same address", () => {
    const yes = readPupilFilters(new URLSearchParams("draft=YES&gender=FEMALE"));
    expect(yes.success && yes.data).toMatchObject({ draft: "YES", gender: "FEMALE" });
    const no = readPupilFilters(new URLSearchParams("draft=NO"));
    expect(no.success && no.data.draft).toBe("NO");
    expect(readPupilFilters(new URLSearchParams("draft=MAYBE")).success).toBe(false);
    expect(readPupilFilters(new URLSearchParams("draft=")).success && true).toBe(true); // empty is no filter
    if (yes.success) {
      expect(pupilFilterQuery(yes.data)).toContain("&draft=YES");
      const again = readPupilFilters(new URLSearchParams(pupilFilterQuery(yes.data).slice(1)));
      expect(again.success && again.data).toEqual(yes.data);
    }
  });
  test("it counts as one active filter", () => {
    expect(activePupilFilters({})).toBe(0);
    expect(activePupilFilters({ draft: "YES" })).toBe(1);
    expect(activePupilFilters({ draft: "NO", gender: "MALE" })).toBe(2);
  });
});

test.describe("the staff list's draft filter", () => {
  const person = (over: Partial<StaffLike> = {}): StaffLike => ({
    category: "TEACHING",
    gender: null,
    corpsMember: false,
    designation: null,
    qualification: null,
    role: null,
    standing: "ACTIVE",
    account: { state: "none" },
    ...over,
  });
  const rows = [person({ isDraft: true }), person(), person({ isDraft: false }), person({ isDraft: true })];

  test("Drafts only, Not drafts, and any; a record with no flag is not a draft", () => {
    expect(filterStaff(rows, NO_STAFF_FILTERS)).toHaveLength(4);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, draft: "YES" })).toEqual([rows[0], rows[3]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, draft: "NO" })).toEqual([rows[1], rows[2]]);
    expect(filterStaff(rows, { ...NO_STAFF_FILTERS, draft: "YES", kind: "NON_TEACHING" })).toEqual([]);
  });
  test("it is counted among the filters, and the drafts are counted for the toolbar", () => {
    expect(NO_STAFF_FILTERS.draft).toBe("");
    expect(activeStaffFilters({ ...NO_STAFF_FILTERS, draft: "YES" })).toBe(1);
    expect(FILTER_OPTIONS.draft.map((o) => o.value)).toEqual(["", "YES", "NO"]);
    expect(countDrafts(rows)).toBe(2);
    expect(countDrafts([])).toBe(0);
  });
});

test("a draft cannot be invited from the list", () => {
  const base = { archived: false, standing: "ACTIVE", email: "a@school.example", account: { state: "none" }, invited: null };
  expect(invitable(base)).toBe(true);
  expect(invitable({ ...base, isDraft: false })).toBe(true);
  expect(invitable({ ...base, isDraft: true })).toBe(false);
});

test("the menu: Complete is a tick, Mark as draft is a page, and neither is mistaken for another action", () => {
  expect(actionLook({ id: "complete" })).toMatchObject({ tone: "ok" });
  expect(actionLook({ id: "complete" }).icon).not.toBeNull();
  expect(actionLook({ id: "draft" }).icon).not.toBeNull();
  expect(actionLook({ id: "draft" }).tone).toBe("neutral");
  // what was there before keeps its look
  expect(actionLook({ id: "archive" }).tone).toBe("warn");
  expect(actionLook({ id: "restore" }).tone).toBe("ok");
});
