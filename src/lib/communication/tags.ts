// Which {{tags}} a broadcast can fill in, and for whom (task 0055). Pure, no database: the Broadcast Composer reads this to offer a chip, and the input check reads it to refuse
// a message that holds a tag nobody would fill, so a chip can never be offered that the server will not fill and a guardian can never receive the text "{{class_arm}}".
//
// The values themselves are made by `broadcastMessage` (service.ts): the school's name, today's date in the school's time zone, and, for a guardian, the pupil's name and class.

export type TagGroup = "GUARDIANS" | "STAFF" | "STUDENTS";

export type BroadcastTag = { token: string; label: string; groups: readonly TagGroup[] };

const EVERYONE: readonly TagGroup[] = ["GUARDIANS", "STAFF", "STUDENTS"];

/// Every tag a broadcast can fill. `token` is the name between the braces.
export const BROADCAST_TAGS: readonly BroadcastTag[] = [
  { token: "student_name", label: "Student Name", groups: ["GUARDIANS"] },
  { token: "class_arm", label: "Class Arm", groups: ["GUARDIANS"] },
  { token: "school_name", label: "School Name", groups: EVERYONE },
  { token: "date", label: "Today's Date", groups: EVERYONE },
];

/// The group a target audience belongs to: the three guardian audiences (all, one class, one arm) share their tags.
export function tagGroupOf(targetAudience: string): TagGroup {
  if (targetAudience === "STAFF") return "STAFF";
  if (targetAudience === "STUDENTS") return "STUDENTS";
  return "GUARDIANS";
}

/// The tags that can be filled for an audience, in the order the composer shows them.
export function tagsFor(targetAudience: string): BroadcastTag[] {
  const group = tagGroupOf(targetAudience);
  return BROADCAST_TAGS.filter((tag) => tag.groups.includes(group));
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g; // the same shape `interpolateTokens` replaces

/// The names of the tags a text holds, once each, in the order they first appear.
export function tagsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen: string[] = [];
  for (const match of text.matchAll(TOKEN)) if (!seen.includes(match[1])) seen.push(match[1]);
  return seen;
}

/// The tags in these texts that nobody would fill for this audience: not one of its tags, and not a key the caller supplied in `variables`.
export function findUnfillableTags(
  texts: (string | null | undefined)[],
  targetAudience: string,
  suppliedKeys: readonly string[] = [],
): string[] {
  const fillable = new Set([...tagsFor(targetAudience).map((tag) => tag.token), ...suppliedKeys]);
  const bad: string[] = [];
  for (const text of texts) for (const name of tagsIn(text)) if (!fillable.has(name) && !bad.includes(name)) bad.push(name);
  return bad;
}

/// The words of the audience, for a sentence ("These tags cannot be filled for staff").
export function audienceWords(targetAudience: string): string {
  const group = tagGroupOf(targetAudience);
  return group === "STAFF" ? "staff" : group === "STUDENTS" ? "pupils" : "guardians";
}

/// Today's date written for a message ("12 November 2026"), in the school's time zone.
export function messageDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(now);
}
