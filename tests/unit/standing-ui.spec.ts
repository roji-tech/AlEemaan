import { test, expect } from "@playwright/test";
import { EVENT_TEXT, KIND_TEXT, explain, kindsFor, prettyDay, standingLine, type StandingCan } from "@/components/standing/model";

// What the standing screens offer and say (task 0045). Pure: the buttons a row shows for each state, and the sentences.

const SUPER: StandingCan = { suspend: true, remove: true };
const BRANCH: StandingCan = { suspend: true, remove: false };
const NONE: StandingCan = { suspend: false, remove: false };

test.describe("which buttons a row offers", () => {
  test("a pupil: a super admin gets suspend and expel, lift and expel, then reinstate", () => {
    expect(kindsFor("student", "ACTIVE", SUPER)).toEqual(["suspend", "expel"]);
    expect(kindsFor("student", "SUSPENDED", SUPER)).toEqual(["lift", "expel"]);
    expect(kindsFor("student", "EXPELLED", SUPER)).toEqual(["reinstate"]);
  });

  test("staff: terminate instead of expel", () => {
    expect(kindsFor("staff", "ACTIVE", SUPER)).toEqual(["suspend", "terminate"]);
    expect(kindsFor("staff", "SUSPENDED", SUPER)).toEqual(["lift", "terminate"]);
    expect(kindsFor("staff", "TERMINATED", SUPER)).toEqual(["reinstate"]);
  });

  test("a branch administrator can suspend and lift, never expel, terminate or reinstate", () => {
    expect(kindsFor("student", "ACTIVE", BRANCH)).toEqual(["suspend"]);
    expect(kindsFor("student", "SUSPENDED", BRANCH)).toEqual(["lift"]);
    expect(kindsFor("student", "EXPELLED", BRANCH)).toEqual([]);
    expect(kindsFor("staff", "TERMINATED", BRANCH)).toEqual([]);
  });

  test("someone who may do nothing is offered nothing", () => {
    for (const standing of ["ACTIVE", "SUSPENDED", "EXPELLED", "TERMINATED"] as const)
      expect(kindsFor("student", standing, NONE)).toEqual([]);
  });
});

test.describe("the words", () => {
  test("every action has a label and every history entry has a sentence", () => {
    for (const kind of ["suspend", "lift", "expel", "terminate", "reinstate"] as const) expect(KIND_TEXT[kind].length).toBeGreaterThan(3);
    for (const action of ["SUSPENDED", "LIFTED", "EXPELLED", "TERMINATED", "REINSTATED"]) expect(EVENT_TEXT[action]).toBeTruthy();
  });

  test("what an action does is said before it is confirmed, with the name, and never promises what it doesn't do", () => {
    expect(explain("suspend", "student", "Amina Bello")).toContain("Amina Bello");
    expect(explain("suspend", "student", "Amina Bello")).toMatch(/hand in work, take quizzes or practise/);
    expect(explain("suspend", "student", "Amina Bello")).toMatch(/guardian is not affected/);
    expect(explain("expel", "student", "Amina Bello")).toMatch(/guardian can still see the invoices/);
    expect(explain("expel", "student", "Amina Bello")).toMatch(/super admin can reinstate/);
    expect(explain("terminate", "staff", "Mr Ade")).toMatch(/signed out/);
    expect(explain("terminate", "staff", "Mr Ade")).toMatch(/Nothing they did is deleted/);
    expect(explain("reinstate", "staff", "Mr Ade")).toMatch(/same role/);
  });

  test("a day is shown without a time zone moving it", () => {
    expect(prettyDay("2026-11-12")).toBe("12 Nov 2026");
    expect(prettyDay("2027-01-01")).toBe("1 Jan 2027");
    expect(prettyDay("garbage")).toBe("garbage");
  });

  test("the badge line", () => {
    expect(standingLine("SUSPENDED", "2026-11-12")).toBe("Suspended until 12 Nov 2026");
    expect(standingLine("SUSPENDED", null)).toBe("Suspended");
    expect(standingLine("EXPELLED", null)).toBe("Expelled");
    expect(standingLine("TERMINATED", null)).toBe("Terminated");
    expect(standingLine("ACTIVE", null)).toBe("In good standing");
  });
});
