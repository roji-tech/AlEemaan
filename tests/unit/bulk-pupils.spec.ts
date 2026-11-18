import { test, expect } from "@playwright/test";
import { validateRows } from "@/lib/bulk/validate";
import { mapTable } from "@/lib/bulk/table";
import { pupilEntity, pupilEntityFor, toIsoDate } from "@/lib/bulk/pupils";
import type { SourceRow } from "@/lib/bulk/types";

// The pupil kind of the bulk entry (task 0084): only first name, last name, gender and date of birth must be given; everything else may be left out.

const base = { firstName: "Amina", lastName: "Yusuf", gender: "Female", dateOfBirth: "2014-03-21" };
const row = (values: Record<string, string>, line = 2): SourceRow => ({ line, values: { ...base, ...values } });
const one = (values: Record<string, string>) => validateRows(pupilEntity, [row(values)]);

test("a row with only the three required columns (first name, last name, gender) is ready; the rest, the date of birth too, may be empty or missing", () => {
  const out = validateRows(pupilEntity, [
    { line: 2, values: base },
    row({ middleName: "", admissionNo: "", className: "", arm: "", guardianName: "", guardianPhone: "", guardianEmail: "" }),
  ]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "ready"]);
  expect(out.ok[0].row).toEqual({ firstName: "Amina", lastName: "Yusuf", gender: "FEMALE", dateOfBirth: "2014-03-21" });
});

test("the date of birth is not required: missing or blank is a ready row with no date, and a date that IS given must still be a real one", () => {
  const { dateOfBirth: _unused, ...noDob } = base;
  void _unused;
  const out = validateRows(pupilEntity, [
    { line: 2, values: noDob },
    { line: 3, values: { ...noDob, dateOfBirth: "" } },
    { line: 4, values: { ...noDob, dateOfBirth: "   " } },
  ]);
  expect(out.verdicts.map((v) => v.status)).toEqual(["ready", "ready", "ready"]);
  for (const ok of out.ok) expect(ok.row.dateOfBirth).toBeUndefined();
  expect(one({ dateOfBirth: "2014-02-31" }).verdicts[0].status).toBe("error");
  expect(one({ dateOfBirth: "2999-01-01" }).verdicts[0].status).toBe("error");
});

test("gender is still required, and so are both names", () => {
  expect(one({ gender: "" }).verdicts[0].status).toBe("error");
  expect(one({ firstName: "" }).verdicts[0].status).toBe("error");
  expect(one({ lastName: "" }).verdicts[0].status).toBe("error");
});

const SAMPLES: Record<string, { pass: string[]; fail: string[] }> = {
  firstName: { pass: ["Amina", "Al"], fail: ["", "A", "   ", "x".repeat(61)] },
  middleName: { pass: ["", "Bola"], fail: ["x".repeat(61)] },
  lastName: { pass: ["Yusuf", "Ng"], fail: ["", "Y", "x".repeat(61)] },
  gender: { pass: ["Male", "m", "BOY", "Female", "F", "girl", "MALE"], fail: ["", "x", "other"] },
  dateOfBirth: {
    pass: ["", "2014-03-21", "21/03/2014", "1/3/2014", "21-03-2014", "21.03.2014"],
    fail: ["2014-02-31", "31/02/2014", "21 March 2014", "1899-12-31", "2999-01-01", "03-21-2014"],
  },
  admissionNo: { pass: ["", "2026/0001", "AE-19.045", "A 1"], fail: ["/bad", "x".repeat(41), "<script>"] },
  className: { pass: ["", "JSS 1"], fail: ["x".repeat(51)] },
  arm: { pass: ["", "A"], fail: ["x".repeat(31)] },
  guardianName: { pass: ["", "Mr Yusuf"], fail: ["x".repeat(101)] },
  guardianPhone: { pass: ["", "08030000000", "8030000000", "+234 803 000 0000"], fail: ["123", "abc", "0".repeat(21)] },
  guardianEmail: { pass: ["", "a@x.com", "A.B@School.Org"], fail: ["nope", "a@b"] },
};
test("every column has samples; each passing value passes and each failing value is a problem on that column alone", () => {
  expect(Object.keys(SAMPLES).sort()).toEqual(pupilEntity.columns.map((c) => c.key).sort());
  for (const [column, { pass, fail }] of Object.entries(SAMPLES)) {
    for (const value of pass) expect(one({ [column]: value }).verdicts[0].status, `${column}=${JSON.stringify(value)}`).toBe("ready");
    for (const value of fail) {
      const v = one({ [column]: value }).verdicts[0];
      expect([v.status, v.problems.map((p) => p.column)], `${column}=${JSON.stringify(value)}`).toEqual(["error", [column]]);
    }
  }
});

test("a row comes out normalised: gender word mapped, a day-first date as ISO, a phone's leading zero restored, an email lower-cased", () => {
  const out = one({
    gender: "boy",
    dateOfBirth: "21/03/2014",
    guardianPhone: "8030000000",
    guardianEmail: "G@X.COM",
    middleName: " Bola ",
  });
  expect(out.ok[0].row).toMatchObject({
    gender: "MALE",
    dateOfBirth: "2014-03-21",
    guardianPhone: "08030000000",
    guardianEmail: "g@x.com",
    middleName: "Bola",
  });
});

test("toIsoDate reads year-first and day-first dates and refuses a date that is not on the calendar", () => {
  expect(["2014-3-5", "5/3/2014", "05.03.2014", "2014-02-29", "29/02/2016", "31/04/2014", "nope"].map(toIsoDate)).toEqual([
    "2014-03-05",
    "2014-03-05",
    "2014-03-05",
    null,
    "2016-02-29",
    null,
    null,
  ]);
});

test("an admission number repeated inside the file is a problem on the later row", () => {
  const out = validateRows(pupilEntity, [row({ admissionNo: "X/1" }), row({ firstName: "Bala", admissionNo: "x/1" }, 3)]);
  expect(out.verdicts[1].problems).toEqual([{ column: "admissionNo", message: "Repeats row 2." }]);
});

test("a file with its own spellings of the headers is mapped, and only the three required columns must be there", () => {
  const t = mapTable(
    [
      ["Surname", "Given name", "Sex", "DOB", "Parent phone", "Extra"],
      ["Yusuf", "Amina", "F", "21/03/2014", "08030000000", "x"],
    ],
    pupilEntity.columns,
  );
  expect(t.problems).toEqual([]);
  expect(t.warnings).toEqual([expect.stringContaining("Extra")]);
  expect(t.rows[0].values).toMatchObject({
    lastName: "Yusuf",
    firstName: "Amina",
    gender: "F",
    dateOfBirth: "21/03/2014",
    guardianPhone: "08030000000",
  });
  // The date of birth column may be missing altogether; a missing Gender column may not.
  expect(
    mapTable(
      [
        ["First name", "Last name", "Gender"],
        ["A", "B", "M"],
      ],
      pupilEntity.columns,
    ).problems,
  ).toEqual([]);
  expect(
    mapTable(
      [
        ["First name", "Last name", "Date of birth"],
        ["A", "B", "2014-03-21"],
      ],
      pupilEntity.columns,
    ).problems[0].message,
  ).toContain("Gender");
});

test("the branch's classes become the Class dropdown, and every dropdown label is accepted by the rules", () => {
  const entity = pupilEntityFor(["JSS 1", "Primary 3"]);
  expect(entity.columns.find((c) => c.key === "className")!.options!.map((o) => o.label)).toEqual(["JSS 1", "Primary 3"]);
  expect(pupilEntity.columns.find((c) => c.key === "className")!.options).toBeUndefined();
  for (const column of entity.columns.filter((c) => c.options))
    for (const o of column.options!)
      expect(validateRows(entity, [row({ [column.key]: o.label })]).verdicts[0].status, `${column.key}=${o.label}`).toBe("ready");
});
