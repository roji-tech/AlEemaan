import { z } from "zod";

// The pupil list's filters (task 0103 D1): class (or no class yet), arm, gender and age, read from the address by the list AND by its export, so "the pupils shown" can never differ from
// what the export writes. Pure: no database.

export const AGE_MAX = 40;
const id = z.string().trim().min(1).max(64);
const age = z.coerce.number().int().min(0).max(AGE_MAX);

export const pupilFilterSchema = z
  .object({
    classGroupId: id.optional(),
    classArmId: id.optional(),
    noClass: z.enum(["1"]).optional(),
    gender: z.enum(["MALE", "FEMALE"]).optional(),
    ageMin: age.optional(),
    ageMax: age.optional(),
    /// Task 0101 D1: only drafts ("YES") or no drafts ("NO"); absent shows everything, drafts included.
    draft: z.enum(["YES", "NO"]).optional(),
  })
  .refine((f) => !(f.noClass && (f.classGroupId || f.classArmId)), {
    message: "Choose a class or No class yet, not both.",
    path: ["noClass"],
  })
  .refine((f) => !(f.classArmId && !f.classGroupId), { message: "Choose the class before its arm.", path: ["classArmId"] })
  .refine((f) => f.ageMin === undefined || f.ageMax === undefined || f.ageMin <= f.ageMax, {
    message: "The lowest age must not be above the highest.",
    path: ["ageMin"],
  });
export type PupilFilters = z.infer<typeof pupilFilterSchema>;

/// The filters named in a query string; an empty value is no filter.
export function readPupilFilters(params: URLSearchParams): ReturnType<typeof pupilFilterSchema.safeParse> {
  const pick = (key: string) => {
    const value = params.get(key);
    return value === null || value.trim() === "" ? undefined : value;
  };
  return pupilFilterSchema.safeParse({
    classGroupId: pick("classGroupId"),
    classArmId: pick("classArmId"),
    noClass: pick("noClass"),
    gender: pick("gender"),
    ageMin: pick("ageMin"),
    ageMax: pick("ageMax"),
    draft: pick("draft"),
  });
}

/// The same filters as query-string pairs (the screen builds the list's and the export's addresses from this, so both say the same thing).
export function pupilFilterQuery(f: PupilFilters): string {
  const pairs = Object.entries(f).filter(([, v]) => v !== undefined && v !== "");
  return pairs.map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`).join("");
}

export const activePupilFilters = (f: PupilFilters): number =>
  (f.classGroupId || f.noClass ? 1 : 0) +
  (f.gender ? 1 : 0) +
  (f.ageMin !== undefined || f.ageMax !== undefined ? 1 : 0) +
  (f.draft ? 1 : 0);

/// The school's day today (YYYY-MM-DD) in the school's time zone.
export function schoolDay(now: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/// `day` (YYYY-MM-DD) moved back whole years; 29 February in a year without one becomes 28 February (so a child born on 29 February turns a year older on 1 March).
function yearsBefore(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const year = y - years;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/// Ages from `min` to `max` whole years ON `today` as a range of dates of birth, both ends included: born on or before `latest` (old enough) and on or after `earliest` (young enough).
/// Age N on `today` means the Nth birthday has come and the (N+1)th has not.
export function birthDateRange(min: number | undefined, max: number | undefined, today: string): { earliest?: string; latest?: string } {
  if (min !== undefined && max !== undefined && min > max) throw new RangeError("min above max");
  return {
    ...(min !== undefined ? { latest: yearsBefore(today, min) } : {}),
    ...(max !== undefined ? { earliest: nextDay(yearsBefore(today, max + 1)) } : {}),
  };
}
