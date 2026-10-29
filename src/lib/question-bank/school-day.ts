// What "today" means for the limits that count in days: the practice cap (questions a pupil may take in a day) and the reports one person may make in a day.
//
// It is the school's day, not the server's. The school is in one place, named by SCHOOL_TIME_ZONE (an IANA name such as "Africa/Lagos"); the day starts at midnight
// there. With no value, or one that is not a time zone, the day is the UTC day, which is what these limits used before the setting existed, so nothing moves until
// someone sets it. A wrong value is never trusted and never a crash: it warns once and the UTC day applies.
//
// Pure apart from reading the environment for the default, so every rule is unit-tested with a fixed clock. Daylight saving is handled (the day that gains or loses an
// hour starts at the right instant); a zone whose midnight does not exist on a changeover day starts that day at the first instant after the gap.

const FALLBACK = "UTC";
const MAX_NAME_LENGTH = 64;

const formatters = new Map<string, Intl.DateTimeFormat | null>();
let warnedAbout: string | null = null;

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  if (zone.length <= MAX_NAME_LENGTH) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    } catch {
      formatter = null; // not a time zone name
    }
  }
  formatters.set(zone, formatter);
  return formatter;
}

/// The zone the school's day follows: the value given (the environment's SCHOOL_TIME_ZONE by default) when it names a time zone, else UTC.
export function resolveSchoolTimeZone(value: string | undefined = process.env.SCHOOL_TIME_ZONE): string {
  const wanted = value?.trim();
  if (!wanted) return FALLBACK;
  if (formatterFor(wanted)) return wanted;
  if (warnedAbout !== wanted) {
    warnedAbout = wanted;
    console.warn(`[SCHOOL_TIME_ZONE] "${wanted.slice(0, MAX_NAME_LENGTH)}" is not a time zone name; the school's day follows UTC.`);
  }
  return FALLBACK;
}

/// The wall-clock fields of `at` in `zone`, written as a UTC time (so the difference from `at` is the zone's offset at that instant).
function wallClock(formatter: Intl.DateTimeFormat, at: Date): { year: number; month: number; day: number; asUtc: number } {
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return { year: p.year!, month: p.month!, day: p.day!, asUtc };
}

const offsetMs = (formatter: Intl.DateTimeFormat, at: Date): number =>
  wallClock(formatter, at).asUtc - Math.floor(at.getTime() / 1000) * 1000;

/// The instant the school's day containing `now` started: midnight in the school's time zone.
export function startOfSchoolDay(now: Date = new Date(), zone: string = resolveSchoolTimeZone()): Date {
  const formatter = zone === FALLBACK ? null : formatterFor(zone);
  if (!formatter) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { year, month, day } = wallClock(formatter, now);
  const midnight = Date.UTC(year, month - 1, day); // the local midnight, read as if it were UTC
  const first = midnight - offsetMs(formatter, new Date(midnight));
  // The offset at that first guess can differ from the one at midnight itself (a changeover in between), so take it once more from the guess.
  return new Date(midnight - offsetMs(formatter, new Date(first)));
}
