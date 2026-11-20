// School details per branch (task 0115, task 0101 D4): the pure part, with no database, so the browser can show the same answer the server gives.
//
// The school has one row of details (name, principal, phone, motto, address, e-mail, website) and a branch may have its own. What a branch SHOWS is its own value when it has one and the
// school's when it has not. A value that is blank or only spaces counts as not set: that is how a branch "uses the school's" again, and it means a stray space can never print a blank
// line where the school's value should be.

export const PROFILE_FIELDS = ["schoolName", "principal", "phone", "motto", "address", "email", "website"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string | null>;
export type ProfileSource = "branch" | "school";
export type EffectiveProfile = { values: ProfileValues; source: Record<ProfileField, ProfileSource> };

/// The labels the screens use for the seven fields (the school form's own words; the school name is the branch's own header name: the nursery card can say "Nursery and Primary School").
export const PROFILE_LABELS: Record<ProfileField, string> = {
  schoolName: "School name on report cards",
  principal: "Principal / Head of School",
  phone: "Phone Number",
  motto: "Motto / Slogan",
  address: "Address",
  email: "Official Email",
  website: "Website URL",
};

/// The trimmed text, or null for nothing, blank or only spaces.
export const setValue = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

/// The branch's own value for each field when it is set, else the school's, with where each came from. A field set nowhere is `null` with source "school".
export function mergeProfile(
  school: Partial<Record<ProfileField, string | null>> | null | undefined,
  branch: Partial<Record<ProfileField, string | null>> | null | undefined,
): EffectiveProfile {
  const values = {} as ProfileValues;
  const source = {} as Record<ProfileField, ProfileSource>;
  for (const field of PROFILE_FIELDS) {
    const own = setValue(branch?.[field]);
    values[field] = own ?? setValue(school?.[field]);
    source[field] = own === null ? "school" : "branch";
  }
  return { values, source };
}

/// The line "what will the report cards show": the principal's name is not on this line (it is printed beside the principal's remark), the rest in the order the card prints them.
export function cardPreview(values: ProfileValues): string {
  const parts = [
    values.motto && `motto "${values.motto}"`,
    [values.address, values.phone].filter(Boolean).join(" · ") || null,
    values.principal && `principal ${values.principal}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "no motto, address, phone or principal, because none is set";
}
