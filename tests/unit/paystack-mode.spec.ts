import "../support/env";
import { test, expect } from "@playwright/test";
import { MOCK_PAYSTACK_SECRET, PaymentsNotConfiguredError, getPaystackGateway, resolvePaystackMode } from "@/lib/finance/paystack";

// What payment mode a server is in is ONE pure function of its environment (ported from Octalve Edu's paystack-mode.spec.ts). The public mock secret must never
// be reachable in a real deployment: until 2026-10-19 AlEemaan's webhook fell back to the string "mock_secret" whenever the key was unset, in any environment.

const prod = { APP_ENV: "production" } as const;

test.describe("resolvePaystackMode", () => {
  test("production with a key is real", () => {
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({ kind: "real", secret: "sk_live_x" });
  });

  test("production without a key is not configured, never the mock", () => {
    expect(resolvePaystackMode({ ...prod })).toEqual({ kind: "not-configured" });
    expect(resolvePaystackMode({ ...prod, FORCE_MOCK_PAYSTACK: "true" })).toEqual({ kind: "not-configured" });
  });

  test("production with FORCE_MOCK_PAYSTACK alone is refused, even with a key", () => {
    expect(resolvePaystackMode({ ...prod, FORCE_MOCK_PAYSTACK: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({
      kind: "mock-refused",
    });
  });

  test("production with both switches (the test harness) is mock, signing with the key it was given; the second switch alone changes nothing", () => {
    expect(
      resolvePaystackMode({
        ...prod,
        FORCE_MOCK_PAYSTACK: "true",
        ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true",
        PAYSTACK_SECRET_KEY: "sk_test_k",
      }),
    ).toEqual({ kind: "mock", secret: "sk_test_k" });
    expect(resolvePaystackMode({ ...prod, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({
      kind: "real",
      secret: "sk_live_x",
    });
  });

  test("a mistyped or unknown APP_ENV means production (fail closed)", () => {
    for (const APP_ENV of ["prodction", "prod", "live", "Production ", "1", "dev"]) {
      const mode = resolvePaystackMode({ APP_ENV });
      expect(mode.kind, APP_ENV).not.toBe("mock");
    }
    expect(resolvePaystackMode({ APP_ENV: "prodction" })).toEqual({ kind: "not-configured" });
  });

  test("VERCEL_ENV=production always wins, whatever APP_ENV says", () => {
    expect(resolvePaystackMode({ APP_ENV: "development", VERCEL_ENV: "production" })).toEqual({ kind: "not-configured" });
  });

  test("with no APP_ENV, NODE_ENV=production means production and anything else means development", () => {
    expect(resolvePaystackMode({ NODE_ENV: "production" })).toEqual({ kind: "not-configured" });
    expect(resolvePaystackMode({ NODE_ENV: "development" })).toEqual({ kind: "mock", secret: MOCK_PAYSTACK_SECRET });
    expect(resolvePaystackMode({})).toEqual({ kind: "mock", secret: MOCK_PAYSTACK_SECRET });
  });

  test("development and staging: no key means mock with the one public mock secret; a key means real; FORCE_MOCK_PAYSTACK forces mock", () => {
    for (const APP_ENV of ["development", "staging"]) {
      expect(resolvePaystackMode({ APP_ENV })).toEqual({ kind: "mock", secret: MOCK_PAYSTACK_SECRET });
      expect(resolvePaystackMode({ APP_ENV, PAYSTACK_SECRET_KEY: "sk_test_k" })).toEqual({ kind: "real", secret: "sk_test_k" });
      expect(resolvePaystackMode({ APP_ENV, PAYSTACK_SECRET_KEY: "sk_test_k", FORCE_MOCK_PAYSTACK: "true" })).toEqual({
        kind: "mock",
        secret: "sk_test_k",
      });
    }
  });

  test("a blank or whitespace key counts as no key; the key is used trimmed", () => {
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "   " })).toEqual({ kind: "not-configured" });
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "" })).toEqual({ kind: "not-configured" });
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "  sk_live_x\n" })).toEqual({ kind: "real", secret: "sk_live_x" });
  });

  test("only the exact string 'true' switches the mock on (not 'TRUE', '1', 'yes')", () => {
    for (const FORCE_MOCK_PAYSTACK of ["TRUE", "True", "1", "yes", " true", "true "]) {
      expect(
        resolvePaystackMode({ ...prod, FORCE_MOCK_PAYSTACK, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })
          .kind,
        FORCE_MOCK_PAYSTACK,
      ).toBe("real");
    }
  });

  test("the retired USE_MOCK_PAYSTACK switch does nothing", () => {
    expect(resolvePaystackMode({ ...prod, USE_MOCK_PAYSTACK: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({
      kind: "real",
      secret: "sk_live_x",
    });
    expect(resolvePaystackMode({ ...prod, USE_MOCK_PAYSTACK: "true" })).toEqual({ kind: "not-configured" });
  });
});

test.describe("getPaystackGateway never falls back to the mock where the mode says not to", () => {
  const keep = { ...process.env };
  test.afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in keep)) delete process.env[key];
    Object.assign(process.env, keep);
  });

  test("production, no key: throws PAYSTACK_NOT_CONFIGURED", () => {
    process.env.APP_ENV = "production";
    process.env.PAYSTACK_SECRET_KEY = "";
    process.env.FORCE_MOCK_PAYSTACK = "";
    process.env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = "";
    expect(() => getPaystackGateway()).toThrow(PaymentsNotConfiguredError);
    try {
      getPaystackGateway();
    } catch (error) {
      expect((error as PaymentsNotConfiguredError).code).toBe("PAYSTACK_NOT_CONFIGURED");
    }
  });

  test("production, mock forced without the second switch: throws MOCK_PAYMENTS_NOT_ALLOWED", () => {
    process.env.APP_ENV = "production";
    process.env.PAYSTACK_SECRET_KEY = "sk_live_x";
    process.env.FORCE_MOCK_PAYSTACK = "true";
    process.env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = "";
    try {
      getPaystackGateway();
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as PaymentsNotConfiguredError).code).toBe("MOCK_PAYMENTS_NOT_ALLOWED");
    }
  });

  test("development, no key: the mock; production with a key: a real gateway", () => {
    process.env.APP_ENV = "development";
    process.env.PAYSTACK_SECRET_KEY = "";
    process.env.FORCE_MOCK_PAYSTACK = "";
    expect(getPaystackGateway().constructor.name).toBe("MockPaystackGateway");
    process.env.APP_ENV = "production";
    process.env.PAYSTACK_SECRET_KEY = "sk_live_x";
    expect(getPaystackGateway().constructor.name).toBe("RealPaystackGateway");
  });
});
