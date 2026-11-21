import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { validateRows } from "@/lib/bulk/validate";
import { invitationEntity, invitationEntityFor } from "@/lib/bulk/invitations";
import { staffEntity } from "@/lib/bulk/staff";
import { ROLE_VALUES } from "@/lib/invitations/rules";
import type { BulkEntityShape, SourceRow } from "@/lib/bulk/types";

// The invitation kind of the bulk entry (task 0084): one address and one role per row, the branch chosen once for the whole file.

const row = (line: number, values: Record<string, string>): SourceRow => ({
  line,
  values: { email: "a@x.com", role: "Teaching staff", ...values },
});
const one = (values: Record<string, string>) => validateRows(invitationEntity, [row(2, values)]);

test("the role list is the database's role list, so a role added there cannot be missing here", () => {
  expect([...ROLE_VALUES].sort()).toEqual(Object.values(Role).sort());
});

const SAMPLES: Record<string, { pass: string[]; fail: string[] }> = {
  email: { pass: ["a@x.com", "A.B@School.Org"], fail: ["", "nope", "a@b", `${"x".repeat(250)}@x.com`] },
  role: {
    pass: [
      "Administrator",
      "admin",
      "Teaching staff",
      "teacher",
      "NON_TEACHING_STAFF",
      "Non-teaching staff",
      "support",
      "Student",
      "pupil",
      "Parent",
      "guardian",
    ],
    fail: ["", "Janitor", "x"],
  },
  // Task 0127: optional, free text matched to a department of the branch by the server.
  department: { pass: ["", "Sciences", " sciences "], fail: ["x".repeat(81)] },
};
test("every column has samples; each passing value passes and each failing value is a problem on that column", () => {
  expect(Object.keys(SAMPLES).sort()).toEqual(invitationEntity.columns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SAMPLES)) {
    for (const value of pass) expect(one({ [column]: value }).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe("ready");
    for (const value of fail) {
      const v = one({ [column]: value }).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("a row comes out normalised: the address lower-cased, the role as the database names it", () => {
  const out = validateRows(invitationEntity, [
    row(2, { email: " Bala@X.COM ", role: "support" }),
    row(3, { email: "c@x.com", role: "Pupil" }),
  ]);
  expect(out.ok.map((o) => o.row)).toEqual([
    { email: "bala@x.com", role: "NON_TEACHING_STAFF" },
    { email: "c@x.com", role: "STUDENT" },
  ]);
});

test("an address repeated inside the file is a problem on the later row", () => {
  const out = validateRows(invitationEntity, [row(2, { email: "a@x.com" }), row(3, { email: "A@X.com", role: "Parent" })]);
  expect(out.verdicts[1].problems).toEqual([{ column: "email", message: "Repeats row 2." }]);
});

test("a file holds at most 200 invitations, and the role dropdown offers only the roles the caller may give (the rules still know every role)", () => {
  expect(invitationEntity.maxRows).toBe(200);
  const branchAdmin = invitationEntityFor(["TEACHING_STAFF", "NON_TEACHING_STAFF", "STUDENT", "PARENT"]);
  expect(branchAdmin.columns.find((c) => c.key === "role")!.options!.map((o) => o.label)).toEqual([
    "Teaching staff",
    "Non-teaching staff",
    "Student",
    "Parent",
  ]);
  expect(validateRows(branchAdmin, [row(2, { role: "Administrator" })]).verdicts[0].status).toBe("ready");
});

test("every dropdown label of every kind is accepted by that kind's own rules, so a template filled from its dropdowns always reads", () => {
  for (const entity of [staffEntity, invitationEntity] as BulkEntityShape[]) {
    for (const column of entity.columns.filter((c) => c.options)) {
      for (const option of column.options!) {
        const values: Record<string, string> = Object.fromEntries(
          entity.columns.map((c) => [c.key, c.key === "email" ? "a@x.com" : c.key.includes("Name") ? "Ada" : ""]),
        );
        values.category = "Teaching staff";
        values.role = "Teaching staff";
        values[column.key] = option.label;
        const v = validateRows(entity, [{ line: 2, values }]).verdicts[0];
        expect(v.problems, `${entity.id}.${column.key}=${option.label}`).toEqual([]);
      }
    }
  }
});

test("the Department column is optional: a blank cell leaves no department on the row, a name is kept trimmed (task 0127)", () => {
  const out = validateRows(invitationEntity, [
    row(2, { email: "d1@x.com", department: "" }),
    row(3, { email: "d2@x.com", department: "  Sciences " }),
  ]);
  expect(out.ok.map((o) => o.row.department)).toEqual([undefined, "Sciences"]);
});
