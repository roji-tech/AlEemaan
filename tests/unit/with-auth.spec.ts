import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";

// Misconfiguration must fail at module load (=> `next build` fails), never as a
// route that quietly lets everyone through.
//  - `permissions` is unavailable in BOTH repos until §1.7's permission design is built
//    in both together (nothing consumes it yet).
//  - `roles` is real here (AlEemaan is single-tenant: a role held in any branch applies
//    school-wide) but an EMPTY list would mean "no role satisfies" — refused, not guessed.
test.describe("withAuth refuses configurations that could silently open or close a route", () => {
  const handler = async () => new Response("ok");

  test("`permissions` throws at construction (not available yet)", () => {
    expect(() => withAuth(handler, { permissions: ["CAN_MANAGE_FINANCE"] } as never)).toThrow(/§1\.7/);
  });

  test("an empty `roles` list throws — it would refuse everyone", () => {
    expect(() => withAuth(handler, { roles: [] })).toThrow(/at least one role/);
  });

  test("no options, and a real `roles` list, both yield a route handler", () => {
    expect(typeof withAuth(handler)).toBe("function");
    expect(typeof withAuth(handler, { roles: [Role.ADMIN] })).toBe("function");
    expect(typeof withAuth(handler, { roles: [Role.ADMIN, Role.TEACHING_STAFF] })).toBe("function");
  });
});
