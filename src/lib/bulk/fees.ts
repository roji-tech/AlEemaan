import "@/lib/zod-csp";
import { z } from "zod";
import { optionalText } from "./fields";
import { ADMISSION_WORDS, GENDER_WORDS, RESIDENCE_WORDS, parseAudienceCell, parseYesNo } from "@/lib/finance/fee-audience";
import type { BulkColumn, BulkEntity } from "./types";

// The fee kind of the bulk entry (task 0084), client-safe. One row is one fee line: a name and an amount for one period, for one class or for the whole branch. Money gets the
// strictest column rules: the amount is read from its text into whole kobo and written back as text, never through a floating point sum.

/// `admission`, `gender` and `residence` are who the line is charged to (task 0122; absent = everyone); `optional`, `trackHandover` and `scholarshipCovers` are its settings (a file that says nothing: not optional, not
/// handed over, a scholarship covers it).
export type FeeRow = {
  period: string;
  classGroup?: string;
  name: string;
  amount: string;
  admission?: "NEW" | "RETURNING";
  gender?: "MALE" | "FEMALE";
  residence?: "DAY" | "BOARDING";
  optional?: boolean;
  trackHandover?: boolean;
  scholarshipCovers?: boolean;
};

/// One line may not be more than this (a misplaced decimal point is the usual reason); the database could hold far more.
export const MAX_NAIRA = 100_000_000;

export type Amount = { ok: true; kobo: number; text: string } | { ok: false; message: string };
/// `150000`, `150,000`, `150000.50`, `₦1,500.5`, `NGN 1500`: digits with optional thousands commas, at most two decimals, above zero, at most MAX_NAIRA.
export function parseAmount(raw: string): Amount {
  const t = raw.trim().replace(/^(₦|ngn|n)\s*/i, "");
  if (t === "") return { ok: false, message: "Enter the amount." };
  const hit = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d*))?$/.exec(t);
  if (!hit) return { ok: false, message: "Use digits, like 150000, 150,000 or 150000.50." };
  const decimals = hit[2] ?? "";
  if (decimals.length > 2) return { ok: false, message: "Use at most two decimals." };
  const whole = Number(hit[1].replace(/,/g, ""));
  const kobo = whole * 100 + Number(decimals.padEnd(2, "0"));
  if (kobo <= 0) return { ok: false, message: "The amount must be above zero." };
  if (kobo > MAX_NAIRA * 100)
    return { ok: false, message: `That is more than ₦${MAX_NAIRA.toLocaleString("en")} for one line; check the decimal point.` };
  return { ok: true, kobo, text: `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, "0")}` };
}

const text = (message: string, max: number) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Use at most ${max} characters.`);

/// One audience cell: blank (or "all") is no condition; known words are read; anything else is a problem on the cell, never read as "everyone".
const audienceCell = <T extends string>(words: Record<string, T>, message: string) =>
  z
    .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
    .transform((v, ctx): T | undefined => {
      const parsed = parseAudienceCell(v, words);
      if (parsed === undefined) {
        ctx.addIssue({ code: "custom", message });
        return undefined;
      }
      return parsed ?? undefined;
    });
const yesNoCell = (fallback: boolean, message: string) =>
  z
    .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
    .transform((v, ctx): boolean => {
      if (v.trim() === "") return fallback;
      const parsed = parseYesNo(v);
      if (parsed === undefined) {
        ctx.addIssue({ code: "custom", message });
        return fallback;
      }
      return parsed;
    });

export const feeRowSchema: z.ZodType<FeeRow> = z.object({
  admission: audienceCell(ADMISSION_WORDS, "Use New or Returning, or leave it empty for every pupil."),
  gender: audienceCell(GENDER_WORDS, "Use Male or Female, or leave it empty for every pupil."),
  residence: audienceCell(RESIDENCE_WORDS, "Use Day or Boarding, or leave it empty for every pupil."),
  optional: yesNoCell(false, "Use Yes or No."),
  trackHandover: yesNoCell(false, "Use Yes or No."),
  scholarshipCovers: yesNoCell(true, "Use Yes or No."),
  period: text("Choose the period.", 100),
  classGroup: optionalText(100),
  name: z
    .string({ error: "Give the fee a name." })
    .trim()
    .min(1, "Give the fee a name.")
    .min(2, "Use at least 2 characters.")
    .max(100, "Use at most 100 characters."),
  amount: z
    .string({ error: "Enter the amount." })
    .superRefine((v, ctx) => {
      const r = parseAmount(v);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.message });
    })
    .transform((v) => {
      const r = parseAmount(v);
      return r.ok ? r.text : v;
    }),
});

/// `periods` and `classGroups` are the branch's own names, offered as dropdowns (an empty class means the whole branch).
export const feeEntityFor = (periods: readonly string[], classGroups: readonly string[]): BulkEntity<FeeRow> => {
  const columns: BulkColumn[] = [
    {
      key: "period",
      label: "Period",
      aliases: ["term", "periodname"],
      required: true,
      help: "As the Finance screen shows it, like 1st Term (2026/2027)",
      ...(periods.length > 0 ? { options: periods.map((p) => ({ value: p, label: p })) } : {}),
    },
    {
      key: "classGroup",
      label: "Class",
      aliases: ["classgroup", "classname", "level"],
      required: false,
      help: "A class of this branch; leave empty for every class",
      ...(classGroups.length > 0 ? { options: classGroups.map((c) => ({ value: c, label: c })) } : {}),
    },
    {
      key: "name",
      label: "Fee item",
      aliases: ["fee", "feename", "item", "description"],
      required: true,
      help: "2 to 100 characters, like Tuition",
    },
    {
      key: "amount",
      label: "Amount",
      aliases: ["amountngn", "price", "cost"],
      required: true,
      help: "In naira, like 150000 or 150,000.50; above zero",
    },
    {
      key: "admission",
      label: "New or returning",
      aliases: ["admission", "newreturning", "pupiltype", "intake"],
      required: false,
      help: "New or Returning; empty = every pupil",
      options: [
        { value: "New", label: "New" },
        { value: "Returning", label: "Returning" },
      ],
    },
    {
      key: "gender",
      label: "Gender",
      aliases: ["sex"],
      required: false,
      help: "Male or Female; empty = every pupil",
      options: [
        { value: "Male", label: "Male" },
        { value: "Female", label: "Female" },
      ],
    },
    {
      key: "residence",
      label: "Day or boarding",
      aliases: ["residence", "dayboarding", "boarding"],
      required: false,
      help: "Day or Boarding; empty = every pupil",
      options: [
        { value: "Day", label: "Day" },
        { value: "Boarding", label: "Boarding" },
      ],
    },
    {
      key: "optional",
      label: "Optional",
      aliases: [],
      required: false,
      help: "Yes if a pupil can opt out of it (like the uniform); empty = No",
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
    },
    {
      key: "trackHandover",
      label: "Handed over",
      aliases: ["trackhandover"],
      required: false,
      help: "Yes for an item that is given out (uniform, cardigan): its receipt is recorded; empty = No",
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
    },
    {
      key: "scholarshipCovers",
      label: "Scholarship share",
      aliases: ["scholarshipcovers", "scholarship"],
      required: false,
      help: "No if a scholarship's share is not taken of this line; empty = Yes",
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
    },
  ];
  return {
    id: "fees",
    label: "fees",
    columns,
    rowSchema: feeRowSchema,
    uniqueKeys: [],
    repeats: {
      column: "name",
      of: (r) =>
        `${r.period.trim()}|${(r.classGroup ?? "").trim()}|${r.name.trim()}|${r.admission ?? ""}|${r.gender ?? ""}|${r.residence ?? ""}`,
      message: (line) => `Same period, class, fee item and pupils as row ${line}.`,
    },
  };
};
export const feeEntity = feeEntityFor([], []);

/// `who` is present only when some line of the group is for particular pupils: it names the kind of pupil the total is the bill of ("New, Male").
export type FeeTotal = { period: string; classGroup: string; kobo: number; lines: number; who?: string };

type Cond = { admission: "NEW" | "RETURNING" | null; gender: "MALE" | "FEMALE" | null; residence: "DAY" | "BOARDING" | null };
const WORD = { NEW: "New", RETURNING: "Returning", MALE: "Male", FEMALE: "Female", DAY: "Day", BOARDING: "Boarding" } as const;

/// What a file adds up to, per period and class, for the review: the one number that shows a misplaced decimal point. Only the rows given (the ones that are ready) are counted.
/// When some lines are for particular pupils (task 0122) a class has several bills, so the total is given for each kind of pupil that a line tells apart (new or returning, male or female, day
/// or boarding), with the lines for everyone in each: the totals on the school's printed bills (128,000 for a new boy, 136,000 for a new girl, 47,000 for a returning pupil) are then the check.
export function feeTotals(rows: { values: Record<string, string> }[]): FeeTotal[] {
  type Line = { cond: Cond; kobo: number };
  const groups = new Map<string, { period: string; classGroup: string; lines: Line[] }>();
  for (const r of rows) {
    const amount = parseAmount(r.values.amount ?? "");
    if (!amount.ok) continue;
    const period = (r.values.period ?? "").trim();
    const classGroup = (r.values.classGroup ?? "").trim() || "Every class";
    const key = `${period}|${classGroup}`;
    const g = groups.get(key) ?? { period, classGroup, lines: [] };
    g.lines.push({
      cond: {
        admission: parseAudienceCell(r.values.admission, ADMISSION_WORDS) ?? null,
        gender: parseAudienceCell(r.values.gender, GENDER_WORDS) ?? null,
        residence: parseAudienceCell(r.values.residence, RESIDENCE_WORDS) ?? null,
      },
      kobo: amount.kobo,
    });
    groups.set(key, g);
  }
  const out: FeeTotal[] = [];
  for (const g of groups.values()) {
    const dims = (["admission", "gender", "residence"] as const).filter((d) => g.lines.some((l) => l.cond[d] !== null));
    if (dims.length === 0) {
      out.push({ period: g.period, classGroup: g.classGroup, kobo: g.lines.reduce((n, l) => n + l.kobo, 0), lines: g.lines.length });
      continue;
    }
    const values: Record<(typeof dims)[number], readonly string[]> = {
      admission: ["NEW", "RETURNING"],
      gender: ["MALE", "FEMALE"],
      residence: ["DAY", "BOARDING"],
    };
    let kinds: Partial<Cond>[] = [{}];
    for (const d of dims) kinds = kinds.flatMap((k) => values[d].map((v) => ({ ...k, [d]: v })));
    for (const kind of kinds) {
      const mine = g.lines.filter((l) => dims.every((d) => l.cond[d] === null || l.cond[d] === kind[d]));
      out.push({
        period: g.period,
        classGroup: g.classGroup,
        kobo: mine.reduce((n, l) => n + l.kobo, 0),
        lines: mine.length,
        who: dims.map((d) => WORD[kind[d] as keyof typeof WORD]).join(", "),
      });
    }
  }
  return out;
}
