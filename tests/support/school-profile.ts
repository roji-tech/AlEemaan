import { db } from "./db";

// The school profile (the `SchoolSettings` row) as a browser spec of the landing pages needs it (task 0070): the pages show the motto and the ways to reach the school from it, and other specs
// (the settings API spec) leave their own values in the shared test database, so a landing spec states the profile it expects, and puts back what it found.

export type Profile = { motto: string | null; phone: string | null; email: string | null; address: string | null; website: string | null };
export const EMPTY_PROFILE: Profile = { motto: null, phone: null, email: null, address: null, website: null };

const select = { motto: true, phone: true, email: true, address: true, website: true } as const;

export async function readProfile(): Promise<Profile> {
  return (await db.schoolSettings.findUnique({ where: { id: "global" }, select })) ?? EMPTY_PROFILE;
}

/// Writes the five public fields straight into the row, as a row written by hand or before a rule would be (the API validates; this does not).
export async function setProfile(fields: Partial<Profile>): Promise<void> {
  const data = { ...EMPTY_PROFILE, ...fields };
  await db.schoolSettings.upsert({ where: { id: "global" }, update: data, create: { id: "global", ...data } });
}
