import "../support/env";
import { test, expect } from "@playwright/test";
import {
  ACTION_TEXT,
  KIND_TEXT,
  SKIP_TEXT,
  STATE_STYLE,
  STATE_TEXT,
  actionsFor,
  whereToChange,
  type PersonView,
} from "@/components/programs/people-model";

// Programs, slice P2: what the People tab offers per state (task 0043, section 9). Pure: the words and the buttons-per-state rule. A button is a courtesy; the routes check again.

const person = (over: Partial<PersonView> = {}): PersonView => ({
  kind: "ADULT",
  linked: false,
  status: "ACTIVE",
  state: "ACTIVE",
  can: { suspend: true, remove: true },
  ...over,
});

test.describe("the buttons of a row", () => {
  test("a person typed in who is taking part: move, withdraw, edit, suspend and expel", () => {
    expect(actionsFor(person(), true)).toEqual(["move", "withdraw", "edit", "suspend", "expel"]);
  });

  test("a suspended person typed in can be lifted or expelled; an expelled one reinstated", () => {
    expect(actionsFor(person({ state: "SUSPENDED" }), true)).toEqual(["move", "withdraw", "edit", "lift", "expel"]);
    expect(actionsFor(person({ state: "EXPELLED" }), true)).toEqual(["move", "withdraw", "edit", "reinstate"]);
  });

  test("what the viewer may do about standing decides which standing buttons show", () => {
    expect(actionsFor(person({ can: { suspend: true, remove: false } }), true)).toEqual(["move", "withdraw", "edit", "suspend"]);
    expect(actionsFor(person({ can: { suspend: false, remove: false } }), true)).toEqual(["move", "withdraw", "edit"]);
    expect(actionsFor(person({ state: "EXPELLED", can: { suspend: true, remove: false } }), true)).toEqual(["move", "withdraw", "edit"]);
  });

  test("a pupil or a member of staff is moved and withdrawn here, and never edited or disciplined here", () => {
    for (const kind of ["STUDENT", "STAFF"] as const) {
      for (const state of ["ACTIVE", "SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL"] as const) {
        expect(actionsFor(person({ kind, linked: true, state }), true), `${kind} ${state}`).toEqual(["move", "withdraw"]);
      }
    }
  });

  test("someone who left can only be re-enrolled; a completed place offers nothing; a read-only program offers nothing at all", () => {
    expect(actionsFor(person({ status: "WITHDRAWN", state: "WITHDRAWN" }), true)).toEqual(["reenrol"]);
    expect(actionsFor(person({ status: "WITHDRAWN", state: "WITHDRAWN", linked: true, kind: "STUDENT" }), true)).toEqual(["reenrol"]);
    expect(actionsFor(person({ status: "COMPLETED", state: "COMPLETED" }), true)).toEqual([]);
    for (const status of ["ACTIVE", "WITHDRAWN", "COMPLETED"] as const) expect(actionsFor(person({ status }), false), status).toEqual([]);
  });
});

test.describe("where to change a linked person's standing", () => {
  test("a pupil and a member of staff are sent to their own page; everyone else, and anyone in good standing, is not", () => {
    expect(whereToChange({ kind: "STUDENT", linked: true, status: "ACTIVE", state: "SUSPENDED" })).toBe(
      "Change this on the Students page.",
    );
    expect(whereToChange({ kind: "STUDENT", linked: true, status: "ACTIVE", state: "EXPELLED" })).toBe("Change this on the Students page.");
    expect(whereToChange({ kind: "STAFF", linked: true, status: "ACTIVE", state: "TERMINATED" })).toBe("Change this on the Users page.");
    expect(whereToChange({ kind: "STUDENT", linked: true, status: "ACTIVE", state: "ENDED_BY_SCHOOL" })).toMatch(/archived.*Students page/);
    expect(whereToChange({ kind: "STAFF", linked: true, status: "ACTIVE", state: "ENDED_BY_SCHOOL" })).toMatch(/Users page/);
    expect(whereToChange({ kind: "STUDENT", linked: true, status: "ACTIVE", state: "ACTIVE" })).toBeNull();
    expect(whereToChange({ kind: "ADULT", linked: false, status: "ACTIVE", state: "SUSPENDED" })).toBeNull(); // changed on this very tab
    expect(whereToChange({ kind: "STUDENT", linked: true, status: "WITHDRAWN", state: "WITHDRAWN" })).toBeNull();
  });
});

test.describe("the words", () => {
  test("every state, kind and action the server can send has words, and every state a colour", () => {
    for (const state of ["ACTIVE", "SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL", "WITHDRAWN", "COMPLETED"] as const) {
      expect(STATE_TEXT[state], state).toBeTruthy();
      expect(STATE_STYLE[state], state).toBeTruthy();
    }
    expect(Object.keys(KIND_TEXT).sort()).toEqual(["ADULT", "CHILD", "GUARDIAN", "STAFF", "STUDENT"]);
    for (const action of [
      "PERSON_ADDED",
      "PERSON_EDITED",
      "PERSON_MOVED",
      "PERSON_WITHDRAWN",
      "PERSON_REENROLLED",
      "PERSON_SUSPEND",
      "PERSON_LIFT",
      "PERSON_EXPEL",
      "PERSON_REINSTATE",
      "CLASS_ADDED",
    ]) {
      expect(ACTION_TEXT[action], action).toBeTruthy();
    }
    for (const reason of ["ALREADY_IN", "LEFT_ALREADY", "ARCHIVED", "EXPELLED"]) expect(SKIP_TEXT[reason], reason).toBeTruthy();
  });
});
