import "../support/env";
import { test, expect } from "@playwright/test";
import { DEFAULT_PORTAL_ACCESS, allowedTabs, type Access } from "@/lib/portal/access";
import {
  capForStanding,
  dayOf,
  effectiveStanding,
  mayAct,
  standingAfter,
  suspensionEndProblem,
  type Context,
  type StandingAction,
  type Who,
} from "@/lib/standing/rules";

// Standing (task 0045): the pure rules. No database, no server.

const pupil = DEFAULT_PORTAL_ACCESS.pupil;
const guardian = DEFAULT_PORTAL_ACCESS.guardian;

test.describe("a suspension ends by itself, with no job", () => {
  test("it applies until its end date inclusive, or until lifted when it has none", () => {
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-03")).toBe("SUSPENDED");
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-10")).toBe("SUSPENDED"); // the last day still counts
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-11")).toBe("ACTIVE");
    expect(effectiveStanding("SUSPENDED", null, "2099-01-01")).toBe("SUSPENDED");
  });

  test("an expulsion, a termination and an active record never change with the date", () => {
    expect(effectiveStanding("EXPELLED", "2020-01-01", "2026-11-03")).toBe("EXPELLED");
    expect(effectiveStanding("TERMINATED", null, "2026-11-03")).toBe("TERMINATED");
    expect(effectiveStanding("ACTIVE", null, "2026-11-03")).toBe("ACTIVE");
  });

  test("the end date must be a real day that is not past", () => {
    expect(suspensionEndProblem(null, "2026-11-03")).toBeNull();
    expect(suspensionEndProblem("2026-11-03", "2026-11-03")).toBeNull(); // today is allowed
    expect(suspensionEndProblem("2026-11-02", "2026-11-03")).toMatch(/past/);
    for (const bad of ["2026-02-30", "soon", "2026-1-1", "2026-11-03T00:00:00Z"])
      expect(suspensionEndProblem(bad, "2026-11-03"), bad).toMatch(/real date/);
    expect(dayOf(new Date("2026-11-03T23:59:59Z"))).toBe("2026-11-03");
  });
});

test.describe("what a standing does to the portal: it only narrows", () => {
  test("an active pupil and guardian keep exactly what the branch gave", () => {
    expect(capForStanding(pupil, "PUPIL", "ACTIVE")).toEqual(pupil);
    expect(capForStanding(guardian, "GUARDIAN", "ACTIVE")).toEqual(guardian);
  });

  test("a suspended pupil cannot hand in work, take quizzes or practise, and keeps the rest; a suspended pupil's guardian is unchanged", () => {
    const capped = capForStanding(pupil, "PUPIL", "SUSPENDED")!;
    expect(capped).toMatchObject({
      submitWork: false,
      takeQuizzes: false,
      practice: "NONE",
      overview: true,
      results: true,
      materials: true,
    });
    expect(capForStanding(guardian, "GUARDIAN", "SUSPENDED")).toEqual(guardian);
  });

  test("an expelled pupil is refused, and the guardian keeps the invoices only", () => {
    expect(capForStanding(pupil, "PUPIL", "EXPELLED")).toBeNull();
    const kept = capForStanding(guardian, "GUARDIAN", "EXPELLED")!;
    expect(kept.invoices).toBe(true);
    expect(allowedTabs(kept)).toEqual(["finance"]);
    expect([kept.overview, kept.results, kept.materials, kept.submitWork, kept.takeQuizzes]).toEqual([false, false, false, false, false]);
    // The sibling switch is the branch's own: it opens nothing of this child, so the guardian still sees their other children in the same sign-in.
    expect(kept.siblings).toBe(guardian.siblings);
    expect(kept.practice).toBe("NONE");
  });

  test("an expelled child whose guardian has no invoices section leaves nothing to open: refused", () => {
    expect(capForStanding({ ...guardian, invoices: false }, "GUARDIAN", "EXPELLED")).toBeNull();
  });

  test("a standing never gives more than the branch gave, for any access and any standing", () => {
    const keys = ["overview", "results", "invoices", "materials", "submitWork", "takeQuizzes", "siblings"] as const;
    for (const base of [pupil, guardian, { ...pupil, invoices: true }, { ...guardian, results: false }] as Access[]) {
      for (const actor of ["PUPIL", "GUARDIAN"] as const) {
        for (const standing of ["ACTIVE", "SUSPENDED", "EXPELLED"] as const) {
          const out = capForStanding(base, actor, standing);
          if (!out) continue;
          for (const key of keys) expect(out[key] && !base[key], `${actor} ${standing} ${key}`).toBe(false);
          expect(["NONE", "SUMMARY", "FULL"].indexOf(out.practice)).toBeLessThanOrEqual(["NONE", "SUMMARY", "FULL"].indexOf(base.practice));
        }
      }
    }
  });
});

test.describe("who may do what", () => {
  const superAdmin: Who = { userId: "sa", superAdmin: true, adminOfBranch: true };
  const branchAdmin: Who = { userId: "ba", superAdmin: false, adminOfBranch: true };
  const otherBranchAdmin: Who = { userId: "ob", superAdmin: false, adminOfBranch: false };
  const base: Context = { scope: "BRANCH", branchAdminMaySuspend: true };

  test("a super admin may do everything to anyone but themselves", () => {
    for (const action of ["SUSPEND", "LIFT", "EXPEL", "TERMINATE", "REINSTATE"] as StandingAction[]) {
      expect(mayAct(action, superAdmin, base)).toBeNull();
      expect(mayAct(action, superAdmin, { ...base, scope: "SCHOOL" })).toBeNull();
      expect(mayAct(action, superAdmin, { ...base, targetUserId: "sa" })).toBe("SELF");
    }
  });

  test("a branch administrator suspends and lifts in their own branch, never expels, terminates or reinstates, never school-wide", () => {
    expect(mayAct("SUSPEND", branchAdmin, base)).toBeNull();
    expect(mayAct("LIFT", branchAdmin, base)).toBeNull();
    for (const action of ["EXPEL", "TERMINATE", "REINSTATE"] as StandingAction[])
      expect(mayAct(action, branchAdmin, base)).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", branchAdmin, { ...base, scope: "SCHOOL" })).toBe("FORBIDDEN");
  });

  test("not another administrator, not another branch, not themselves, and not when the school's ceiling is off", () => {
    expect(mayAct("SUSPEND", branchAdmin, { ...base, targetIsAdmin: true })).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", otherBranchAdmin, base)).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", branchAdmin, { ...base, targetUserId: "ba" })).toBe("SELF");
    expect(mayAct("SUSPEND", branchAdmin, { ...base, branchAdminMaySuspend: false })).toBe("FORBIDDEN");
    expect(mayAct("LIFT", branchAdmin, { ...base, branchAdminMaySuspend: false })).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", superAdmin, { ...base, branchAdminMaySuspend: false })).toBeNull(); // the ceiling holds administrators, not the super admin
  });
});

test.describe("what each action leads to", () => {
  test("a pupil", () => {
    expect(standingAfter("SUSPEND", "STUDENT", "ACTIVE")).toBe("SUSPENDED");
    expect(standingAfter("SUSPEND", "STUDENT", "SUSPENDED")).toBeNull();
    expect(standingAfter("SUSPEND", "STUDENT", "EXPELLED")).toBeNull();
    expect(standingAfter("LIFT", "STUDENT", "SUSPENDED")).toBe("ACTIVE");
    expect(standingAfter("LIFT", "STUDENT", "EXPELLED")).toBeNull(); // the expelled are reinstated, not lifted
    expect(standingAfter("EXPEL", "STUDENT", "ACTIVE")).toBe("EXPELLED");
    expect(standingAfter("EXPEL", "STUDENT", "SUSPENDED")).toBe("EXPELLED");
    expect(standingAfter("EXPEL", "STUDENT", "EXPELLED")).toBeNull();
    expect(standingAfter("REINSTATE", "STUDENT", "EXPELLED")).toBe("ACTIVE");
    expect(standingAfter("REINSTATE", "STUDENT", "SUSPENDED")).toBeNull();
    expect(standingAfter("TERMINATE", "STUDENT", "ACTIVE")).toBeNull(); // a pupil is expelled, not terminated
  });

  test("a member of staff", () => {
    expect(standingAfter("SUSPEND", "STAFF", "ACTIVE")).toBe("SUSPENDED");
    expect(standingAfter("TERMINATE", "STAFF", "ACTIVE")).toBe("TERMINATED");
    expect(standingAfter("TERMINATE", "STAFF", "SUSPENDED")).toBe("TERMINATED");
    expect(standingAfter("TERMINATE", "STAFF", "TERMINATED")).toBeNull();
    expect(standingAfter("REINSTATE", "STAFF", "TERMINATED")).toBe("ACTIVE");
    expect(standingAfter("EXPEL", "STAFF", "ACTIVE")).toBeNull();
  });
});
