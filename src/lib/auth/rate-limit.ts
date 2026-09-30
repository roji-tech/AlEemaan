// In-memory, single-process rate limiter. AlEemaan always runs as one
// long-lived process (Docker Compose / a single VPS), never serverless or
// multi-instance, so in-memory state can't be bypassed by hitting a
// different instance, and no external store (Redis etc.) is needed to fix
// the race below — it only requires the accounting to happen synchronously
// within this one process. Revisit if that deployment assumption changes.
//
// Rewritten 2026-09-30 against docs/auth-review-2026-09-29.md's findings:
// the original version (a) trusted the client-suppliable X-Forwarded-For
// header as-is, letting an attacker bypass every limit with a fresh spoofed
// IP per request while also leaking one Map entry per spoofed value forever;
// (b) checked the limit before the slow async login work and only recorded
// after, so concurrent requests could all pass the check before any of them
// recorded anything (a check-then-record race, not fixed by "more RAM" —
// fixed by reordering); (c) keyed only on IP, so one shared IP (an office,
// a school's network) could exhaust the limit for everyone behind it after
// five failures by any one person.

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_IDENTIFIERS = 10_000; // hard cap — see sweep() below

const attempts = new Map<string, number[]>();

/// Evicts the oldest-touched identifiers once the map grows past the cap —
/// without this, an attacker cycling through unique spoofed identifiers
/// (see getClientIp's trust boundary below) grows this Map forever.
function sweep() {
  if (attempts.size <= MAX_TRACKED_IDENTIFIERS) return;
  const overflow = attempts.size - MAX_TRACKED_IDENTIFIERS;
  const oldest = [...attempts.keys()].slice(0, overflow);
  for (const key of oldest) attempts.delete(key);
}

function recentCount(identifier: string): number {
  const since = Date.now() - WINDOW_MS;
  const recent = (attempts.get(identifier) ?? []).filter((t) => t > since);
  if (recent.length > 0) attempts.set(identifier, recent);
  else attempts.delete(identifier);
  return recent.length;
}

/// Reserve-then-refund: call this SYNCHRONOUSLY, before any `await` in the
/// handler, for every key that should gate the request. Returns false (and
/// reserves nothing further) the moment any key is already at its limit.
/// Node is single-threaded, so as long as nothing awaits between the
/// recentCount() read and the attempts.set() write below, no other request
/// can interleave and see stale state — that's what actually closes the
/// race, not an external atomic store.
export function reserveAttempt(identifier: string, limit: number = MAX_ATTEMPTS): boolean {
  const count = recentCount(identifier);
  if (count >= limit) return false;
  const recent = attempts.get(identifier) ?? [];
  recent.push(Date.now());
  attempts.set(identifier, recent);
  sweep();
  return true;
}

/// Call on a SUCCESSFUL login to refund the reservation this request made —
/// keeps a legitimate user's own successful attempt from permanently
/// counting against their own future attempts.
export function refundAttempt(identifier: string): void {
  const recent = attempts.get(identifier);
  if (!recent || recent.length === 0) return;
  recent.pop();
  if (recent.length === 0) attempts.delete(identifier);
}

export function checkRateLimit(identifier: string, limit: number = MAX_ATTEMPTS): boolean {
  return recentCount(identifier) < limit;
}

/// Only trusts a header the reverse proxy itself is configured to set
/// (X-Real-IP — nginx's `proxy_set_header X-Real-IP $remote_addr` is the
/// standard convention). Deliberately does NOT fall back to the raw
/// X-Forwarded-For header's client-controlled leftmost entry, since that
/// value costs an attacker nothing to spoof and is exactly what let the
/// previous version's limiter be bypassed per-request. No trusted proxy
/// configured (e.g. plain local dev with no reverse proxy) falls back to a
/// single shared bucket — correct for that case (there's only ever one real
/// client), not a bypass.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get("x-real-ip")?.trim() || "unproxied";
}
