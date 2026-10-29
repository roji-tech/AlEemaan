import "../support/env";
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { db } from "../support/db";
import { POST } from "@/app/api/v1/webhooks/paystack/route";

// A server that has no Paystack key must not accept webhooks, and must not fall back to a public secret: until 2026-10-19 the route verified with
// `PAYSTACK_SECRET_KEY || "mock_secret"` in every environment. The route handler is called in-process so the environment can be changed per test.

const KEYS = [
  "APP_ENV",
  "PAYSTACK_SECRET_KEY",
  "FORCE_MOCK_PAYSTACK",
  "ALLOW_MOCK_PAYMENTS_IN_PRODUCTION",
  "NODE_ENV",
  "VERCEL_ENV",
] as const;
const saved: Record<string, string | undefined> = {};
test.beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
});
test.afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string | undefined>)[key] = saved[key];
  }
});

const request = (raw: string, signature = "0".repeat(128)) =>
  new NextRequest("http://localhost/api/v1/webhooks/paystack", {
    method: "POST",
    body: raw,
    headers: { "x-paystack-signature": signature },
  });

test.describe("a server without payments configured", () => {
  for (const [name, env] of [
    ["production, no key", { APP_ENV: "production", PAYSTACK_SECRET_KEY: "" }],
    ["production, a blank key", { APP_ENV: "production", PAYSTACK_SECRET_KEY: "   " }],
    [
      "production, no key, the mock forced and allowed",
      { APP_ENV: "production", PAYSTACK_SECRET_KEY: "", FORCE_MOCK_PAYSTACK: "true", ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true" },
    ],
    [
      "production, a key, the mock forced WITHOUT the second switch",
      { APP_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_x", FORCE_MOCK_PAYSTACK: "true", ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "" },
    ],
    ["a mistyped APP_ENV, no key", { APP_ENV: "prodction", PAYSTACK_SECRET_KEY: "" }],
    [
      "VERCEL_ENV=production over APP_ENV=development, no key",
      { APP_ENV: "development", VERCEL_ENV: "production", PAYSTACK_SECRET_KEY: "" },
    ],
  ] as const) {
    test(`${name}: 503, even for a body signed with 'mock_secret', and nothing is written`, async () => {
      Object.assign(process.env, { FORCE_MOCK_PAYSTACK: "", ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "", VERCEL_ENV: "", ...env });
      const raw = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "x", amount: 100 } });
      const { createHmac } = await import("node:crypto");
      const before = await db.paymentWebhookEvent.count();
      for (const signature of ["0".repeat(128), createHmac("sha512", "mock_secret").update(raw).digest("hex")]) {
        const res = await POST(request(raw, signature));
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ received: false });
      }
      expect(await db.paymentWebhookEvent.count()).toBe(before);
    });
  }
});
