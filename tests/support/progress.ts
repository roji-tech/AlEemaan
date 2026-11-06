import { expect } from "@playwright/test";
import { buildWorld, PROGRAMS, send, type World } from "./programs";
import { api } from "./http";

// The world of the progress records specs (task 0044): the programs world (a super admin, a program admin, a supervisor, a teacher of "Juz A", a recorder of "Group 1", a teacher with no
// groups, the administrators of the two branches, and four people), with progress records switched on and the Quran booklet chosen.

export async function progressWorld(): Promise<World> {
  const w = await buildWorld();
  const set = await send("PATCH", `${PROGRAMS}/${w.program}/settings`, w.sa, { progressTemplate: "QURAN_BOOKLET", progressEnabled: true });
  expect(set.status, set.text).toBe(200);
  return w;
}

export const range = (fromSurah: number, fromAyah: number, toSurah: number, toAyah: number) => ({ fromSurah, fromAyah, toSurah, toAyah });

/// A portal sign-in as a pupil (the secret is the date of birth) or a guardian (the guardian's phone): the cookie to send.
export async function portalCookie(admissionNo: string, secret: string): Promise<string> {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status, res.text).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
}
export const PUPIL_DOB = "2013-05-10";
export const GUARDIAN_PHONE = "+2348011110001";
