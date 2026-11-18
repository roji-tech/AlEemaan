import { expect, test } from "@playwright/test";
import type { Role } from "@prisma/client";
import {
  PORTAL_CLOSED_NOTICE,
  SWITCHES_OFF,
  describeChange,
  listNames,
  loginClosedFor,
  membershipOpen,
  portalLoginClosed,
  targetBranchIds,
  toLoginMembership,
  type BranchChange,
  type LoginMembership,
  type SwitchScope,
} from "@/lib/auth/login-switch-rules";
import { MAX_BRANCHES_PER_CHANGE, loginSwitchesInput } from "@/lib/auth/login-switch-input";

// The pure rules of the per-branch student and parent sign-in switches (task 0091): when a membership gets its holder in, who is never closed, which branches a change may name for an
// administrator and for a superadmin, what the person is told, and the body of the change. The server rules that use them (the sign-in refusal, the session check, the settings route) have
// their own tests (tests/api/student-parent-login-switch.spec.ts).

const member = (role: Role, student: boolean, parent: boolean): LoginMembership => ({
  role,
  studentLoginEnabled: student,
  parentLoginEnabled: parent,
});
const person = (memberships: LoginMembership[], isSuperAdmin = false) => ({ isSuperAdmin, memberships });

test("the default is both OFF", () => {
  expect(SWITCHES_OFF).toEqual({ studentLoginEnabled: false, parentLoginEnabled: false });
});

test.describe("a membership gets its holder in on the strength of ITS OWN branch's switch for ITS role", () => {
  test("a student membership needs the student switch, a parent membership the parent switch, and no other switch helps", () => {
    expect(membershipOpen(member("STUDENT", true, false))).toBe(true);
    expect(membershipOpen(member("STUDENT", false, true))).toBe(false); // the parent switch is not the student's
    expect(membershipOpen(member("STUDENT", false, false))).toBe(false);
    expect(membershipOpen(member("PARENT", false, true))).toBe(true);
    expect(membershipOpen(member("PARENT", true, false))).toBe(false); // the student switch is not the parent's
    expect(membershipOpen(member("PARENT", false, false))).toBe(false);
  });

  test("a staff membership is not about the switches at all", () => {
    for (const role of ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const)
      expect(membershipOpen(member(role, false, false)), role).toBe(true);
  });

  test("toLoginMembership flattens a membership row with its branch's two columns", () => {
    expect(toLoginMembership({ role: "PARENT", branch: { studentLoginEnabled: false, parentLoginEnabled: true } })).toEqual(
      member("PARENT", false, true),
    );
  });
});

test.describe("a person whose only roles are student and/or parent", () => {
  test("is closed in a closed branch and open in an open one", () => {
    expect(loginClosedFor(person([member("STUDENT", false, false)]))).toBe(true);
    expect(loginClosedFor(person([member("STUDENT", true, false)]))).toBe(false);
    expect(loginClosedFor(person([member("PARENT", false, false)]))).toBe(true);
    expect(loginClosedFor(person([member("PARENT", false, true)]))).toBe(false);
  });

  test("is closed when the open switch is for the OTHER role", () => {
    expect(loginClosedFor(person([member("STUDENT", false, true)]))).toBe(true);
    expect(loginClosedFor(person([member("PARENT", true, false)]))).toBe(true);
  });

  test("attached to several branches, is admitted by any one that is open for the role they hold there, and closed only when none is", () => {
    const closed = member("STUDENT", false, false);
    const open = member("STUDENT", true, false);
    expect(loginClosedFor(person([closed, closed]))).toBe(true);
    expect(loginClosedFor(person([closed, open]))).toBe(false);
    expect(loginClosedFor(person([open, closed]))).toBe(false);
    // a student in one branch and a parent in another: each membership needs its OWN branch's switch for its OWN role
    expect(loginClosedFor(person([member("STUDENT", false, true), member("PARENT", true, false)]))).toBe(true);
    expect(loginClosedFor(person([member("STUDENT", false, true), member("PARENT", false, true)]))).toBe(false);
    expect(loginClosedFor(person([member("STUDENT", true, false), member("PARENT", true, false)]))).toBe(false);
  });
});

test.describe("who is never closed", () => {
  test("any other active role, alone or beside a student or parent membership in a closed branch", () => {
    for (const role of ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const) {
      expect(loginClosedFor(person([member(role, false, false)])), role).toBe(false);
      expect(loginClosedFor(person([member(role, false, false), member("PARENT", false, false)])), `${role} + a closed parent branch`).toBe(
        false,
      );
      expect(
        loginClosedFor(person([member(role, false, false), member("STUDENT", false, false)])),
        `${role} + a closed student branch`,
      ).toBe(false);
    }
  });

  test("a superadmin, whatever role they hold", () => {
    expect(loginClosedFor(person([member("PARENT", false, false)], true))).toBe(false);
    expect(loginClosedFor(person([member("STUDENT", false, false)], true))).toBe(false);
  });

  test("a person with no active membership (the portal rule and the pages decide what they see)", () => {
    expect(loginClosedFor(person([]))).toBe(false);
  });
});

test("only the student and the parent portals can be closed, and only when NO branch has their switch on", () => {
  expect(portalLoginClosed("student", { student: false, parent: true })).toBe(true);
  expect(portalLoginClosed("student", { student: true, parent: false })).toBe(false);
  expect(portalLoginClosed("parent", { student: true, parent: false })).toBe(true);
  expect(portalLoginClosed("parent", { student: false, parent: true })).toBe(false);
  for (const portal of ["admin", "staff", null] as const)
    expect(portalLoginClosed(portal, { student: false, parent: false }), String(portal)).toBe(false);
});

test("the portal notice names the portal and nothing about any account", () => {
  expect(PORTAL_CLOSED_NOTICE.student).toMatch(/^Student sign-in is closed/);
  expect(PORTAL_CLOSED_NOTICE.parent).toMatch(/^Parent sign-in is closed/);
  for (const text of Object.values(PORTAL_CLOSED_NOTICE)) expect(text).not.toMatch(/password|account|email/i);
});

test.describe("which branches a change may name", () => {
  const EXISTING = ["a", "b", "c", "d"];
  const admin = (...branchIds: string[]): SwitchScope => ({ superAdmin: false, branchIds });
  const superAdmin: SwitchScope = { superAdmin: true, branchIds: [] };

  test("an administrator may name their own branches, one or several, in the order given", () => {
    expect(targetBranchIds({ branchIds: ["a"] }, admin("a"), EXISTING)).toEqual({ ok: true, ids: ["a"] });
    expect(targetBranchIds({ branchIds: ["c", "a"] }, admin("a", "c"), EXISTING)).toEqual({ ok: true, ids: ["c", "a"] });
  });

  test("an administrator naming a branch that is not theirs is refused whole (403), and an unknown id gets the SAME answer, so nothing is revealed about other branches", () => {
    const other = targetBranchIds({ branchIds: ["b"] }, admin("a"), EXISTING);
    const mixed = targetBranchIds({ branchIds: ["a", "b"] }, admin("a"), EXISTING);
    const unknown = targetBranchIds({ branchIds: ["zzz"] }, admin("a"), EXISTING);
    expect(other).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
    expect(mixed).toEqual(other);
    expect(unknown).toEqual(other);
  });

  test("allBranches means every branch of the caller's own for an administrator, never one that is not theirs", () => {
    expect(targetBranchIds({ allBranches: true }, admin("b", "d"), EXISTING)).toEqual({ ok: true, ids: ["b", "d"] });
    expect(targetBranchIds({ allBranches: true }, admin("a"), EXISTING)).toEqual({ ok: true, ids: ["a"] });
    // a branch in the administrator's list that no longer exists is not a branch to change
    expect(targetBranchIds({ allBranches: true }, admin("gone"), EXISTING)).toMatchObject({ ok: false, status: 404 });
  });

  test("a superadmin may name any subset, in the order given, or all", () => {
    expect(targetBranchIds({ branchIds: ["d", "b"] }, superAdmin, EXISTING)).toEqual({ ok: true, ids: ["d", "b"] });
    expect(targetBranchIds({ allBranches: true }, superAdmin, EXISTING)).toEqual({ ok: true, ids: EXISTING });
  });

  test("a superadmin naming a branch that does not exist is refused whole (404); with no branch at all there is nothing to change", () => {
    expect(targetBranchIds({ branchIds: ["a", "zzz"] }, superAdmin, EXISTING)).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
    expect(targetBranchIds({ allBranches: true }, superAdmin, [])).toMatchObject({ ok: false, status: 404 });
    expect(targetBranchIds({ branchIds: [] }, superAdmin, EXISTING)).toMatchObject({ ok: false, status: 404 });
  });
});

test.describe("what the person is told", () => {
  const change = (name: string, before: [boolean, boolean], after: [boolean, boolean]): BranchChange => ({
    id: name,
    name,
    before: { studentLoginEnabled: before[0], parentLoginEnabled: before[1] },
    after: { studentLoginEnabled: after[0], parentLoginEnabled: after[1] },
  });

  test("names the switch, the direction and the branches, from what changed", () => {
    expect(describeChange([change("Primary", [false, false], [true, false])])).toBe("Student sign-in is now on in Primary.");
    expect(describeChange([change("Primary", [false, false], [false, true])])).toBe("Parent sign-in is now on in Primary.");
  });

  test("turning a switch off says what it does to people who are signed in", () => {
    expect(describeChange([change("Primary", [true, false], [false, false])])).toBe(
      "Student sign-in is now off in Primary. Students who are signed in there are signed out on their next click.",
    );
    expect(describeChange([change("Primary", [false, true], [false, false])])).toContain("Parents who are signed in there are signed out");
  });

  test("a change of both switches in several branches reads as one account", () => {
    const text = describeChange([change("A", [false, false], [true, true]), change("B", [false, false], [true, true])]);
    expect(text).toBe("Student sign-in is now on in A and B. Parent sign-in is now on in A and B.");
  });

  test("nothing changed is said as such", () => {
    expect(describeChange([])).toBe("Nothing was different, so nothing was changed.");
  });

  test("lists read as sentences, and past six names are a count", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C"])).toBe("A, B and C");
    expect(listNames(["1", "2", "3", "4", "5", "6", "7"])).toBe("7 branches");
  });
});

test.describe("the body of the change", () => {
  const id = "cmabc123";
  test("takes branchIds or allBranches (exactly one) and either switch or both, real booleans, nothing else", () => {
    expect(loginSwitchesInput.safeParse({ branchIds: [id], studentLoginEnabled: true }).success).toBe(true);
    expect(loginSwitchesInput.safeParse({ branchIds: [id, "cmdef456"], parentLoginEnabled: false }).success).toBe(true);
    expect(loginSwitchesInput.safeParse({ allBranches: true, studentLoginEnabled: true, parentLoginEnabled: true }).success).toBe(true);
  });

  test("refuses a body with neither or both of branchIds and allBranches", () => {
    expect(loginSwitchesInput.safeParse({ studentLoginEnabled: true }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: [id], allBranches: true, studentLoginEnabled: true }).success).toBe(false);
  });

  test("refuses a body that changes no switch", () => {
    expect(loginSwitchesInput.safeParse({ branchIds: [id] }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ allBranches: true }).success).toBe(false);
  });

  test("refuses a bad list of branches: empty, a duplicate, not an id, too many", () => {
    expect(loginSwitchesInput.safeParse({ branchIds: [], studentLoginEnabled: true }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: [id, id], studentLoginEnabled: true }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: ["not an id"], studentLoginEnabled: true }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: [id, 5], studentLoginEnabled: true }).success).toBe(false);
    const many = Array.from({ length: MAX_BRANCHES_PER_CHANGE + 1 }, (_, i) => `b${i}`);
    expect(loginSwitchesInput.safeParse({ branchIds: many, studentLoginEnabled: true }).success).toBe(false);
  });

  test("refuses a switch that is not a real boolean, allBranches that is not true, and any other key", () => {
    for (const value of ["true", 1, null])
      expect(loginSwitchesInput.safeParse({ branchIds: [id], studentLoginEnabled: value }).success, String(value)).toBe(false);
    expect(loginSwitchesInput.safeParse({ allBranches: false, studentLoginEnabled: true }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: [id], studentLoginEnabled: true, other: 1 }).success).toBe(false);
    expect(loginSwitchesInput.safeParse({ branchIds: [id], setupComplete: true }).success).toBe(false);
  });
});
