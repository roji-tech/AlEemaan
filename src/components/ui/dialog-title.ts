/// A dialog title that is an action followed by the name of what it acts on ("Edit Aluko Fuad", "History of Tola Teacher", "Rename 2026/2027") is drawn with the action in a quiet
/// colour and the name in the accent, so the eye lands on WHO or WHAT the dialog is about (task 0100). The text itself never changes, so the dialog's accessible name and every
/// test that looks for it are the same as before. Pure, so it can be tested without a browser.
///
/// Only a title that starts with one of these actions, and whose rest begins with a capital letter or a digit (a proper name, a year, an invoice number), is split. "Edit arm Main"
/// and "Remove this branch?" are plain sentences, not a name after a verb, and stay as they are. A closing question mark stays outside the name.
const ACTIONS = [
  "Standing history of",
  "History of",
  "Dates of",
  "Subjects of",
  "Add an arm to",
  "Add a break to",
  "Add slot to",
  "Reactivate",
  "Deactivate",
  "Archive",
  "Restore",
  "Suspend",
  "Revoke",
  "Remove",
  "Rename",
  "Change",
  "Expel",
  "Edit",
  "Invoice",
];

const PATTERN = new RegExp(`^(${ACTIONS.join("|")}) (\\S.*?)(\\?)?$`);

export type TitleParts = { action: string; name: string; tail: string };

export function splitTitle(title: string): TitleParts | null {
  const match = PATTERN.exec(title);
  if (!match) return null;
  const name = match[2] ?? "";
  if (!/^[\p{Lu}\p{Nd}]/u.test(name)) return null;
  return { action: match[1] ?? "", name, tail: match[3] ?? "" };
}
