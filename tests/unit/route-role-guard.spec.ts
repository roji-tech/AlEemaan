import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every API handler declares who may call it (plan "Guard design — every API handler declares who may call it", G1-G3).
// A handler passes when its own source contains `roles:`, or when it is on the allowlist below WITH a reason. A new handler without
// `roles:` fails until someone adds `roles:` or writes the reason down. Source-level on purpose: no server, no database.

const API_ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const PUBLIC = "public by design (no session exists yet, or it must work signed out)";
const OWN = "acts on the caller's own account only";
const CONTENT = "school profile / session dates: content a parent or student legitimately needs";

/// "METHOD path-under-api" -> why it has no `roles:`.
const ALLOWED: Record<string, string> = {
  "POST v1/auth/login/route.ts": PUBLIC,
  "POST v1/auth/login/mfa/route.ts": PUBLIC,
  "POST v1/auth/logout/route.ts": PUBLIC,
  "POST v1/auth/forgot-password/route.ts": PUBLIC,
  "POST v1/auth/reset-password/route.ts": PUBLIC,
  "POST v1/auth/email-change/confirm/route.ts": PUBLIC,
  "POST v1/invitations/accept/route.ts": PUBLIC,
  "POST v1/invitations/preview/route.ts": PUBLIC,
  "GET v1/setup/route.ts": PUBLIC,
  "POST v1/setup/route.ts": PUBLIC,
  "GET v1/dev/email-inbox/route.ts": "dev-only inbox; public in source (whether it refuses in production is tracked separately)",
  "DELETE v1/dev/email-inbox/route.ts": "dev-only inbox; public in source (whether it refuses in production is tracked separately)",
  "GET v1/auth/me/route.ts": OWN,
  "GET v1/auth/sessions/route.ts": OWN,
  "POST v1/auth/sessions/revoke/route.ts": OWN,
  "POST v1/auth/sessions/revoke-others/route.ts": OWN,
  "POST v1/auth/change-password/route.ts": OWN,
  "POST v1/auth/email-change/request/route.ts": OWN,
  "POST v1/auth/mfa/enroll/route.ts": OWN,
  "POST v1/auth/mfa/confirm/route.ts": OWN,
  "POST v1/auth/mfa/disable/route.ts": OWN,
  "POST v1/auth/mfa/recovery-codes/route.ts": OWN,
  "PATCH v1/account/profile/route.ts": OWN,
  "GET v1/settings/school/route.ts": CONTENT,
  "GET v1/academics/sessions/route.ts": CONTENT,
  "GET v1/academics/sessions/[id]/route.ts": CONTENT,
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

/// Every exported handler with the source text that belongs to it (from its `export` to the next one).
function handlers(): { key: string; source: string }[] {
  const found: { key: string; source: string }[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const parts = text.split(new RegExp(`^export (?:const|async function) (${METHODS.join("|")})\\b`, "m"));
    for (let i = 1; i < parts.length; i += 2) found.push({ key: `${parts[i]} ${rel}`, source: parts[i + 1] });
  }
  return found;
}

test.describe("every API handler declares who may call it", () => {
  test("a handler without `roles:` is on the allowlist, with a reason", () => {
    const missing = handlers()
      .filter((h) => !h.source.includes("roles:") && !(h.key in ALLOWED))
      .map((h) => h.key);
    expect(missing, "add `roles: [...]` to these handlers, or list them in ALLOWED with the reason").toEqual([]);
  });

  test("the allowlist has no stale entries (the handler exists and still has no `roles:`)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(ALLOWED).filter((key) => !byKey.has(key) || byKey.get(key)!.includes("roles:"));
    expect(stale).toEqual([]);
  });

  test("the scan finds the handlers it is supposed to guard (it is not silently empty)", () => {
    const all = handlers();
    expect(all.length).toBeGreaterThan(40);
    expect(all.some((h) => h.key === "GET v1/students/route.ts" && h.source.includes("roles:"))).toBe(true);
  });
});
