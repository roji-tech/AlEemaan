import { TEST_PORTAL_SECRET } from "../support/env";
import { test, expect } from "@playwright/test";
import { checkRequiredSecrets } from "../../src/instrumentation-node";

// `checkRequiredSecrets` is what stops the server at start (src/instrumentation.ts). Here with an injected environment and a fake `exit`; the real thing,
// a real `next start` process that must exit, is tests/integration/startup-secrets.spec.ts.

class Exited extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}
const exit = (code: number): never => {
  throw new Exited(code);
};

test.describe("checkRequiredSecrets", () => {
  test("a valid secret: returns, prints nothing, never exits", () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      expect(() => checkRequiredSecrets({ SESSION_SECRET: TEST_PORTAL_SECRET }, exit)).not.toThrow();
    } finally {
      console.error = original;
    }
    expect(logged).toEqual([]);
  });

  for (const [name, env] of [
    ["missing", {}],
    ["blank", { SESSION_SECRET: "   " }],
    ["AUTH_SECRET only", { AUTH_SECRET: TEST_PORTAL_SECRET }],
    ["too short", { SESSION_SECRET: "short-secret" }],
    ["the old published default", { SESSION_SECRET: "aleemaan-portal-secure-hmac-secret-salt-2026" }],
    ["repetitive", { SESSION_SECRET: "z".repeat(80) }],
  ] as const) {
    test(`${name}: names the variable, exits with code 1, and never prints the value`, () => {
      const logged: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => void logged.push(args.join(" "));
      let code: number | undefined;
      try {
        checkRequiredSecrets(env, exit);
      } catch (error) {
        code = error instanceof Exited ? error.code : undefined;
      } finally {
        console.error = original;
      }
      expect(code).toBe(1);
      const output = logged.join("\n");
      expect(output).toContain("SESSION_SECRET");
      expect(output).toContain("openssl rand -base64 48");
      for (const value of Object.values(env)) if (value && value.trim().length > 8) expect(output).not.toContain(value);
    });
  }
});
