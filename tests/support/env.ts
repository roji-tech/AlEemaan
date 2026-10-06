// Shared constants and environment for every test process (the Playwright
// runner, each worker, and — via playwright.config.ts — the servers under test).
//
// Import this BEFORE anything from "@/lib/..." in a test: it points
// DATABASE_URL at the TEST database, so application code imported in-process
// (session lifecycle tests) can never touch the development database.

// Developer machines keep settings in .env; CI provides real env vars directly.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — fine
}

/// The "inbox": EMAIL_TRANSPORT=file appends one JSON line per message here (see tests/support/outbox.ts).
export const EMAIL_FILE = `${process.cwd()}/tests/.tmp/outbox.jsonl`;

export const HTTP_PORT = 3200; // plain-HTTP app: APP_URL=http://localhost:3200 -> unprefixed cookie
export const HTTPS_APP_PORT = 3201; // same build, APP_URL=https://localhost:3543
export const TLS_PORT = 3543; // TLS-terminating reverse proxy in front of 3201

/// A FOURTH server: the same build in "staging" mode with the dev tools on and a token required, the one place
/// the dev email inbox exists (the other three are production-shaped and must show no trace of it).
export const DEVTOOLS_PORT = 3202;
/// A FIFTH server, the only one with the breached-password check ON — pointed at a local stand-in for the public service
/// (tests/support/pwned-stub.mjs), because nothing in the suite may talk to the real one.
export const BREACH_PORT = 3203;
export const PWNED_STUB_PORT = 3204;
export const DEV_TOOLS_TEST_TOKEN = "test-dev-tools-token-0123456789";

export const HTTP_URL = `http://localhost:${HTTP_PORT}`;
export const DEVTOOLS_URL = `http://localhost:${DEVTOOLS_PORT}`;
export const BREACH_URL = `http://localhost:${BREACH_PORT}`;
export const PWNED_STUB_URL = `http://127.0.0.1:${PWNED_STUB_PORT}`;
export const HTTPS_URL = `https://localhost:${TLS_PORT}`;

/// The database tests run against: TEST_DATABASE_URL if set, otherwise the
/// developer's DATABASE_URL with `_test` appended to the database name. It is
/// idempotent (a name already ending in `_test` is left alone), which matters
/// because this module is evaluated again inside every worker process, where
/// DATABASE_URL has already been rewritten.
function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const base = explicit ?? process.env.DATABASE_URL;
  if (!base) {
    throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) — see .env.example.");
  }
  const url = new URL(base);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    if (explicit) {
      throw new Error(`TEST_DATABASE_URL must name a database ending in "_test" (got "${name}").`);
    }
    url.pathname = `/${name}_test`;
  }
  return url.toString();
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();
export const TEST_DATABASE_NAME = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.replace(/^\//, ""));

// From here on, anything in this process that reads DATABASE_URL gets the test DB.
process.env.DATABASE_URL = TEST_DATABASE_URL;
// The in-process (integration) tests exercise the plain-HTTP cookie shape; the
// https project has its own server with its own APP_URL.
process.env.APP_URL = HTTP_URL;
process.env.EMAIL_TRANSPORT = "file";
process.env.EMAIL_FILE = EMAIL_FILE;
// In-process tests start from the safe default (a production-shaped environment with the dev tools off); a test
// about the dev tools sets what it needs for its own duration.
process.env.APP_ENV = "production";
process.env.DEV_TOOLS = "";
process.env.DEV_TOOLS_TOKEN = "";
// No test talks to the public breach service (and its answers must not decide a test): the check is off everywhere
// except the one server (and the in-process tests) that point it at the local stand-in.
process.env.PWNED_PASSWORD_CHECK = "off";

/// A fixed key for two-step verification, so the in-process tests and both servers agree on it
/// (32 bytes, base64). Tests that need "no key" delete it from process.env for their own duration.
export const TEST_MFA_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;

/// Environment for the Next.js servers under test. Explicit and complete on
/// purpose: nothing from a developer's shell or .env may change what is tested.
export function serverEnv(appUrl: string): Record<string, string> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return {
    ...inherited,
    NODE_ENV: "production",
    DATABASE_URL: TEST_DATABASE_URL,
    APP_URL: appUrl,
    CLIENT_IP_HEADER: "x-real-ip",
    TRUSTED_PROXY_HOPS: "1",
    SETUP_TOKEN: "",
    EMAIL_TRANSPORT: "file",
    EMAIL_FILE,
    // Production-shaped, whatever the developer's own .env says: no dev tools on these servers.
    APP_ENV: "production",
    DEV_TOOLS: "",
    DEV_TOOLS_TOKEN: "",
    PWNED_PASSWORD_CHECK: "off",
  };
}

/// The breach-check server: production-shaped, the check ON, asking the local stand-in instead of the public service.
export function breachServerEnv(): Record<string, string> {
  return { ...serverEnv(BREACH_URL), PWNED_PASSWORD_CHECK: "on", PWNED_PASSWORD_URL: `${PWNED_STUB_URL}/range/` };
}

/// The TLS-proxy deployment: the proxy sets X-Forwarded-Host, so the operator says to trust it (CSRF otherwise compares
/// Origin with the internal Host and refuses every write — see src/lib/auth/csrf.ts).
export function httpsServerEnv(): Record<string, string> {
  return { ...serverEnv(HTTPS_URL), TRUST_FORWARDED_HOST: "true" };
}

/// The dev-tools server: staging mode, the token required, and NO EMAIL_TRANSPORT / RESEND_API_KEY — so mail
/// goes where the app sends it by default in that mode: the in-memory dev inbox.
export function devToolsServerEnv(): Record<string, string> {
  return {
    ...serverEnv(DEVTOOLS_URL),
    EMAIL_TRANSPORT: "",
    RESEND_API_KEY: "",
    APP_ENV: "staging",
    DEV_TOOLS: "true",
    DEV_TOOLS_TOKEN: DEV_TOOLS_TEST_TOKEN,
  };
}
