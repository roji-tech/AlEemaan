import "../support/env";
import { test, expect } from "@playwright/test";
import {
  BANK_DEFAULTS,
  BANK_SETTING_KEYS,
  effectiveBankSettings,
  isNarrowing,
  parseBankSetting,
  settingProblems,
  type BankSettingKey,
} from "@/lib/question-bank/settings";

// The question bank's switches (design note section 6) are stored as SettingValue rows (GLOBAL, and BRANCH to narrow). One pure resolver decides the effective value.
// Rules under test:
//   R1  a branch may only NARROW: a school-wide "off" cannot be widened by a branch, a limit can only get stricter (which way is "stricter" depends on the key);
//   R2  a stored value that is not valid (hand-edited row, an old format) is ignored, never trusted and never a crash;
//   R3  the effective numbers always agree with each other: the default set size and every preset fit inside the maximum and inside the daily cap;
//   R4  a change is validated before it is written: bounds, the cross-field rules, and for a branch that it narrows.

const key = (name: string) => `bank.${name}` as BankSettingKey;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe("the defaults (the start values the maintainer gave in the design note)", () => {
  test("nothing stored means the documented start values", () => {
    const s = effectiveBankSettings({}, {});
    expect(s["bank.access.pupils"]).toBe(true);
    expect(s["bank.access.staff"]).toBe(true);
    expect(s["bank.access.admins"]).toBe(true);
    expect(s["bank.practice.maxQuestions"]).toBe(100);
    expect(s["bank.practice.defaultQuestions"]).toBe(20);
    expect(s["bank.practice.presets"]).toEqual([10, 20, 30, 50, 100]);
    expect(s["bank.reports.teachers"]).toBe(true);
    expect(s["bank.reports.pupils"]).toBe(true);
    expect(s["bank.images.max"]).toBe(3);
    expect(s["bank.images.maxBytes"]).toBe(500 * 1024);
    expect(s["bank.images.maxLongSide"]).toBe(1600);
    expect(s["bank.smallSummary.min"]).toBe(5);
  });

  test("the key list and the defaults agree, and every default is itself valid", () => {
    expect(Object.keys(BANK_DEFAULTS).sort()).toEqual([...BANK_SETTING_KEYS].sort());
    for (const k of BANK_SETTING_KEYS) {
      const result = parseBankSetting(k, BANK_DEFAULTS[k]);
      expect(result.ok, k).toBe(true);
    }
    expect(settingProblems({ ...BANK_DEFAULTS })).toEqual([]);
  });
});

test.describe("one value at a time: bounds and types", () => {
  const bad = [
    undefined,
    null,
    "",
    "5",
    "true",
    NaN,
    Infinity,
    -Infinity,
    -1,
    0.5,
    1.5,
    {},
    [],
    [1],
    () => 1,
    Symbol("x"),
    BigInt(10),
    "\u0000",
  ];

  test("booleans accept only true and false", () => {
    for (const name of ["access.pupils", "access.staff", "access.admins", "reports.teachers", "reports.pupils"]) {
      expect(parseBankSetting(key(name), true)).toEqual({ ok: true, value: true });
      expect(parseBankSetting(key(name), false)).toEqual({ ok: true, value: false });
      for (const value of [...bad, 0, 1, "yes", "false"])
        expect(parseBankSetting(key(name), value).ok, `${name} ${String(value)}`).toBe(false);
    }
  });

  test("whole numbers within their bounds, nothing else", () => {
    const bounds: Record<string, [number, number]> = {
      "practice.maxQuestions": [1, 500],
      "practice.defaultQuestions": [1, 500],
      "practice.dailyCap": [1, 1000],
      "practice.minPoolSize": [1, 1000],
      "images.maxBytes": [50 * 1024, 2 * 1024 * 1024],
      "images.maxLongSide": [400, 4000],
      "print.nearExamDays": [0, 60],
      "smallSummary.min": [3, 50],
    };
    for (const [name, [low, high]] of Object.entries(bounds)) {
      expect(parseBankSetting(key(name), low).ok, `${name} at ${low}`).toBe(true);
      expect(parseBankSetting(key(name), high).ok, `${name} at ${high}`).toBe(true);
      expect(parseBankSetting(key(name), low - 1).ok, `${name} below ${low}`).toBe(false);
      expect(parseBankSetting(key(name), high + 1).ok, `${name} above ${high}`).toBe(false);
      expect(parseBankSetting(key(name), Number.MAX_SAFE_INTEGER).ok, name).toBe(false);
      for (const value of bad) expect(parseBankSetting(key(name), value).ok, `${name} ${String(value)}`).toBe(false);
    }
  });

  test("images.max is 3 or 4, as a number", () => {
    for (const ok of [3, 4]) expect(parseBankSetting(key("images.max"), ok)).toEqual({ ok: true, value: ok });
    for (const no of [0, 1, 2, 5, 3.5, "3", "4", NaN, null, undefined, [3], true])
      expect(parseBankSetting(key("images.max"), no).ok, String(no)).toBe(false);
  });

  test("presets: 1 to 10 whole numbers, each 1 to 500, strictly ascending (sorted, no duplicates)", () => {
    expect(parseBankSetting(key("practice.presets"), [10, 20, 30, 50, 100])).toEqual({ ok: true, value: [10, 20, 30, 50, 100] });
    expect(parseBankSetting(key("practice.presets"), [5])).toEqual({ ok: true, value: [5] });
    for (const no of [
      [],
      [20, 10],
      [10, 10],
      [0, 5],
      [1.5],
      [501],
      ["10"],
      [null],
      "10,20",
      {},
      null,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ]) {
      expect(parseBankSetting(key("practice.presets"), no).ok, JSON.stringify(no)).toBe(false);
    }
  });

  test("an unknown key is refused, including prototype names", () => {
    for (const unknown of ["bank.nope", "bank.", "", "bank.__proto__", "bank.constructor", "practice.maxQuestions", "BANK.access.pupils"]) {
      expect(parseBankSetting(unknown as never, true).ok, unknown).toBe(false);
    }
  });
});

test.describe("R1: a branch may only narrow", () => {
  test("a school-wide off cannot be widened by a branch; a branch can switch a group off by itself", () => {
    for (const name of ["access.pupils", "access.staff", "access.admins", "reports.teachers", "reports.pupils"]) {
      const k = key(name);
      expect(effectiveBankSettings({ [k]: false }, { [k]: true })[k], `${name}: global off, branch on`).toBe(false);
      expect(effectiveBankSettings({ [k]: true }, { [k]: false })[k], `${name}: global on, branch off`).toBe(false);
      expect(effectiveBankSettings({ [k]: false }, { [k]: false })[k]).toBe(false);
      expect(effectiveBankSettings({ [k]: true }, { [k]: true })[k]).toBe(true);
    }
  });

  test("limits that must go DOWN to narrow: a branch cannot raise them, can lower them", () => {
    for (const [name, global, up, down] of [
      ["practice.maxQuestions", 100, 150, 50],
      ["practice.dailyCap", 100, 200, 40],
      ["images.max", 4, 4, 3],
      ["images.maxBytes", 500 * 1024, 900 * 1024, 200 * 1024],
      ["images.maxLongSide", 1600, 2400, 1000],
    ] as const) {
      const k = key(name);
      expect(effectiveBankSettings({ [k]: global }, { [k]: up })[k], `${name} raised`).toBe(global);
      expect(effectiveBankSettings({ [k]: global }, { [k]: down })[k], `${name} lowered`).toBe(down);
    }
  });

  test("limits that must go UP to narrow: a branch cannot lower them, can raise them", () => {
    for (const [name, global, up, down] of [
      ["practice.minPoolSize", 20, 40, 10],
      ["print.nearExamDays", 7, 14, 3],
      ["smallSummary.min", 5, 8, 3],
    ] as const) {
      const k = key(name);
      expect(effectiveBankSettings({ [k]: global }, { [k]: up })[k], `${name} raised`).toBe(up);
      expect(effectiveBankSettings({ [k]: global }, { [k]: down })[k], `${name} lowered`).toBe(global);
    }
  });

  test("presets: a branch may keep fewer of the school's presets, never add one the school does not offer", () => {
    const k = key("practice.presets");
    expect(effectiveBankSettings({ [k]: [10, 20, 50] }, { [k]: [20, 50] })[k]).toEqual([20, 50]);
    expect(effectiveBankSettings({ [k]: [10, 20, 50] }, { [k]: [10, 20, 50, 100] })[k]).toEqual([10, 20, 50]);
    expect(effectiveBankSettings({ [k]: [10, 20, 50] }, { [k]: [15, 20] })[k]).toEqual([20]);
    // nothing left in common: the school's own list stands (a branch cannot switch practice off through the presets)
    expect(effectiveBankSettings({ [k]: [10, 20, 50] }, { [k]: [15, 25] })[k]).toEqual([10, 20, 50]);
  });

  test("isNarrowing says the same thing the resolver does", () => {
    expect(isNarrowing(key("access.pupils"), true, false)).toBe(true);
    expect(isNarrowing(key("access.pupils"), false, true)).toBe(false);
    expect(isNarrowing(key("access.pupils"), false, false)).toBe(true);
    expect(isNarrowing(key("practice.maxQuestions"), 100, 100)).toBe(true);
    expect(isNarrowing(key("practice.maxQuestions"), 100, 101)).toBe(false);
    expect(isNarrowing(key("practice.maxQuestions"), 100, 99)).toBe(true);
    expect(isNarrowing(key("smallSummary.min"), 5, 4)).toBe(false);
    expect(isNarrowing(key("smallSummary.min"), 5, 6)).toBe(true);
    expect(isNarrowing(key("practice.presets"), [10, 20], [20])).toBe(true);
    expect(isNarrowing(key("practice.presets"), [10, 20], [20, 30])).toBe(false);
    expect(isNarrowing(key("practice.presets"), [10, 20], [10, 20])).toBe(true);
  });
});

test.describe("R2: stored garbage is ignored, never trusted", () => {
  test("an invalid school-wide or branch value falls back to the default (or the school value)", () => {
    const max = key("practice.maxQuestions");
    expect(effectiveBankSettings({ [max]: "lots" }, {})[max]).toBe(100);
    expect(effectiveBankSettings({ [max]: -5 }, {})[max]).toBe(100);
    expect(effectiveBankSettings({ [max]: 60 }, { [max]: "lots" })[max]).toBe(60);
    expect(effectiveBankSettings({ [max]: 60 }, { [max]: 1e9 })[max]).toBe(60);
    const access = key("access.pupils");
    expect(effectiveBankSettings({ [access]: "no" }, {})[access]).toBe(true);
  });

  test("unknown keys in the stored rows are ignored", () => {
    const s = effectiveBankSettings({ "bank.nope": 5, __proto__: { x: 1 } } as never, { "bank.also": 1, constructor: 1 } as never);
    expect(Object.keys(s).sort()).toEqual([...BANK_SETTING_KEYS].sort());
  });
});

test.describe("R3: the effective numbers agree with each other", () => {
  test("the default set size and every preset fit inside the maximum", () => {
    const s = effectiveBankSettings(
      { [key("practice.maxQuestions")]: 30, [key("practice.defaultQuestions")]: 20 },
      { [key("practice.maxQuestions")]: 15 },
    );
    expect(s["bank.practice.maxQuestions"]).toBe(15);
    expect(s["bank.practice.defaultQuestions"]).toBe(15);
    expect(s["bank.practice.presets"]).toEqual([10]);
  });

  test("a daily cap below the maximum limits the sizes too", () => {
    const s = effectiveBankSettings({ [key("practice.dailyCap")]: 25 }, {});
    expect(Math.max(...s["bank.practice.presets"])).toBeLessThanOrEqual(25);
    expect(s["bank.practice.defaultQuestions"]).toBeLessThanOrEqual(25);
  });

  test("when nothing fits, the default size is the one preset (practice is never left without a size)", () => {
    const s = effectiveBankSettings({ [key("practice.presets")]: [50, 100] }, { [key("practice.maxQuestions")]: 20 });
    expect(s["bank.practice.presets"]).toEqual([20]);
    expect(s["bank.practice.defaultQuestions"]).toBe(20);
  });
});

test.describe("R4: a change is validated before it is written", () => {
  test("the cross-field rules on a school-wide set of values", () => {
    expect(settingProblems({ ...BANK_DEFAULTS })).toEqual([]);
    expect(settingProblems({ ...BANK_DEFAULTS, "bank.practice.defaultQuestions": 150 }).join(" ")).toMatch(/default.*maximum/i);
    expect(settingProblems({ ...BANK_DEFAULTS, "bank.practice.presets": [10, 200] }).join(" ")).toMatch(/preset.*maximum/i);
    expect(settingProblems({ ...BANK_DEFAULTS, "bank.practice.dailyCap": 50 }).join(" ")).toMatch(/daily.*maximum/i);
    expect(
      settingProblems({
        ...BANK_DEFAULTS,
        "bank.practice.maxQuestions": 20,
        "bank.practice.defaultQuestions": 20,
        "bank.practice.presets": [10, 20],
      }),
    ).toEqual([]);
  });
});

test.describe("fuzz: whatever is stored, the resolver never throws and always returns a consistent answer", () => {
  test("seeded random rows, 4 000 rounds", () => {
    const next = mulberry32(2026);
    const junk: unknown[] = [
      true,
      false,
      0,
      1,
      3,
      4,
      5,
      10,
      20,
      100,
      500,
      1e9,
      -1,
      0.5,
      NaN,
      Infinity,
      "x",
      "",
      "5",
      null,
      undefined,
      [],
      [10],
      [10, 20],
      [20, 10],
      [0],
      {},
      { a: 1 },
      BigInt(10),
    ];
    const pick = () => junk[Math.floor(next() * junk.length)];
    const problems: string[] = [];
    for (let round = 0; round < 4000; round++) {
      const global: Record<string, unknown> = {};
      const branch: Record<string, unknown> = {};
      for (const k of BANK_SETTING_KEYS) {
        if (next() < 0.5) global[k] = pick();
        if (next() < 0.5) branch[k] = pick();
      }
      let s;
      try {
        s = effectiveBankSettings(global, branch);
      } catch (error) {
        problems.push(
          `threw ${String(error)} for ${JSON.stringify({ global, branch }, (_, v) => (typeof v === "bigint" ? String(v) : v))}`,
        );
        continue;
      }
      const base = effectiveBankSettings(global, {});
      const max = s["bank.practice.maxQuestions"];
      const limit = Math.min(max, s["bank.practice.dailyCap"]);
      const presets = s["bank.practice.presets"];
      if (s["bank.practice.defaultQuestions"] > limit) problems.push(`default above limit ${round}`);
      if (presets.length === 0 || presets.some((p, i) => !Number.isInteger(p) || p < 1 || p > limit || (i > 0 && p <= presets[i - 1])))
        problems.push(`presets ${JSON.stringify(presets)} ${round}`);
      for (const k of [
        "bank.access.pupils",
        "bank.access.staff",
        "bank.access.admins",
        "bank.reports.teachers",
        "bank.reports.pupils",
      ] as const) {
        if (s[k] && !base[k]) problems.push(`${k} widened ${round}`);
      }
      for (const k of [
        "bank.practice.maxQuestions",
        "bank.practice.dailyCap",
        "bank.images.max",
        "bank.images.maxBytes",
        "bank.images.maxLongSide",
      ] as const) {
        if (s[k] > base[k]) problems.push(`${k} raised ${round}`);
      }
      for (const k of ["bank.practice.minPoolSize", "bank.print.nearExamDays", "bank.smallSummary.min"] as const) {
        if (s[k] < base[k]) problems.push(`${k} lowered ${round}`);
      }
      if (![3, 4].includes(s["bank.images.max"])) problems.push(`images.max ${s["bank.images.max"]} ${round}`);
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});

// bank.parents.view: the most a guardian may see of a child's practice anywhere in the school (NONE < SUMMARY < FULL). A ceiling the branch can only lower; the branch's own
// portal access level and this one are combined by taking the lower (lib/portal/access.ts, capGuardianPractice).
test.describe("bank.parents.view: a ceiling on what a guardian sees of a child's practice", () => {
  const view = "bank.parents.view" as const;

  test("it is one of the bank's switches, valid only as none, a summary or everything, and starts at a summary", () => {
    expect(BANK_SETTING_KEYS).toContain(view);
    expect(BANK_DEFAULTS[view]).toBe("SUMMARY");
    for (const ok of ["NONE", "SUMMARY", "FULL"]) expect(parseBankSetting(view, ok).ok, ok).toBe(true);
    for (const bad of ["none", "Full", "ALL", "", " SUMMARY", null, undefined, 1, true, ["FULL"], { level: "FULL" }]) {
      expect(parseBankSetting(view, bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  test("a branch can choose less than the school, the same, never more", () => {
    const rank = ["NONE", "SUMMARY", "FULL"] as const;
    for (const base of rank) {
      for (const proposed of rank) {
        expect(isNarrowing(view, base, proposed), `${base} -> ${proposed}`).toBe(rank.indexOf(proposed) <= rank.indexOf(base));
      }
    }
  });

  test("the effective value: the default, the school's, then the branch's where it is lower", () => {
    expect(effectiveBankSettings({}, {})[view]).toBe("SUMMARY");
    expect(effectiveBankSettings({ [view]: "FULL" }, {})[view]).toBe("FULL");
    expect(effectiveBankSettings({ [view]: "NONE" }, {})[view]).toBe("NONE");
    expect(effectiveBankSettings({ [view]: "FULL" }, { [view]: "SUMMARY" })[view]).toBe("SUMMARY");
    expect(effectiveBankSettings({ [view]: "SUMMARY" }, { [view]: "FULL" })[view]).toBe("SUMMARY"); // a branch cannot raise it
    expect(effectiveBankSettings({ [view]: "NONE" }, { [view]: "FULL" })[view]).toBe("NONE");
  });

  test("a stored value that is not valid is ignored: the default (or the school's value) applies", () => {
    expect(effectiveBankSettings({ [view]: "everything" }, {})[view]).toBe("SUMMARY");
    expect(effectiveBankSettings({ [view]: "NONE" }, { [view]: "everything" })[view]).toBe("NONE");
    expect(effectiveBankSettings({ [view]: 3 }, { [view]: ["FULL"] })[view]).toBe("SUMMARY");
  });

  test("a change is checked before it is written: a wrong value is a sentence an administrator can act on", () => {
    expect(settingProblems({ [view]: "NONE" })).toEqual([]);
    const problems = settingProblems({ [view]: "lots" as never });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/guardian/i);
  });
});
