import "../support/env";
import { test, expect } from "@playwright/test";
import type { ProgramViewer } from "@/lib/programs/access";
import {
  groupAndInner,
  mayBeSamePerson,
  mayChangeStanding,
  mayManagePerson,
  nameKey,
  phoneKey,
  placeState,
  standaloneProblems,
  takesPart,
  PLACE_STATES,
  type PlaceInput,
} from "@/lib/programs/people-rules";

// Programs, slice P2 (task 0043, section 9): the pure rules of people. No database, no server.

const TODAY = "2026-11-10";
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

const student = (over: Partial<NonNullable<PlaceInput["student"]>> = {}): PlaceInput => ({
  kind: "STUDENT",
  status: "ACTIVE",
  standing: "ACTIVE",
  standingUntil: null,
  student: { archivedAt: null, standing: "ACTIVE", standingUntil: null, ...over },
});
const staff = (
  record: Partial<NonNullable<PlaceInput["staff"]>> = {},
  membership: NonNullable<PlaceInput["staff"]>["membership"] = null,
): PlaceInput => ({
  kind: "STAFF",
  status: "ACTIVE",
  standing: "ACTIVE",
  standingUntil: null,
  staff: { archivedAt: null, standing: "ACTIVE", standingUntil: null, membership, ...record },
});
const alone = (kind: "GUARDIAN" | "ADULT" | "CHILD", standing = "ACTIVE", standingUntil: Date | null = null): PlaceInput => ({
  kind,
  status: "ACTIVE",
  standing,
  standingUntil,
});

test.describe("the state of a place is read from the school's own records", () => {
  test("a place that was withdrawn or completed says so, whatever the person's record says", () => {
    expect(placeState({ ...student({ standing: "EXPELLED" }), status: "WITHDRAWN" }, TODAY)).toBe("WITHDRAWN");
    expect(placeState({ ...staff({ standing: "TERMINATED" }), status: "COMPLETED" }, TODAY)).toBe("COMPLETED");
    expect(placeState({ ...alone("ADULT", "EXPELLED"), status: "WITHDRAWN" }, TODAY)).toBe("WITHDRAWN");
  });

  test("a pupil: active, suspended, expelled, archived, in that order of strictness", () => {
    expect(placeState(student(), TODAY)).toBe("ACTIVE");
    expect(placeState(student({ standing: "SUSPENDED" }), TODAY)).toBe("SUSPENDED");
    expect(placeState(student({ standing: "SUSPENDED", standingUntil: date("2026-11-10") }), TODAY)).toBe("SUSPENDED"); // its last day is still suspended
    expect(placeState(student({ standing: "SUSPENDED", standingUntil: date("2026-11-09") }), TODAY)).toBe("ACTIVE"); // ended by itself
    expect(placeState(student({ standing: "EXPELLED" }), TODAY)).toBe("EXPELLED");
    expect(placeState(student({ archivedAt: new Date() }), TODAY)).toBe("ENDED_BY_SCHOOL");
    // archived wins over a standing: the school took the record away
    expect(placeState(student({ archivedAt: new Date(), standing: "EXPELLED" }), TODAY)).toBe("ENDED_BY_SCHOOL");
    // a value that is no pupil's standing counts as active (the database refuses it)
    expect(placeState(student({ standing: "TERMINATED" }), TODAY)).toBe("ACTIVE");
  });

  test("a pupil whose record is missing is ended by the school", () => {
    expect(placeState({ kind: "STUDENT", status: "ACTIVE", standing: "ACTIVE", standingUntil: null, student: null }, TODAY)).toBe(
      "ENDED_BY_SCHOOL",
    );
  });

  test("a member of staff: terminated, archived, deactivated, suspended", () => {
    expect(placeState(staff(), TODAY)).toBe("ACTIVE");
    expect(placeState(staff({ standing: "SUSPENDED" }), TODAY)).toBe("SUSPENDED");
    expect(placeState(staff({ standing: "SUSPENDED", standingUntil: date("2026-11-09") }), TODAY)).toBe("ACTIVE");
    // terminated (the record is archived too, and that does not hide the reason)
    expect(placeState(staff({ standing: "TERMINATED", archivedAt: new Date() }), TODAY)).toBe("TERMINATED");
    expect(placeState(staff({}, { deactivatedAt: new Date(), standing: "TERMINATED", standingUntil: null }), TODAY)).toBe("TERMINATED");
    // archived with no standing behind it
    expect(placeState(staff({ archivedAt: new Date() }), TODAY)).toBe("ENDED_BY_SCHOOL");
    // deactivated with no standing behind it
    expect(placeState(staff({}, { deactivatedAt: new Date(), standing: "ACTIVE", standingUntil: null }), TODAY)).toBe("ENDED_BY_SCHOOL");
  });

  test("a staff suspension that has run out is active again even while the membership waits for the next sign-in to lift it", () => {
    const membership = { deactivatedAt: new Date(), standing: "SUSPENDED", standingUntil: date("2026-11-09") };
    expect(placeState(staff({ standing: "SUSPENDED", standingUntil: date("2026-11-09") }, membership), TODAY)).toBe("ACTIVE");
    // and while it runs it is suspended, not "ended by the school"
    const running = { deactivatedAt: new Date(), standing: "SUSPENDED", standingUntil: null };
    expect(placeState(staff({ standing: "SUSPENDED" }, running), TODAY)).toBe("SUSPENDED");
    // a school-wide suspension may sit on the membership alone (a record with no standing of its own)
    expect(placeState(staff({}, running), TODAY)).toBe("SUSPENDED");
  });

  test("a person with no school record: standing lives on the participant row", () => {
    for (const kind of ["GUARDIAN", "ADULT", "CHILD"] as const) {
      expect(placeState(alone(kind), TODAY), kind).toBe("ACTIVE");
      expect(placeState(alone(kind, "SUSPENDED"), TODAY), kind).toBe("SUSPENDED");
      expect(placeState(alone(kind, "SUSPENDED", date("2026-11-09")), TODAY), kind).toBe("ACTIVE");
      expect(placeState(alone(kind, "EXPELLED"), TODAY), kind).toBe("EXPELLED");
      expect(placeState(alone(kind, "TERMINATED"), TODAY), kind).toBe("ACTIVE"); // not a standing a person like this can have
    }
  });

  test("only an ACTIVE place takes part; every other state can still be read", () => {
    expect(PLACE_STATES.filter(takesPart)).toEqual(["ACTIVE"]);
  });
});

test.describe("the namesake guard", () => {
  test("a name written differently is the same name", () => {
    expect(nameKey("  Amina ", "MUSA")).toBe(nameKey("amina", "Musa"));
    expect(nameKey("Amina", "Musa")).not.toBe(nameKey("Aminah", "Musa"));
  });

  test("phone numbers written four ways are one number; a short one is no number", () => {
    expect(phoneKey("08012345678")).toBe("8012345678");
    expect(phoneKey("+234 801 234 5678")).toBe("8012345678");
    expect(phoneKey("2348012345678")).toBe("8012345678");
    expect(phoneKey("0801-234-5678")).toBe("8012345678");
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey("")).toBeNull();
  });

  test("the same name and birth date, or the same phone, may be the same person; the same name alone is not enough", () => {
    const a = { firstName: "Amina", lastName: "Musa", dateOfBirth: "2013-05-10", phone: "08011110001" };
    expect(mayBeSamePerson(a, { ...a, firstName: " amina", phone: null })).toBe(true); // name + birth date
    expect(mayBeSamePerson(a, { ...a, firstName: "Binta", dateOfBirth: null, phone: "+2348011110001" })).toBe(true); // phone
    expect(mayBeSamePerson(a, { ...a, dateOfBirth: "2014-01-01", phone: "08099990000" })).toBe(false); // same name, nothing else
    expect(mayBeSamePerson({ ...a, dateOfBirth: null, phone: null }, { ...a, dateOfBirth: null, phone: null })).toBe(false); // nothing to go on
  });
});

test.describe("the tree", () => {
  const groups = [
    { id: "a", parentId: null, name: "Juz A" },
    { id: "a1", parentId: "a", name: "Group 1" },
    { id: "a2", parentId: "a", name: "Group 2" },
    { id: "a1x", parentId: "a1", name: "Row x" },
    { id: "b", parentId: null, name: "Juz B" },
  ];
  test("a group and everything inside it, at any depth, and nothing beside it", () => {
    expect(groupAndInner(groups, "a").sort()).toEqual(["a", "a1", "a1x", "a2"]);
    expect(groupAndInner(groups, "a1")).toEqual(["a1", "a1x"]);
    expect(groupAndInner(groups, "b")).toEqual(["b"]);
    expect(groupAndInner(groups, "nope")).toEqual(["nope"]);
  });
});

test.describe("who may manage and see a person", () => {
  test("a super admin and a program admin: anyone in the program; a branch administrator: only people through their own branch", () => {
    expect(mayManagePerson({ level: "SUPER" }, "b1")).toBe(true);
    expect(mayManagePerson({ level: "ADMIN" }, "b2")).toBe(true);
    expect(mayManagePerson({ level: "BRANCH", branchIds: ["b1"] }, "b1")).toBe(true);
    expect(mayManagePerson({ level: "BRANCH", branchIds: ["b1"] }, "b2")).toBe(false);
    expect(mayManagePerson({ level: "BRANCH", branchIds: [] }, "b1")).toBe(false);
  });
});

test.describe("who may change a standalone person's standing", () => {
  const sa: ProgramViewer = { level: "SUPER" };
  const pa: ProgramViewer = { level: "ADMIN" };
  const ba: ProgramViewer = { level: "BRANCH", branchIds: ["b1"] };

  test("suspend and lift: a super admin, a program admin, and a branch administrator of that branch, while the school's switch allows it", () => {
    for (const action of ["SUSPEND", "LIFT"] as const) {
      expect(mayChangeStanding(sa, action, "b1", true, "u")).toBeNull();
      expect(mayChangeStanding(pa, action, "b1", true, "u")).toBeNull();
      expect(mayChangeStanding(ba, action, "b1", true, "u")).toBeNull();
      // the switch holds program admins and branch administrators alike; a super admin is not held by it
      expect(mayChangeStanding(pa, action, "b1", false, "u")).toBe("FORBIDDEN");
      expect(mayChangeStanding(ba, action, "b1", false, "u")).toBe("FORBIDDEN");
      expect(mayChangeStanding(sa, action, "b1", false, "u")).toBeNull();
    }
  });

  test("expel and reinstate are a super admin's alone", () => {
    for (const action of ["EXPEL", "REINSTATE"] as const) {
      expect(mayChangeStanding(sa, action, "b1", true, "u")).toBeNull();
      expect(mayChangeStanding(pa, action, "b1", true, "u")).toBe("FORBIDDEN");
      expect(mayChangeStanding(ba, action, "b1", true, "u")).toBe("FORBIDDEN");
    }
  });

  test("a branch administrator has no say over another branch's people: that is 'not yours' (a 404), never 'forbidden'", () => {
    expect(mayChangeStanding(ba, "SUSPEND", "b2", true, "u")).toBe("NOT_YOURS");
    expect(mayChangeStanding(ba, "EXPEL", "b2", true, "u")).toBe("NOT_YOURS");
  });
});

test.describe("what a person who is typed in must give", () => {
  test("every kind needs a first and a last name", () => {
    for (const kind of ["GUARDIAN", "ADULT"] as const) {
      expect(standaloneProblems({ kind, firstName: "Amina", lastName: "Musa" })).toEqual([]);
      expect(standaloneProblems({ kind, firstName: " ", lastName: "" }).map((p) => p.path)).toEqual(["body.firstName", "body.lastName"]);
    }
  });

  test("a child also needs a birth date, a guardian's name and a guardian's phone", () => {
    expect(standaloneProblems({ kind: "CHILD", firstName: "Binta", lastName: "Musa" }).map((p) => p.path)).toEqual([
      "body.dateOfBirth",
      "body.guardianName",
      "body.guardianPhone",
    ]);
    expect(
      standaloneProblems({
        kind: "CHILD",
        firstName: "Binta",
        lastName: "Musa",
        dateOfBirth: "2020-03-04",
        guardianName: "Hauwa Musa",
        guardianPhone: "+2348011110001",
      }),
    ).toEqual([]);
    // a phone with too few digits is no phone
    expect(
      standaloneProblems({
        kind: "CHILD",
        firstName: "B",
        lastName: "M",
        dateOfBirth: "2020-03-04",
        guardianName: "H",
        guardianPhone: "123",
      }).map((p) => p.path),
    ).toEqual(["body.guardianPhone"]);
  });
});
