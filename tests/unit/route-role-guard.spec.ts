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
  "GET v1/verify/[token]/route.ts":
    "public by design: a parent or employer checks a printed code signed out; says nothing about marks, rate limited",
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

/// A handler declares who may call it with `roles:` or `superAdmin: true`.
const declares = (source: string) => source.includes("roles:") || source.includes("superAdmin: true");

/// Second assertion (plan S7): `roles:` means "a role somewhere", so a handler that acts on a BRANCH or on something that belongs to one must
/// also ask about THAT branch. A handler whose source names a branch (`branchId`) or a branch-owned entity must call one of these helpers,
/// or be listed in BRANCH_CHECKED_ELSEWHERE with the reason. Source-level, like the first: it finds a forgotten check, it does not prove a
/// right one (the API specs do that).
const BRANCH_HELPERS = [
  "resolveBranchRole",
  "branchIdsFor",
  "canAdminister",
  "adminScope",
  "scopeOrForbidden",
  "branchOutOfScope",
  "studentOutOfScope",
  "withBranch",
];
const NAMES_A_BRANCH = /branchId|studentId|students?\/\[id\]|membershipId/;

/// "METHOD path-under-api" -> why it needs no helper call in its own source.
const BRANCH_CHECKED_ELSEWHERE: Record<string, string> = {};

/// Third assertion (ADR 0015): a handler that names a branch is wrapped by `withBranch` - the structure that makes the branch check impossible to forget -
/// unless it is listed here with the reason. These are the routes that have NOT been moved over yet, or that act on no single branch. A NEW route cannot
/// join this list without someone writing why; the aim is for it to shrink.
const STRUCTURE = /withBranch[(<]/;
const NOT_WRAPPED: Record<string, string> = {
  "GET v1/academics/sessions/route.ts": "a list every signed-in person needs (content); acts on no single branch",
  "GET v1/branches/route.ts": "lists the branches the caller can see (narrowed by branchIdsFor); acts on no single branch",
  "GET v1/students/route.ts": "a list narrowed to the caller's visible branches (branchIdsFor); acts on no single branch",
  "GET v1/students/[id]/route.ts":
    "reads one student through a visible-branches filter (another branch's student is the same 404); to move to staff-read",
  "POST v1/invitations/route.ts": "the branch is checked by lib/members/http (scopeOrForbidden); to move to administer",
  "POST v1/setup/route.ts": "public first-run setup: creates the first branch and administrator, there is no caller to ask",
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
      .filter((h) => !declares(h.source) && !(h.key in ALLOWED))
      .map((h) => h.key);
    expect(missing, "add `roles: [...]` to these handlers, or list them in ALLOWED with the reason").toEqual([]);
  });

  test("the allowlist has no stale entries (the handler exists and still has no `roles:`)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(ALLOWED).filter((key) => !byKey.has(key) || declares(byKey.get(key)!));
    expect(stale).toEqual([]);
  });

  test("a handler that names a branch asks about that branch (or says where it is checked)", () => {
    const unchecked = handlers()
      .filter((h) => !(h.key in ALLOWED)) // public and own-account handlers act on no branch
      .filter((h) => NAMES_A_BRANCH.test(h.source) && !BRANCH_HELPERS.some((name) => h.source.includes(name)))
      .map((h) => h.key)
      .filter((key) => !(key in BRANCH_CHECKED_ELSEWHERE));
    expect(
      unchecked,
      "call a branch helper (lib/auth/branch-access, lib/students/scope, lib/members/http) or list them with the reason",
    ).toEqual([]);
  });

  test("the branch allowlist has no stale entries", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(BRANCH_CHECKED_ELSEWHERE).filter(
      (key) => !byKey.has(key) || !NAMES_A_BRANCH.test(byKey.get(key)!) || BRANCH_HELPERS.some((name) => byKey.get(key)!.includes(name)),
    );
    expect(stale).toEqual([]);
  });

  test("a handler that names a branch is wrapped by withBranch, or is listed as not yet moved / acting on no one branch (ADR 0015)", () => {
    const unwrapped = handlers()
      .filter((h) => NAMES_A_BRANCH.test(h.source) && !STRUCTURE.test(h.source))
      .map((h) => h.key)
      .filter((key) => !(key in NOT_WRAPPED));
    expect(unwrapped, "wrap the handler with withBranch (lib/auth/with-branch.ts) or list it in NOT_WRAPPED with the reason").toEqual([]);
  });

  test("the not-wrapped list has no stale entries (the handler exists, still names a branch, and is still unwrapped)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(NOT_WRAPPED).filter(
      (key) => !byKey.has(key) || !NAMES_A_BRANCH.test(byKey.get(key)!) || STRUCTURE.test(byKey.get(key)!),
    );
    expect(stale).toEqual([]);
  });

  test("the scan finds the handlers it is supposed to guard (it is not silently empty)", () => {
    const all = handlers();
    expect(all.length).toBeGreaterThan(40);
    expect(all.some((h) => h.key === "GET v1/students/route.ts" && h.source.includes("roles:"))).toBe(true);
  });
});
