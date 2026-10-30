import { test, expect } from "@playwright/test";
import {
  ACTORS,
  CAPABILITIES,
  DEFAULT_PORTAL_ACCESS,
  PORTAL_TABS,
  accessFor,
  allowedTabs,
  capGuardianPractice,
  lowerLevel,
  portalAccessProblems,
  resolvePortalAccess,
  widens,
  type PortalAccess,
} from "@/lib/portal/access";
import { portalAccessInput } from "@/lib/portal/access-input";

// What a pupil and a guardian may do in the portal (task 0040): the defaults are the maintainer's table; a stored value is read tolerantly (a missing or damaged one
// is the default, never an error); a value sent by the settings screen is strict; and a change that gives somebody more is recognised.

const clone = (value: PortalAccess): PortalAccess => JSON.parse(JSON.stringify(value));

test.describe("the defaults are the maintainer's table", () => {
  test("a pupil: overview, results, materials, submit work, quizzes, full practice; no invoices, no siblings", () => {
    expect(DEFAULT_PORTAL_ACCESS.pupil).toEqual({
      overview: true,
      results: true,
      invoices: false,
      materials: true,
      submitWork: true,
      takeQuizzes: true,
      siblings: false,
      practice: "FULL",
    });
  });
  test("a guardian: overview, results, invoices, materials, every linked child, a practice summary; no submitting, no quizzes", () => {
    expect(DEFAULT_PORTAL_ACCESS.guardian).toEqual({
      overview: true,
      results: true,
      invoices: true,
      materials: true,
      submitWork: false,
      takeQuizzes: false,
      siblings: true,
      practice: "SUMMARY",
    });
  });
  test("no stored value is the defaults, and the result is a copy nobody can change the defaults through", () => {
    const resolved = resolvePortalAccess(undefined);
    expect(resolved).toEqual(DEFAULT_PORTAL_ACCESS);
    resolved.pupil.invoices = true;
    expect(DEFAULT_PORTAL_ACCESS.pupil.invoices).toBe(false);
    expect(resolvePortalAccess(null).pupil.invoices).toBe(false);
  });
});

test.describe("a stored value is read tolerantly", () => {
  test("what is stored wins, key by key; what is missing is the default for that key", () => {
    const resolved = resolvePortalAccess({ pupil: { invoices: true, practice: "NONE" }, guardian: { takeQuizzes: true } });
    expect(resolved.pupil).toEqual({ ...DEFAULT_PORTAL_ACCESS.pupil, invoices: true, practice: "NONE" });
    expect(resolved.guardian).toEqual({ ...DEFAULT_PORTAL_ACCESS.guardian, takeQuizzes: true });
  });
  test("a value of the wrong type, an unknown key or a damaged row is ignored and never throws", () => {
    for (const bad of [
      "x",
      7,
      true,
      [],
      [1, 2],
      { pupil: "yes", guardian: [] },
      { pupil: { invoices: "true", practice: "ALL", extra: 1 } },
      { __proto__: { invoices: true } },
    ]) {
      expect(() => resolvePortalAccess(bad)).not.toThrow();
      expect(resolvePortalAccess(bad)).toEqual(DEFAULT_PORTAL_ACCESS);
    }
  });
  test("accessFor picks the actor's own half", () => {
    const value = resolvePortalAccess({ pupil: { invoices: true } });
    expect(accessFor(value, "PUPIL").invoices).toBe(true);
    expect(accessFor(value, "GUARDIAN").invoices).toBe(true);
    expect(accessFor(value, "PUPIL")).toBe(value.pupil);
    expect(accessFor(value, "GUARDIAN")).toBe(value.guardian);
  });
});

test.describe("the tabs", () => {
  test("by default both actors open overview, results and coursework; only the guardian opens fees", () => {
    expect(allowedTabs(DEFAULT_PORTAL_ACCESS.pupil)).toEqual(["overview", "results", "lms"]);
    expect(allowedTabs(DEFAULT_PORTAL_ACCESS.guardian)).toEqual(["overview", "results", "finance", "lms"]);
  });
  test("the order is the portal's, and every tab names a capability that exists", () => {
    expect(PORTAL_TABS.map((entry) => entry.tab)).toEqual(["overview", "results", "finance", "lms"]);
    for (const entry of PORTAL_TABS) expect(CAPABILITIES).toContain(entry.capability);
  });
});

test.describe("what the settings screen may send", () => {
  test("the screen's plain check agrees with the server's schema on the two rules", () => {
    const nothing = clone(DEFAULT_PORTAL_ACCESS);
    Object.assign(nothing.guardian, { overview: false, results: false, invoices: false, materials: false, submitWork: false, takeQuizzes: false });
    expect(portalAccessProblems(nothing).map((p) => p.path)).toEqual([["guardian"]]);
    const work = clone(DEFAULT_PORTAL_ACCESS);
    Object.assign(work.pupil, { materials: false });
    expect(portalAccessProblems(work).map((p) => p.path)).toEqual([["pupil", "materials"]]);
    expect(portalAccessProblems(DEFAULT_PORTAL_ACCESS)).toEqual([]);
    expect(portalAccessInput.safeParse(nothing).success).toBe(false);
    expect(portalAccessInput.safeParse(work).success).toBe(false);
  });
  test("the defaults are valid", () => {
    expect(portalAccessInput.safeParse(clone(DEFAULT_PORTAL_ACCESS)).success).toBe(true);
  });
  test("a missing actor, a missing key, an unknown key and a wrong type are all refused", () => {
    const base = clone(DEFAULT_PORTAL_ACCESS);
    expect(portalAccessInput.safeParse({ pupil: base.pupil }).success).toBe(false);
    const missing = clone(base);
    delete (missing.pupil as Partial<typeof missing.pupil>).siblings;
    expect(portalAccessInput.safeParse(missing).success).toBe(false);
    expect(portalAccessInput.safeParse({ ...base, admin: base.pupil }).success).toBe(false);
    expect(portalAccessInput.safeParse({ ...base, pupil: { ...base.pupil, canPay: true } }).success).toBe(false);
    expect(portalAccessInput.safeParse({ ...base, pupil: { ...base.pupil, invoices: "yes" } }).success).toBe(false);
    expect(portalAccessInput.safeParse({ ...base, pupil: { ...base.pupil, practice: "ALL" } }).success).toBe(false);
  });
  test("an actor with every section off is refused: a sign-in that opens an empty portal is a dead end", () => {
    for (const actor of ["pupil", "guardian"] as const) {
      const value = clone(DEFAULT_PORTAL_ACCESS);
      value[actor] = {
        ...value[actor],
        overview: false,
        results: false,
        invoices: false,
        materials: false,
        submitWork: false,
        takeQuizzes: false,
      };
      const parsed = portalAccessInput.safeParse(value);
      expect(parsed.success, actor).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toContain("at least one section");
    }
  });
  test("one section is enough, whichever it is", () => {
    for (const only of ["overview", "results", "invoices", "materials"] as const) {
      const value = clone(DEFAULT_PORTAL_ACCESS);
      value.guardian = {
        ...value.guardian,
        overview: false,
        results: false,
        invoices: false,
        materials: false,
        submitWork: false,
        takeQuizzes: false,
        [only]: true,
      };
      expect(portalAccessInput.safeParse(value).success, only).toBe(true);
    }
  });
  test("submitting work or taking a quiz needs the coursework section they belong to", () => {
    for (const key of ["submitWork", "takeQuizzes"] as const) {
      const value = clone(DEFAULT_PORTAL_ACCESS);
      value.pupil = { ...value.pupil, materials: false, submitWork: false, takeQuizzes: false, [key]: true };
      expect(portalAccessInput.safeParse(value).success, key).toBe(false);
    }
  });
});

test.describe("a change that gives somebody more", () => {
  test("turning a capability on, or raising practice, widens; turning off, lowering or no change does not", () => {
    const base = clone(DEFAULT_PORTAL_ACCESS);
    expect(widens(base, base)).toBe(false);
    for (const actor of ACTORS) {
      const key = actor === "PUPIL" ? "pupil" : "guardian";
      for (const capability of CAPABILITIES) {
        const on = clone(base);
        on[key][capability] = true;
        const off = clone(base);
        off[key][capability] = false;
        expect(widens(base, on), `${key} ${capability} on`).toBe(!base[key][capability]);
        expect(widens(base, off), `${key} ${capability} off`).toBe(false);
      }
    }
    const higher = clone(base);
    higher.guardian.practice = "FULL";
    expect(widens(base, higher)).toBe(true);
    const lower = clone(base);
    lower.pupil.practice = "NONE";
    expect(widens(base, lower)).toBe(false);
  });
  test("one thing widened and another narrowed in the same change still counts as widening", () => {
    const base = clone(DEFAULT_PORTAL_ACCESS);
    const mixed = clone(base);
    mixed.pupil.invoices = true;
    mixed.guardian.siblings = false;
    expect(widens(base, mixed)).toBe(true);
  });
});

// The question bank's school-wide ceiling (bank.parents.view) holds a GUARDIAN's practice level; the lower of the branch's own level and the ceiling applies; the pupil is not
// touched; nothing else about the access changes.
test.describe("capGuardianPractice", () => {
  const levels = ["NONE", "SUMMARY", "FULL"] as const;

  test("lowerLevel is the lower of two, in either order", () => {
    for (const a of levels) {
      for (const b of levels) expect(lowerLevel(a, b), `${a} ${b}`).toBe(levels[Math.min(levels.indexOf(a), levels.indexOf(b))]);
    }
  });

  test("a guardian's level is the lower of the branch's level and the ceiling, for all nine pairs", () => {
    for (const own of levels) {
      for (const ceiling of levels) {
        const access = clone(DEFAULT_PORTAL_ACCESS);
        access.guardian.practice = own;
        expect(capGuardianPractice(access, ceiling).guardian.practice, `${own} under ${ceiling}`).toBe(
          levels[Math.min(levels.indexOf(own), levels.indexOf(ceiling))],
        );
      }
    }
  });

  test("the pupil's level and every capability are left alone, and the input is not changed", () => {
    const access = clone(DEFAULT_PORTAL_ACCESS);
    access.pupil.practice = "FULL";
    access.guardian.practice = "FULL";
    const before = JSON.stringify(access);
    const capped = capGuardianPractice(access, "NONE");
    expect(capped.pupil).toEqual(access.pupil);
    expect(capped.guardian).toEqual({ ...access.guardian, practice: "NONE" });
    expect(JSON.stringify(access)).toBe(before);
  });
});

