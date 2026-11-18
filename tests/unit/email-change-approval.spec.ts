import "../support/env";
import { test, expect } from "@playwright/test";
import { effectiveLevel, mayApprove } from "@/lib/auth/email-change-approval";

// Who may decide an email-address change (task 0088). Pure rules: no server, no database.

const superAdmin = { userId: "sa", scope: { superAdmin: true, branchIds: [] as string[] } };
const adminOfA = { userId: "adm-a", scope: { superAdmin: false, branchIds: ["A"] } };
const member = (level: "ADMIN" | "SUPERADMIN", branchIds: string[], userId = "p1") => ({ userId, level, branchIds });

test.describe("mayApprove", () => {
  test("a superadmin decides anyone's, an administrator's included", () => {
    expect(mayApprove(superAdmin, member("ADMIN", ["A"]))).toBe(true);
    expect(mayApprove(superAdmin, member("SUPERADMIN", ["A"]))).toBe(true);
    expect(mayApprove(superAdmin, member("ADMIN", []))).toBe(true); // a person with no branch left
  });

  test("a branch administrator decides a member of THEIR branch, and nobody else", () => {
    expect(mayApprove(adminOfA, member("ADMIN", ["A"]))).toBe(true);
    expect(mayApprove(adminOfA, member("ADMIN", ["B"]))).toBe(false);
    expect(mayApprove(adminOfA, member("ADMIN", ["B", "A"]))).toBe(true); // one shared branch is enough
    expect(mayApprove(adminOfA, member("ADMIN", []))).toBe(false);
  });

  test("an administrator's own request needs a superadmin: a branch administrator is refused even for their own branch", () => {
    expect(mayApprove(adminOfA, member("SUPERADMIN", ["A"], "adm-b"))).toBe(false);
  });

  test("nobody decides their own request, a superadmin included", () => {
    expect(mayApprove(superAdmin, member("ADMIN", ["A"], "sa"))).toBe(false);
    expect(mayApprove(adminOfA, member("ADMIN", ["A"], "adm-a"))).toBe(false);
  });

  test("someone with no authority at all decides nothing", () => {
    const teacher = { userId: "t", scope: { superAdmin: false, branchIds: [] as string[] } };
    expect(mayApprove(teacher, member("ADMIN", ["A"]))).toBe(false);
  });
});

test.describe("effectiveLevel", () => {
  test("the level only goes up between asking and deciding", () => {
    expect(effectiveLevel("ADMIN", "ADMIN")).toBe("ADMIN");
    expect(effectiveLevel("ADMIN", "SUPERADMIN")).toBe("SUPERADMIN"); // promoted to administrator since
    expect(effectiveLevel("SUPERADMIN", "ADMIN")).toBe("SUPERADMIN"); // demoted since: still waits for a superadmin
    expect(effectiveLevel("SUPERADMIN", "NONE")).toBe("SUPERADMIN");
    expect(effectiveLevel("ADMIN", "NONE")).toBe("ADMIN"); // became a superadmin: the stored level stands
  });

  test("an unknown stored value is treated as the lower level, never as none", () => {
    expect(effectiveLevel("whatever", "ADMIN")).toBe("ADMIN");
  });
});
