import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

// A valid bcrypt hash of an unguessed, never-used value, generated at
// module load (boot) time at the real production cost factor. Used to make
// every login failure path run bcrypt.compare exactly once, regardless of
// whether a matching user exists — closes a real timing side-channel: a
// missing-user response that skips bcrypt entirely is measurably faster
// than a wrong-password response that runs it, even when both return the
// identical error. A malformed placeholder (not a real bcrypt hash) would
// make bcrypt.compare return instantly and defeat this, so this is a
// genuine hash, not a hardcoded string.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/// Always calls bcrypt.compare, even when `hash` is null (no such user, or
/// an invited-but-not-activated account with no passwordHash yet) — compares
/// against DUMMY_HASH instead so both branches cost the same.
export function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}
