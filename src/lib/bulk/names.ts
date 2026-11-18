// One "Name" cell to first, middle and last name (task 0084, the maintainer's request): a school's own list usually has a single name column. Plain rules, no guessing at cultures:
// the FIRST word is the first name, the LAST word is the last name, every word between is the middle name. A name of one word has no last name, so the row is refused for it (the
// review says "Last name is required") rather than inventing one. A name written entirely in capitals ("ABASS KHOLID") is turned into ordinary capitals ("Abass Kholid"); a name
// that already has lower-case letters is never changed.

const properCase = (word: string) =>
  word.toLowerCase().replace(/(^|[-'’])([a-z])/g, (_all, edge: string, letter: string) => edge + letter.toUpperCase());

export function splitFullName(full: string): { first: string; middle: string; last: string } {
  const words = full
    .replace(/[ \s]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const allCaps = words.length > 0 && words.every((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  const tidy = words.map((w) => (allCaps ? properCase(w) : w));
  if (tidy.length === 0) return { first: "", middle: "", last: "" };
  if (tidy.length === 1) return { first: tidy[0], middle: "", last: "" };
  return { first: tidy[0], middle: tidy.slice(1, -1).join(" "), last: tidy[tidy.length - 1] };
}
