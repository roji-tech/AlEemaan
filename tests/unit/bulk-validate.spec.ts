import { test, expect } from "@playwright/test";
import { validateRows } from "@/lib/bulk/validate";
import { staffEntity, staffColumns } from "@/lib/bulk/staff";
import type { SourceRow } from "@/lib/bulk/types";

// The shared row rules, run on the staff kind (task 0084). The same schema runs on the server, so what passes here passes there.

const row = (line: number, values: Record<string, string>, extra: Partial<SourceRow> = {}): SourceRow => ({
  line,
  values: { category: "Teaching", firstName: "Amina", lastName: "Yusuf", phone: "", email: "", ...values },
  ...extra,
});

test("a good row is ready and comes out normalised: the category word mapped, the email lower-cased, empty optional cells absent", () => {
  const out = validateRows(staffEntity, [row(2, { category: " non-teaching ", email: "A@X.com" }), row(3, { category: "T" })]);
  expect(out.verdicts.map((v) => [v.line, v.status])).toEqual([[2, "ready"], [3, "ready"]]);
  expect(out.ok[0].row).toEqual({ category: "NON_TEACHING", firstName: "Amina", lastName: "Yusuf", email: "a@x.com" });
  expect(out.ok[1].row).toEqual({ category: "TEACHING", firstName: "Amina", lastName: "Yusuf" });
});

// Every column has a value that passes and one that fails, so no column can be added without its rule being exercised.
const SAMPLES: Record<string, { pass: string[]; fail: string[] }> = {
  category: { pass: ["Teaching", "teacher", "NT", "Non teaching", "NON_TEACHING"], fail: ["", "Principal", "x"] },
  firstName: { pass: ["Amina", "A"], fail: ["", "   ", "x".repeat(81)] },
  lastName: { pass: ["Yusuf"], fail: ["", "x".repeat(81)] },
  phone: { pass: ["", "08031234567", "+234 803 123 4567", "(0803) 123-4567"], fail: ["123", "abcdefghij", "0".repeat(21)] },
  email: { pass: ["", "a@x.com", "A.B@School.Org"], fail: ["nope", "a@b", "a b@x.com", `${"x".repeat(250)}@x.com`] },
};
test("every column has samples, and each passing value passes while each failing value is a problem on that column", () => {
  expect(Object.keys(SAMPLES).sort()).toEqual(staffColumns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SAMPLES)) {
    for (const value of pass) expect(validateRows(staffEntity, [row(2, { [column]: value })]).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe("ready");
    for (const value of fail) {
      const v = validateRows(staffEntity, [row(2, { [column]: value })]).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("a ten-digit phone with no leading zero (Excel dropped it) gets its zero back", () => {
  expect(validateRows(staffEntity, [row(2, { phone: "8031234567" })]).ok[0].row.phone).toBe("08031234567");
});

test("one row can have several problems, each on its own column", () => {
  const v = validateRows(staffEntity, [row(2, { firstName: "", email: "nope" })]).verdicts[0];
  expect(v.problems.map((p) => p.column).sort()).toEqual(["email", "firstName"]);
});

test("an email repeated inside the file is a problem on the later row only, naming the earlier row; case does not hide it", () => {
  const out = validateRows(staffEntity, [row(2, { email: "a@x.com" }), row(3, { firstName: "B", email: "A@X.com" }), row(4, { firstName: "C", email: "" }), row(5, { firstName: "D", email: "" })]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "error", "ready", "ready"]);
  expect(out.verdicts[1].problems).toEqual([{ column: "email", message: "Repeats row 2." }]);
  expect(out.ok.map((o) => o.line)).toEqual([2, 4, 5]);
});

test("a row with cells beyond the header is a problem even if its own fields pass", () => {
  const v = validateRows(staffEntity, [row(2, {}, { overflow: true })]).verdicts[0];
  expect(v.status).toBe("error");
  expect(v.problems[0].message).toContain("more cells");
});

test("a cell longer than any legitimate value is refused before the rules see it", () => {
  const v = validateRows(staffEntity, [row(2, { firstName: "x".repeat(501) })]).verdicts[0];
  expect(v.problems).toEqual([{ column: "firstName", message: "This cell is too long." }]);
});
