import { expect, test } from "@playwright/test";
import { Role } from "@prisma/client";
import { MAX_INVITATION_BRANCHES, ROLE_VALUES, invitationBody } from "@/lib/invitations/rules";

// The body of POST /api/v1/invitations (task 0092): one branch (the original contract) or a list of one to ten distinct branches, never both, never neither. Pure: no server, no database.

const base = { email: "Ada@School.test ", role: "PARENT" };
const parse = (extra: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  invitationBody.safeParse({ ...base, ...extra, ...over });
const issues = (extra: Record<string, unknown>, over: Record<string, unknown> = {}) => {
  const result = parse(extra, over);
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

test("the original contract is unchanged: one `branchId`, the address trimmed and lower-cased, no `branchIds` in the result", () => {
  const result = parse({ branchId: "b1" });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ email: "ada@school.test", role: "PARENT", branchId: "b1" });
});

test("a list of one to ten distinct branches is accepted, in the order given", () => {
  const ids = Array.from({ length: MAX_INVITATION_BRANCHES }, (_, i) => `branch-${i}`);
  for (const list of [["b1"], ["b2", "b1"], ids]) {
    const result = parse({ branchIds: list });
    expect(result.success, String(list.length)).toBe(true);
    expect(result.data?.branchIds).toEqual(list);
    expect(result.data?.branchId).toBeUndefined();
  }
  expect(MAX_INVITATION_BRANCHES).toBe(10);
});

test("exactly one of `branchId` and `branchIds`: both and neither are refused, each at the field it is about", () => {
  expect(issues({ branchId: "b1", branchIds: ["b2"] })).toEqual([
    { path: "branchIds", message: "Send one branch or a list of branches, not both." },
  ]);
  expect(issues({})).toEqual([{ path: "branchId", message: "Choose a branch." }]);
});

test("a list must have at least one branch, at most ten, each once, and only ids", () => {
  expect(issues({ branchIds: [] })).toEqual([{ path: "branchIds", message: "Choose at least one branch." }]);
  expect(issues({ branchIds: Array.from({ length: 11 }, (_, i) => `b${i}`) })).toEqual([
    { path: "branchIds", message: "Choose at most 10 branches at a time." },
  ]);
  expect(issues({ branchIds: ["b1", "b2", "b1"] })).toEqual([{ path: "branchIds", message: "Choose each branch once." }]);
  expect(issues({ branchIds: "b1" })).toEqual([{ path: "branchIds", message: "Choose the branches." }]);
  expect(issues({ branchIds: [5] }).map((i) => i.path)).toEqual(["branchIds.0"]);
  expect(issues({ branchIds: [""] }).map((i) => i.path)).toEqual(["branchIds.0"]);
  expect(issues({ branchIds: ["x".repeat(65)] }).map((i) => i.path)).toEqual(["branchIds.0"]);
  expect(issues({ branchId: "x".repeat(65) }).map((i) => i.path)).toEqual(["branchId"]);
  expect(issues({ branchId: 5 }).map((i) => i.path)).toEqual(["branchId"]);
});

test("a key the body does not name is refused (no mass assignment), and the address and role rules are the single invitation's", () => {
  expect(parse({ branchIds: ["b1"], tokenHash: "x" }).success).toBe(false);
  expect(parse({ branchId: "b1", invitedById: "x" }).success).toBe(false);
  expect(issues({ branchIds: ["b1"] }, { role: "OWNER" })).toEqual([{ path: "role", message: "Choose a role." }]);
  expect(issues({ branchIds: ["b1"] }, { email: "nope" }).map((i) => i.path)).toEqual(["email"]);
  expect(issues({ branchIds: ["b1"] }, { email: `${"x".repeat(250)}@x.test` }).map((i) => i.path)).toEqual(["email"]);
});

test("the role list is the database's, so every role can be named", () => {
  expect([...ROLE_VALUES].sort()).toEqual(Object.values(Role).sort());
  for (const role of ROLE_VALUES) expect(parse({ branchIds: ["b1"] }, { role }).success, role).toBe(true);
});
