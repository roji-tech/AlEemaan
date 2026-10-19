// Student CSV for the Students screen's import (pure: no database, no browser). The first line names the columns, in any order and with
// friendly spellings ("First name", "first_name", "DOB"); a blank line is skipped; a quoted cell may hold commas, quotes ("") and line breaks.
// The server re-validates every row (`students/import`); this only turns text into rows and says, per line, what is wrong before anything is sent.

export type CsvStudentRow = {
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  admissionNo?: string;
  className?: string;
  arm?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
};
export type CsvProblem = { line: number; message: string };
export type ParsedStudents = { rows: CsvStudentRow[]; problems: CsvProblem[]; lineOf: number[] };

export const MAX_CSV_ROWS = 1000;
export const CSV_TEMPLATE =
  "firstName,middleName,lastName,gender,dateOfBirth,admissionNo,className,arm,guardianName,guardianPhone,guardianEmail\n" +
  "Amina,,Yusuf,FEMALE,2014-03-21,,JSS 1,A,Mr Yusuf,08030000000,yusuf@example.com\n";

const COLUMN_ALIASES: Record<string, keyof CsvStudentRow> = {
  firstname: "firstName",
  givenname: "firstName",
  middlename: "middleName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  gender: "gender",
  sex: "gender",
  dateofbirth: "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  admissionno: "admissionNo",
  admissionnumber: "admissionNo",
  class: "className",
  classname: "className",
  arm: "arm",
  guardianname: "guardianName",
  parentname: "guardianName",
  guardianphone: "guardianPhone",
  parentphone: "guardianPhone",
  guardianemail: "guardianEmail",
  parentemail: "guardianEmail",
};

/// Splits CSV text into rows of cells (RFC 4180 style). Exported for tests.
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function toGender(raw: string): "MALE" | "FEMALE" | null {
  const g = raw.trim().toLowerCase();
  if (g === "m" || g === "male" || g === "boy") return "MALE";
  if (g === "f" || g === "female" || g === "girl") return "FEMALE";
  return null;
}

/// 2014-03-21 or 21/03/2014 (day first, as written in Nigeria) → 2014-03-21; null when it is not a real calendar date.
function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseStudentCsv(text: string): ParsedStudents {
  const out: ParsedStudents = { rows: [], problems: [], lineOf: [] };
  // Line numbers count the file's own rows (blank ones included), so a message points at the line the person sees in their spreadsheet.
  const numbered = splitCsv(text)
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));
  const table = numbered.map((r) => r.cells);
  if (table.length === 0) {
    out.problems.push({ line: 1, message: "The file is empty." });
    return out;
  }
  const header = table[0].map((h) => COLUMN_ALIASES[normalise(h)] ?? null);
  for (const need of ["firstName", "lastName", "gender", "dateOfBirth"] as const) {
    if (!header.includes(need))
      out.problems.push({ line: numbered[0].line, message: `A "${need}" column is missing from the first line.` });
  }
  if (out.problems.length > 0) return out;
  if (table.length - 1 > MAX_CSV_ROWS) {
    out.problems.push({ line: 1, message: `Import at most ${MAX_CSV_ROWS} students at a time; this file has ${table.length - 1}.` });
    return out;
  }
  numbered.slice(1).forEach(({ cells, line }) => {
    const get = (key: keyof CsvStudentRow) => {
      const at = header.indexOf(key);
      return at === -1 ? "" : (cells[at] ?? "").trim();
    };
    const first = get("firstName");
    const last = get("lastName");
    const gender = toGender(get("gender"));
    const dob = toIsoDate(get("dateOfBirth"));
    const email = get("guardianEmail");
    const problems: string[] = [];
    if (first.length < 2) problems.push("first name needs at least 2 letters");
    if (last.length < 2) problems.push("last name needs at least 2 letters");
    if (!gender) problems.push("gender must be Male or Female");
    if (!dob) problems.push("date of birth must be a real date (2014-03-21 or 21/03/2014)");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("guardian email is not an email address");
    if (problems.length > 0) return void out.problems.push({ line, message: problems.join("; ") });
    const row: CsvStudentRow = { firstName: first, lastName: last, gender: gender!, dateOfBirth: dob! };
    for (const key of ["middleName", "admissionNo", "className", "arm", "guardianName", "guardianPhone", "guardianEmail"] as const) {
      const v = get(key);
      if (v) row[key] = v;
    }
    out.rows.push(row);
    out.lineOf.push(line);
  });
  return out;
}
