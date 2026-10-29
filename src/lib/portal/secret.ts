// The secret that signs the portal session cookie (HMAC-SHA256). It has NO default.
//
// Until 2026-10-19 `getPortalSecret()` read `SESSION_SECRET || AUTH_SECRET || "<a string in this repository>"`. AUTH_SECRET had been removed from the project
// (0.5.1.5) and `.env.example` documented neither variable, so an install that followed the example signed portal cookies with a value anyone who could read the
// source knew: they could mint a cookie for any pupil id and read that pupil's results and invoices, hand in work and take quizzes as them. The secret is now
// required: at least 32 characters, not the old published default, not repetitive. The server refuses to start without one (src/instrumentation.ts), and signing
// or verifying without one throws; the same stance as `MFA_ENCRYPTION_KEY` ("no key, no feature; never add a development fallback").
//
// Pure functions of the environment, unit-tested over the whole matrix (tests/unit/portal-secret.spec.ts). Nothing here ever puts the secret in a message.

type Env = Record<string, string | undefined>;

/// The one variable. `AUTH_SECRET` is not read any more; an install that only has that is told so, and refused.
export const PORTAL_SECRET_ENV = "SESSION_SECRET";
export const PORTAL_SECRET_MIN_LENGTH = 32;
const MIN_DISTINCT_CHARACTERS = 10;

/// The string that used to be the fallback. It is in git history, so it can never be a secret again, even though it is long enough.
const RETIRED_DEFAULT = "aleemaan-portal-secure-hmac-secret-salt-2026";

export class PortalSecretError extends Error {
  readonly code = "PORTAL_SECRET_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "PortalSecretError";
  }
}

/// Why the environment's portal secret cannot be used, or `null` when it can. The text never contains the secret.
export function portalSecretProblem(env: Env = process.env): string | null {
  const raw = env[PORTAL_SECRET_ENV];
  if (raw === undefined || raw.trim() === "") {
    return env.AUTH_SECRET?.trim()
      ? `${PORTAL_SECRET_ENV} is not set (AUTH_SECRET is no longer read; set ${PORTAL_SECRET_ENV} instead)`
      : `${PORTAL_SECRET_ENV} is not set`;
  }
  const secret = raw.trim();
  if (secret.length < PORTAL_SECRET_MIN_LENGTH) {
    return `${PORTAL_SECRET_ENV} is too short (${secret.length} characters; at least ${PORTAL_SECRET_MIN_LENGTH} are required)`;
  }
  if (secret === RETIRED_DEFAULT) return `${PORTAL_SECRET_ENV} is the old default that was published in the source; it must be replaced`;
  if (new Set(secret).size < MIN_DISTINCT_CHARACTERS) return `${PORTAL_SECRET_ENV} is too repetitive to be a secret`;
  return null;
}

/// The secret to sign and verify with. Throws `PortalSecretError` rather than ever falling back to a built-in value.
export function portalSecret(env: Env = process.env): string {
  const problem = portalSecretProblem(env);
  if (problem) throw new PortalSecretError(`${problem}. Generate one with: openssl rand -base64 48`);
  return (env[PORTAL_SECRET_ENV] as string).trim();
}
