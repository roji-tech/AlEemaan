// Unconfirmed grade scales (task 0116 D15), the pure rule: no database, safe for the browser. The seeded junior scale's cut-offs are a guess (the school's junior card prints grade names and no
// ranges), so it starts UNCONFIRMED. While it is, entering and approving marks work, but PUBLISHING results graded on it is refused until an administrator confirms the bands.

/// Does an unconfirmed scale stop PUBLISHING? Off for now: the maintainer (2026-11-20) accepted the seeded junior cut-offs as the working defaults ("let's go with your defaults for now"), so an
/// unconfirmed scale shows its notice and a Confirm button but results graded on it publish. Turn it on to make confirming a hard requirement again (the check in results-workflow.ts is kept).
export const BLOCK_PUBLISH_ON_UNCONFIRMED = false;

export const UNCONFIRMED_NOTICE = "Please confirm these grade bands: they were set from the card, which prints no ranges";
export const CONFIRM_WHERE = "Results > Templates (Grade scales) or Academics > Assessment and grading";

export type ScaleStamp = { name: string; version: number; unconfirmed: boolean };

/// The refusal for a publish over these scales (the ones the results are graded on), or null when every one is confirmed. Names each unconfirmed scale once and says where to confirm.
export function unconfirmedPublishMessage(scales: readonly ScaleStamp[]): string | null {
  const bad = new Map<string, ScaleStamp>();
  for (const s of scales) if (s.unconfirmed) bad.set(`${s.name}#${s.version}`, s);
  if (bad.size === 0) return null;
  const names = [...bad.values()].map((s) => (s.version > 1 ? `${s.name} (version ${s.version})` : s.name));
  return `These results cannot be published yet: the grade bands of ${names.join(", ")} ${names.length === 1 ? "have" : "have"} not been confirmed. Confirm them in ${CONFIRM_WHERE}, then publish.`;
}

/// Does a scale STAY unconfirmed after a save? An unconfirmed scale whose bands were changed is confirmed by the save (the administrator wrote them); a rename alone leaves it unconfirmed; a confirmed
/// scale never becomes unconfirmed.
export const staysUnconfirmed = (wasUnconfirmed: boolean, bandsChanged: boolean): boolean => wasUnconfirmed && !bandsChanged;
