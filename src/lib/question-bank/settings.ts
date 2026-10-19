// The question bank's switches (design note section 6), stored as SettingValue rows: scope GLOBAL (the school-wide value) and scope BRANCH (a branch's own). This file
// is the pure part: what a value may be, what a branch is allowed to change, and what the effective value is. It reads no database, so every rule is unit-tested.
//
// Rules:
//   - A branch may only NARROW. A school-wide "off" cannot be widened by a branch; a limit can only get stricter, and which way is "stricter" depends on the key (a
//     lower maximum set size is stricter, a higher minimum pool or a higher summary threshold is stricter). A branch's values that would widen are ignored.
//   - A stored value that is not valid (a hand-edited row, an old format) is ignored: the default, or the school's value, applies. Never trusted, never a crash.
//   - The effective numbers agree with each other: the default set size and every preset fit inside the maximum AND inside the daily cap.
//
// Defaults are the start values the maintainer gave in the design note. Four have none there and are placeholders to confirm (see the design note, section 16):
// bank.practice.dailyCap, bank.practice.minPoolSize, bank.print.nearExamDays and the lower bound of bank.smallSummary.min.

export const BANK_SETTING_KEYS = [
  "bank.access.pupils",
  "bank.access.staff",
  "bank.access.admins",
  "bank.practice.maxQuestions",
  "bank.practice.defaultQuestions",
  "bank.practice.presets",
  "bank.practice.dailyCap",
  "bank.practice.minPoolSize",
  "bank.reports.teachers",
  "bank.reports.pupils",
  "bank.images.max",
  "bank.images.maxBytes",
  "bank.images.maxLongSide",
  "bank.print.nearExamDays",
  "bank.smallSummary.min",
] as const;

export type BankSettingKey = (typeof BANK_SETTING_KEYS)[number];

export type BankSettingValues = {
  "bank.access.pupils": boolean;
  "bank.access.staff": boolean;
  "bank.access.admins": boolean;
  "bank.practice.maxQuestions": number;
  "bank.practice.defaultQuestions": number;
  "bank.practice.presets": number[];
  "bank.practice.dailyCap": number;
  "bank.practice.minPoolSize": number;
  "bank.reports.teachers": boolean;
  "bank.reports.pupils": boolean;
  "bank.images.max": number;
  "bank.images.maxBytes": number;
  "bank.images.maxLongSide": number;
  "bank.print.nearExamDays": number;
  "bank.smallSummary.min": number;
};

export const BANK_DEFAULTS: Readonly<BankSettingValues> = Object.freeze({
  "bank.access.pupils": true,
  "bank.access.staff": true,
  "bank.access.admins": true,
  "bank.practice.maxQuestions": 100,
  "bank.practice.defaultQuestions": 20,
  "bank.practice.presets": Object.freeze([10, 20, 30, 50, 100]) as unknown as number[],
  "bank.practice.dailyCap": 100, // placeholder: one full set a day
  "bank.practice.minPoolSize": 20, // placeholder: at least one default-sized set
  "bank.reports.teachers": true,
  "bank.reports.pupils": true,
  "bank.images.max": 3,
  "bank.images.maxBytes": 500 * 1024,
  "bank.images.maxLongSide": 1600,
  "bank.print.nearExamDays": 7, // placeholder
  "bank.smallSummary.min": 5,
});

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/// Which way "stricter" goes for a key. "and": off beats on. "lower": a smaller number is stricter. "higher": a larger number is stricter. "subset": fewer of the
/// school's choices.
type Narrow = "and" | "lower" | "higher" | "subset";

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message });

const flag =
  (label: string) =>
  (value: unknown): ParseResult<boolean> =>
    typeof value === "boolean" ? { ok: true, value } : failure(`${label} must be on or off.`);

const whole =
  (label: string, low: number, high: number) =>
  (value: unknown): ParseResult<number> =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high
      ? { ok: true, value }
      : failure(`${label} must be a whole number from ${low} to ${high}.`);

const PRESET_LIMIT = 500;
const parsePresets = (value: unknown): ParseResult<number[]> => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return failure("Presets must be a list of 1 to 10 set sizes.");
  for (let i = 0; i < value.length; i++) {
    const size: unknown = value[i];
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > PRESET_LIMIT)
      return failure(`Each preset must be a whole number from 1 to ${PRESET_LIMIT}.`);
    if (i > 0 && size <= (value[i - 1] as number)) return failure("Presets must be in ascending order with no repeats.");
  }
  return { ok: true, value: [...(value as number[])] };
};

const parseImagesMax = (value: unknown): ParseResult<number> =>
  value === 3 || value === 4 ? { ok: true, value } : failure("Images per question must be 3 or 4.");

const DEFINITIONS: Record<BankSettingKey, { narrow: Narrow; parse: (value: unknown) => ParseResult<unknown> }> = {
  "bank.access.pupils": { narrow: "and", parse: flag("Pupil access") },
  "bank.access.staff": { narrow: "and", parse: flag("Staff access") },
  "bank.access.admins": { narrow: "and", parse: flag("Administrator access") },
  "bank.practice.maxQuestions": { narrow: "lower", parse: whole("The maximum set size", 1, 500) },
  "bank.practice.defaultQuestions": { narrow: "lower", parse: whole("The default set size", 1, 500) },
  "bank.practice.presets": { narrow: "subset", parse: parsePresets },
  "bank.practice.dailyCap": { narrow: "lower", parse: whole("The daily cap", 1, 1000) },
  "bank.practice.minPoolSize": { narrow: "higher", parse: whole("The minimum pool size", 1, 1000) },
  "bank.reports.teachers": { narrow: "and", parse: flag("Teacher reports") },
  "bank.reports.pupils": { narrow: "and", parse: flag("Pupil reports") },
  "bank.images.max": { narrow: "lower", parse: parseImagesMax },
  "bank.images.maxBytes": { narrow: "lower", parse: whole("The largest image size in bytes", 50 * 1024, 2 * 1024 * 1024) },
  "bank.images.maxLongSide": { narrow: "lower", parse: whole("The longest image side in pixels", 400, 4000) },
  "bank.print.nearExamDays": { narrow: "higher", parse: whole("The near-exam days", 0, 60) },
  "bank.smallSummary.min": { narrow: "higher", parse: whole("The small-summary threshold", 3, 50) },
};

const isKey = (key: unknown): key is BankSettingKey => typeof key === "string" && Object.hasOwn(DEFINITIONS, key);

/// One stored or proposed value for one key. An unknown key (including a prototype name) is refused.
export function parseBankSetting<K extends BankSettingKey>(key: K, value: unknown): ParseResult<BankSettingValues[K]> {
  if (!isKey(key)) return failure("Unknown question bank setting.");
  return DEFINITIONS[key].parse(value) as ParseResult<BankSettingValues[K]>;
}

/// Whether `proposed` is at least as strict as `base` for this key (both already valid). This is what a branch may do; the API refuses anything else.
export function isNarrowing<K extends BankSettingKey>(key: K, base: BankSettingValues[K], proposed: BankSettingValues[K]): boolean {
  switch (DEFINITIONS[key].narrow) {
    case "and":
      return !(proposed === true && base === false);
    case "lower":
      return (proposed as number) <= (base as number);
    case "higher":
      return (proposed as number) >= (base as number);
    case "subset":
      return (proposed as number[]).every((size) => (base as number[]).includes(size));
  }
}

type Rows = Readonly<Record<string, unknown>>;
const own = (rows: Rows, key: string): unknown => (Object.hasOwn(rows, key) ? rows[key] : undefined);

/// The effective settings for a branch: defaults, then the school-wide rows, then the branch's rows where they narrow. `global` and `branch` map a key to the raw
/// stored value (a SettingValue's `value`); pass `{}` for no rows.
export function effectiveBankSettings(global: Rows, branch: Rows): BankSettingValues {
  const merged: Record<string, unknown> = {};
  for (const key of BANK_SETTING_KEYS) {
    const school = parseBankSetting(key, own(global, key));
    const base: unknown = school.ok ? school.value : BANK_DEFAULTS[key];
    const mine = parseBankSetting(key, own(branch, key));
    let value: unknown = base;
    if (mine.ok) {
      const narrow = DEFINITIONS[key].narrow;
      if (narrow === "and") value = (base as boolean) && (mine.value as boolean);
      else if (narrow === "subset") {
        const kept = (mine.value as number[]).filter((size) => (base as number[]).includes(size));
        value = kept.length > 0 ? kept : base;
      } else if (isNarrowing(key, base as never, mine.value as never)) value = mine.value;
    }
    merged[key] = Array.isArray(value) ? [...(value as number[])] : value;
  }

  // The numbers must agree with each other. A set can be no bigger than the maximum or the daily cap, whichever is smaller.
  const values = merged as BankSettingValues;
  const limit = Math.min(values["bank.practice.maxQuestions"], values["bank.practice.dailyCap"]);
  values["bank.practice.defaultQuestions"] = Math.min(values["bank.practice.defaultQuestions"], limit);
  const presets = values["bank.practice.presets"].filter((size) => size <= limit);
  values["bank.practice.presets"] = presets.length > 0 ? presets : [values["bank.practice.defaultQuestions"]];
  return values;
}

/// What is wrong with a complete set of school-wide values, in words an administrator can act on. Missing keys use the defaults. Used before a change is written.
export function settingProblems(values: Partial<BankSettingValues>): string[] {
  const problems: string[] = [];
  const full: Record<string, unknown> = { ...BANK_DEFAULTS };
  for (const key of BANK_SETTING_KEYS) {
    if (!Object.hasOwn(values, key)) continue;
    const parsed = parseBankSetting(key, values[key]);
    if (parsed.ok) full[key] = parsed.value;
    else problems.push(parsed.message);
  }
  if (problems.length > 0) return problems;
  const v = full as BankSettingValues;
  const max = v["bank.practice.maxQuestions"];
  if (v["bank.practice.defaultQuestions"] > max)
    problems.push(`The default number of questions (${v["bank.practice.defaultQuestions"]}) cannot be above the maximum (${max}).`);
  const largest = Math.max(...v["bank.practice.presets"]);
  if (largest > max) problems.push(`Every preset must be within the maximum (${max}); the largest is ${largest}.`);
  if (v["bank.practice.dailyCap"] < max)
    problems.push(`The daily cap (${v["bank.practice.dailyCap"]}) cannot be below the maximum set size (${max}).`);
  return problems;
}
