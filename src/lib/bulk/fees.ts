import "@/lib/zod-csp";
import { z } from "zod";
import { optionalText } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The fee kind of the bulk entry (task 0084), client-safe. One row is one fee line: a name and an amount for one period, for one class or for the whole branch. Money gets the
// strictest column rules: the amount is read from its text into whole kobo and written back as text, never through a floating point sum.

export type FeeRow = { period: string; classGroup?: string; name: string; amount: string };

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

export const feeRowSchema: z.ZodType<FeeRow> = z.object({
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
  ];
  return {
    id: "fees",
    label: "fees",
    columns,
    rowSchema: feeRowSchema,
    uniqueKeys: [],
    repeats: {
      column: "name",
      of: (r) => `${r.period.trim()}|${(r.classGroup ?? "").trim()}|${r.name.trim()}`,
      message: (line) => `Same period, class and fee item as row ${line}.`,
    },
  };
};
export const feeEntity = feeEntityFor([], []);

export type FeeTotal = { period: string; classGroup: string; kobo: number; lines: number };
/// What a file adds up to, per period and class, for the review: the one number that shows a misplaced decimal point. Only the rows given (the ones that are ready) are counted.
export function feeTotals(rows: { values: Record<string, string> }[]): FeeTotal[] {
  const out = new Map<string, FeeTotal>();
  for (const r of rows) {
    const amount = parseAmount(r.values.amount ?? "");
    if (!amount.ok) continue;
    const period = (r.values.period ?? "").trim();
    const classGroup = (r.values.classGroup ?? "").trim() || "Every class";
    const key = `${period}|${classGroup}`;
    const t = out.get(key) ?? { period, classGroup, kobo: 0, lines: 0 };
    t.kobo += amount.kobo;
    t.lines++;
    out.set(key, t);
  }
  return [...out.values()];
}
