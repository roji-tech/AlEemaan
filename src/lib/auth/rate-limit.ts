// Rate limiter: reserve-then-refund, trusted-proxy-header IP, size-capped in memory, and (task 0102) kept in the DATABASE by default.
//
// WHERE THE COUNTS LIVE. The sign-in limits (and every other caller) used to count in the memory of the one server process, which was right for a single long-lived process and wrong
// on Vercel: many instances run, each with its own count, and a restart starts it again, so a limit was looser than its number said (docs/DEPLOYMENT.md said so; the family sign-in's
// guessable secrets made that matter). Now every reservation is a row in `RateLimitHit` (key, time) and the count is read from the database, so it holds across instances. The window
// is still an exact sliding one of five minutes, and an attempt that is refused is not recorded (it never extends a lockout).
//
// ATOMIC. Counting and recording must happen as one step, or concurrent requests all pass the count before any of them records: the reservation runs in one transaction that first takes a
// per-key advisory lock (`pg_advisory_xact_lock`, released at commit), so two requests for the same key queue behind each other and different keys never wait.
//
// IF THE DATABASE FAILS the limiter falls back to counting in this process's memory (the old behaviour, same limits) and says so once in the log: a limiter must not take every sign-in
// down with it, and must not turn into "no limit". `RATE_LIMIT_STORE=memory` chooses memory on purpose (a single Docker process; local runs that want no database traffic).
//
// INVARIANT for the memory half: its bodies stay synchronous (no `await`). An async function runs synchronously until its first await, which is what makes each in-memory reservation
// atomic in a single-threaded process. tests/unit/rate-limit.spec.ts guards it.

import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const MAX_TRACKED_IDENTIFIERS = 10_000; // hard cap — see sweep()

const attempts = new Map<string, number[]>();

/// Evicts the least-recently-touched identifiers once the map grows past the
/// cap. Without a cap an attacker cycling through unique identifiers grows the
/// Map forever. `touch()` re-inserts a key on every write, so Map insertion
/// order == last-touched order and the first keys are the stalest — a hot
/// legitimate key is never evicted ahead of a one-off attacker key.
function sweep() {
  if (attempts.size <= MAX_TRACKED_IDENTIFIERS) return;
  const overflow = attempts.size - MAX_TRACKED_IDENTIFIERS;
  let removed = 0;
  for (const key of attempts.keys()) {
    attempts.delete(key);
    if (++removed >= overflow) break;
  }
}

function touch(identifier: string, recent: number[]) {
  attempts.delete(identifier); // delete-then-set moves the key to the end
  attempts.set(identifier, recent);
}

function recentCount(identifier: string): number {
  const since = Date.now() - WINDOW_MS;
  const recent = (attempts.get(identifier) ?? []).filter((t) => t > since);
  if (recent.length > 0) attempts.set(identifier, recent);
  else attempts.delete(identifier);
  return recent.length;
}

// --- In memory (the fallback, and `RATE_LIMIT_STORE=memory`) ---------------------------------

function memoryReserve(identifier: string, limit: number): boolean {
  const count = recentCount(identifier);
  if (count >= limit) return false;
  const recent = attempts.get(identifier) ?? [];
  recent.push(Date.now());
  touch(identifier, recent);
  sweep();
  return true;
}

function memoryRefund(identifier: string): void {
  const recent = attempts.get(identifier);
  if (!recent || recent.length === 0) return;
  recent.pop();
  if (recent.length === 0) attempts.delete(identifier);
}

const memoryCheck = (identifier: string, limit: number): boolean => recentCount(identifier) < limit;

/// The in-memory limiter on its own, for the tests of its rules and of the fallback.
export const memoryLimiter = {
  reserve: memoryReserve,
  refund: memoryRefund,
  check: memoryCheck,
  clear: () => attempts.clear(),
};

// --- In the database (the default) -------------------------------------------------------

const storeIsDatabase = () => (process.env.RATE_LIMIT_STORE ?? "database").toLowerCase() !== "memory";

let warnedFallback = false;
function fellBack(error: unknown) {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn(
    `[RATE_LIMIT] The database could not be used (${error instanceof Error ? error.name : "error"}); counting in this process's memory instead, which is looser on a host with several instances.`,
  );
}

/// Old rows are removed as keys are used: this key's rows past the window on every reservation (cheap, indexed), and now and then everything past it, so a key nobody uses again leaves
/// nothing behind.
const SWEEP_ONE_IN = 200;

async function databaseReserve(identifier: string, limit: number): Promise<boolean> {
  const now = Date.now();
  const since = new Date(now - WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    await tx.$executeRaw`DELETE FROM "RateLimitHit" WHERE "key" = ${identifier} AND "at" <= ${since}`;
    const [row] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "RateLimitHit" WHERE "key" = ${identifier}`;
    if ((row?.n ?? 0) >= limit) return false;
    await tx.$executeRaw`INSERT INTO "RateLimitHit" ("id", "key", "at") VALUES (${crypto.randomUUID()}, ${identifier}, ${new Date(now)})`;
    if (Math.floor(Math.random() * SWEEP_ONE_IN) === 0) await tx.$executeRaw`DELETE FROM "RateLimitHit" WHERE "at" <= ${since}`;
    return true;
  });
}

async function databaseRefund(identifier: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    await tx.$executeRaw`DELETE FROM "RateLimitHit" WHERE "id" = (SELECT "id" FROM "RateLimitHit" WHERE "key" = ${identifier} ORDER BY "at" DESC LIMIT 1)`;
  });
}

async function databaseCheck(identifier: string, limit: number): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [row] = await prisma.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM "RateLimitHit" WHERE "key" = ${identifier} AND "at" > ${since}`;
  return (row?.n ?? 0) < limit;
}

/// Reserve-then-refund: call this at the very start of the handler, before any slow async work, for every key that should gate the request. Returns false (reserving nothing further)
/// the moment a key is already at its limit; a refused call records nothing, so hammering while locked out never extends the lockout.
export async function reserveAttempt(identifier: string, limit: number = DEFAULT_MAX_ATTEMPTS): Promise<boolean> {
  if (!storeIsDatabase()) return memoryReserve(identifier, limit);
  try {
    return await databaseReserve(identifier, limit);
  } catch (error) {
    fellBack(error);
    return memoryReserve(identifier, limit);
  }
}

/// Call on a SUCCESSFUL attempt to hand back the reservation this request made, so a correct login never counts against the user's own future tries.
export async function refundAttempt(identifier: string): Promise<void> {
  if (!storeIsDatabase()) return memoryRefund(identifier);
  try {
    await databaseRefund(identifier);
  } catch (error) {
    fellBack(error);
    memoryRefund(identifier);
  }
}

/// Read-only check (does not reserve). Used for the soft per-account signal.
export async function checkRateLimit(identifier: string, limit: number = DEFAULT_MAX_ATTEMPTS): Promise<boolean> {
  if (!storeIsDatabase()) return memoryCheck(identifier, limit);
  try {
    return await databaseCheck(identifier, limit);
  } catch (error) {
    fellBack(error);
    return memoryCheck(identifier, limit);
  }
}

// --- Client IP -------------------------------------------------------------
//
// Only ever reads a header the reverse proxy itself sets, never the
// client-controlled leftmost X-Forwarded-For entry — that value costs an
// attacker nothing to spoof and is exactly what let the previous limiter be
// bypassed with a fresh fake IP per request (docs/auth-review-2026-09-29.md).
//
// Configure to match the deployment (both default to the nginx convention):
//   CLIENT_IP_HEADER    "x-real-ip" (default) — proxy overwrites it with the
//                       real peer address, e.g. nginx `proxy_set_header
//                       X-Real-IP $remote_addr`, or Caddy `header_up X-Real-IP
//                       {remote_host}`.
//                       "x-forwarded-for" — take the Nth entry from the RIGHT,
//                       where N = TRUSTED_PROXY_HOPS (default 1). Entries to
//                       the left of the trusted proxies' own are client-
//                       controlled and are never read.
//   TRUSTED_PROXY_HOPS  number of trusted proxies appending to
//                       X-Forwarded-For (default 1).
//
// No usable header (plain local dev, or a misconfigured proxy) falls back to
// ONE shared bucket. That is correct for local dev (one client) but in a
// deployment that really has many clients it turns the per-IP limit into a
// school-wide limit — so it warns once in production.

const MAX_IP_LENGTH = 64;
const UNPROXIED = "unproxied";
let warnedNoProxy = false;

function nthFromRight(value: string, hops: number): string | null {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const index = parts.length - hops;
  return index >= 0 && index < parts.length ? parts[index] : null;
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const header = (process.env.CLIENT_IP_HEADER ?? "x-real-ip").toLowerCase();
  const raw = req.headers.get(header);

  let ip: string | null = null;
  if (raw) {
    if (header === "x-forwarded-for") {
      const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
      ip = nthFromRight(raw, hops);
    } else {
      ip = raw.trim();
    }
  }

  if (!ip) {
    if (!warnedNoProxy && process.env.NODE_ENV === "production") {
      warnedNoProxy = true;
      console.warn(
        `[RATE_LIMIT] No client IP in "${header}" — per-IP limits collapse into one shared bucket. ` +
          "Configure the reverse proxy to set it (see CLIENT_IP_HEADER in .env.example).",
      );
    }
    return UNPROXIED;
  }
  return ip.slice(0, MAX_IP_LENGTH);
}

const MAX_USER_AGENT_LENGTH = 256;

/// What an audit record keeps about the caller: the address the proxy reports (the same one the limits use, never the browser's own X-Forwarded-For list, which anyone
/// can write), nothing at all when there is none (so a log never holds a made-up address), and the browser's description of itself cut to a sensible length.
export function auditClientInfo(req: { headers: { get(name: string): string | null } }): { ipAddress?: string; userAgent?: string } {
  const ip = getClientIp(req);
  const agent = req.headers.get("user-agent")?.trim().slice(0, MAX_USER_AGENT_LENGTH);
  return { ipAddress: ip === UNPROXIED ? undefined : ip, userAgent: agent || undefined };
}
