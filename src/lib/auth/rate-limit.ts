// In-memory, single-process rate limiter. AlEemaan always runs as one
// long-lived process (Docker Compose / a single VPS), never serverless or
// multi-instance, so in-memory state can't be bypassed by hitting a
// different instance. Revisit if that deployment assumption ever changes.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function checkRateLimit(identifier: string): boolean {
  const since = Date.now() - WINDOW_MS;
  const recent = (attempts.get(identifier) ?? []).filter((t) => t > since);
  attempts.set(identifier, recent);
  return recent.length < MAX_ATTEMPTS;
}

export function recordAttempt(identifier: string): void {
  const recent = attempts.get(identifier) ?? [];
  recent.push(Date.now());
  attempts.set(identifier, recent);
}

export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const raw = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  return raw.split(",")[0].trim();
}
