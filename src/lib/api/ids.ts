// Ids in this app are cuids: letters, digits, hyphen and underscore. Anything else (a NUL byte, a control character, a 5 KB string) can only be a mistake or an attack, and
// a NUL in a query parameter is not "not found": Postgres rejects the text and the request ends as a 500. Check an id that comes from a URL, a query string or a body
// BEFORE it reaches a query, and answer as if the thing did not exist.

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isPlausibleId = (value: unknown): value is string => typeof value === "string" && ID_PATTERN.test(value);

// A value taken from the URL PATH ([id], [studentId], ...) is looser than an id: some routes take other shapes (a code, a date), so this only refuses what can never be
// right and is known to end as a 500: a control character (a NUL byte is a Postgres error), an unpaired surrogate (invalid text), or an absurd length. `withAuth` applies
// it to every dynamic route, so no route has to remember it.
const UNUSABLE_PATH_VALUE = /[\p{Cc}\p{Cs}]/u;

export const isUnusablePathValue = (value: string): boolean => value.length > 256 || UNUSABLE_PATH_VALUE.test(value);

/// What a path value that cannot be right is replaced with before a route sees it: a string no id, code or date equals, so the route answers exactly as it does for any
/// id that does not exist (its own 404, its own words). That keeps "malformed" and "unknown" indistinguishable, which several routes promise and test.
export const UNUSABLE_PATH_VALUE_STAND_IN = "_";

/// The route's `params` with every unusable value (a string, or any part of a catch-all array) replaced by the stand-in. Returns the SAME object when nothing is unusable.
export function sanitizePathParams<T>(params: T): T {
  if (typeof params !== "object" || params === null) return params;
  let changed = false;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && isUnusablePathValue(value)) {
      clean[key] = UNUSABLE_PATH_VALUE_STAND_IN;
      changed = true;
    } else if (Array.isArray(value) && value.some((v) => typeof v === "string" && isUnusablePathValue(v))) {
      clean[key] = value.map((v) => (typeof v === "string" && isUnusablePathValue(v) ? UNUSABLE_PATH_VALUE_STAND_IN : v));
      changed = true;
    } else clean[key] = value;
  }
  return changed ? (clean as T) : params;
}

/// True when any value in a route's `params` is unusable.
export const hasUnusablePathParam = (params: unknown): boolean => sanitizePathParams(params) !== params;

/// A path with broken percent-encoding ("%ff", "%ED%A0%80", a lone "%"): Next answers it with a 500 before any route runs, so it is refused earlier, in the proxy, as a 400.
export function isMalformedPath(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}
