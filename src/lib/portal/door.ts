import crypto from "node:crypto";
import type { HostInfo } from "@/lib/portals";
import { portalSecret } from "./secret";

// The family sign-in's one door (task 0113, task 0094 D1, D2, D7, D9). Pure apart from the hash's server secret.
//
// - The address decides who is signing in: `student.` is the pupil (admission number + the pupil's access code, or the date of birth while the branch allows it); `parent.` is a guardian
//   (admission number + the access code of an allowed guardian of that child, or that guardian's full phone number or e-mail address while the branch allows it). A secret meant for the
//   other address is the same generic failure as a wrong one. The school's own address and the staff and admin addresses have no family sign-in (`NONE`). A deployment with the portals
//   switched off has one address for everyone: there the old single form stays and either secret decides who is signing in (`ANY`).
// - An access code is 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L): 31^8, about 40 bits, random, made by the server. Only a slow hash of it is kept, peppered with
//   the server's secret and salted with its owner (the pupil, or the guardian: one code per guardian, task 0113 D7), so a copied database alone cannot be searched for codes.

export type Door = "PUPIL" | "GUARDIAN" | "ANY" | "NONE";

export function doorFor(info: HostInfo): Door {
  if (info.kind === "off") return "ANY";
  if (info.kind === "portal" && info.portal === "student") return "PUPIL";
  if (info.kind === "portal" && info.portal === "parent") return "GUARDIAN";
  return "NONE";
}

export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ACCESS_CODE_LENGTH = 8;
export type CodeKind = "pupil" | "guardian";

/// A new random code, from the operating system's random source.
export function newAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) code += ACCESS_CODE_ALPHABET[crypto.randomInt(ACCESS_CODE_ALPHABET.length)];
  return code;
}

/// What a person typed, as a code: upper case, spaces and dashes dropped. Null when it cannot be a code (so a date of birth or a phone number is never hashed as one).
export function normalizeCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, "");
  if (clean.length !== ACCESS_CODE_LENGTH) return null;
  for (const ch of clean) if (!ACCESS_CODE_ALPHABET.includes(ch)) return null;
  return clean;
}

/// "ABCD-EFGH": how a code is printed and shown, easier to read aloud and to type.
export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/// N = 2^13: about 20 ms a hash, so a class sheet of 100 pupils (at most 200 codes) is a few seconds; the pepper (the server secret) is what stops a copied database being searched.
const SCRYPT = { N: 8192, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const PREFIX = "s1$";

/// The salt of a code: the server secret (the pepper) and its owner, a pupil (`kind` pupil, the pupil's id) or a guardian (`kind` guardian, the guardian's id).
const saltOf = (ownerId: string, kind: CodeKind) =>
  kind === "pupil" ? `${portalSecret()}:${ownerId}:pupil` : `${portalSecret()}:guardian:${ownerId}`;

/// The stored form of a code: scrypt over the code, salted with its owner and peppered with the server secret.
export function hashAccessCode(code: string, ownerId: string, kind: CodeKind): string {
  return PREFIX + crypto.scryptSync(code, saltOf(ownerId, kind), 32, SCRYPT).toString("hex");
}

/// Does `typed` match the stored hash? False for anything that is not a code, or when no code was issued. Constant-time on the hash.
export function verifyAccessCode(typed: string, stored: string | null | undefined, ownerId: string, kind: CodeKind): boolean {
  if (!stored || !stored.startsWith(PREFIX)) return false;
  const code = normalizeCode(typed);
  if (!code) return false;
  const want = Buffer.from(stored.slice(PREFIX.length), "hex");
  const got = Buffer.from(hashAccessCode(code, ownerId, kind).slice(PREFIX.length), "hex");
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
