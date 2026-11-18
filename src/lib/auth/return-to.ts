// "Take me back to the page I was on" after signing in. The page a person was sent away from travels in the sign-in address (`/login?next=/students`), so it is input from outside and is
// treated as such: only a path INSIDE this site is ever followed. `//host`, `/\host`, a full address, a control character and anything long are refused, and so are the pages that are
// part of signing in or are not pages (the sign-in page itself, the API, setup), which would loop or leak.

const MAX_LENGTH = 512;
const NEVER = [
  /^\/login(\/|\?|$)/,
  /^\/api(\/|\?|$)/,
  /^\/setup(\/|\?|$)/,
  /^\/logout(\/|\?|$)/,
  /^\/forgot-password(\/|\?|$)/,
  /^\/reset-password(\/|\?|$)/,
];

/// The path to return to, or null when `value` is not a safe in-site path (the caller then goes to the dashboard as before).
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f\u2028\u2029]/.test(value)) return null;
  if (NEVER.some((pattern) => pattern.test(value))) return null;
  if (value === "/dashboard") return null; // where it goes anyway
  return value;
}

/// The sign-in address for a person sent away from `path` (the plain one when there is nothing safe to come back to).
export function loginPathFor(path: unknown): string {
  const safe = safeReturnTo(path);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/// The request header the proxy sets with the path and query of the page being asked for, so a server component that has to send the person to sign in knows where they were.
export const RETURN_TO_HEADER = "x-return-to";
