import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { Prisma, InvoiceStatus, PaymentProvider } from "@prisma/client";
import {
  toKobo,
  toNairaDecimal,
  formatNaira,
  resolveInvoiceStatus,
  generateInvoiceNumber,
  generateReceiptNumber,
  generatePaymentReference,
  computeInvoiceBreakdown,
} from "@/lib/finance/rules";
import { verifyPaystackSignature, computePayloadHash } from "@/lib/finance/crypto";

test.describe("Finance Rules — Currency Conversion & Formatting", () => {
  test("converts Naira to Kobo accurately", () => {
    expect(toKobo(100)).toBe(10000);
    expect(toKobo("250.50")).toBe(25050);
    expect(toKobo(new Prisma.Decimal("125000.75"))).toBe(12500075);
    expect(toKobo(0)).toBe(0);
  });

  test("converts Kobo to Decimal Naira accurately", () => {
    const d1 = toNairaDecimal(10000);
    expect(d1.toNumber()).toBe(100);
    const d2 = toNairaDecimal(25050);
    expect(d2.toNumber()).toBe(250.5);
    const d3 = toNairaDecimal(0);
    expect(d3.toNumber()).toBe(0);
  });

  test("rejects negative amounts in toKobo and toNairaDecimal", () => {
    expect(() => toKobo(-50)).toThrow("Amount in Naira cannot be negative");
    expect(() => toNairaDecimal(-100)).toThrow("Kobo amount must be a non-negative integer");
  });

  test("formats Naira currency correctly with thousand separators", () => {
    const formatted = formatNaira(150000);
    expect(formatted).toContain("150,000");
  });
});

test.describe("Finance Rules — Invoice Status Resolution", () => {
  test("resolves UNPAID when 0 paid", () => {
    expect(resolveInvoiceStatus(50000, 0)).toBe(InvoiceStatus.UNPAID);
  });

  test("resolves PARTIALLY_PAID when paid is between 0 and total due", () => {
    expect(resolveInvoiceStatus(50000, 20000)).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  test("resolves PAID when paid equals or exceeds total due", () => {
    expect(resolveInvoiceStatus(50000, 50000)).toBe(InvoiceStatus.PAID);
    expect(resolveInvoiceStatus(50000, 55000)).toBe(InvoiceStatus.PAID);
  });

  test("resolves WAIVED or CANCELLED when options are flagged", () => {
    expect(resolveInvoiceStatus(50000, 0, { isWaived: true })).toBe(InvoiceStatus.WAIVED);
    expect(resolveInvoiceStatus(50000, 0, { isCancelled: true })).toBe(InvoiceStatus.CANCELLED);
  });
});

test.describe("Finance Rules — Breakdown & Reference Formatting", () => {
  test("computes gross, discounts, and net breakdown correctly", () => {
    const items = [
      { amount: 50000 },
      { amount: 15000 },
      { amount: 5000 },
    ];
    const discounts = [
      { amount: 10000 },
    ];

    const result = computeInvoiceBreakdown(items, discounts);
    expect(result.grossAmount.toNumber()).toBe(70000);
    expect(result.totalDiscount.toNumber()).toBe(10000);
    expect(result.netAmount.toNumber()).toBe(60000);
  });

  test("throws when discount exceeds gross amount", () => {
    const items = [{ amount: 20000 }];
    const discounts = [{ amount: 25000 }];
    expect(() => computeInvoiceBreakdown(items, discounts)).toThrow("Total discounts cannot exceed the gross invoice amount");
  });

  test("generates formatted invoice and receipt numbers", () => {
    expect(generateInvoiceNumber("SEC", 2026, 1)).toBe("INV-SEC-2026-0001");
    expect(generateInvoiceNumber("pri-main", 2026, 42)).toBe("INV-PRIMAI-2026-0042");
    expect(generateReceiptNumber("SEC", 2026, 9)).toBe("RCP-SEC-2026-0009");
  });

  test("generates payment reference with proper prefix", () => {
    const payRef = generatePaymentReference(PaymentProvider.PAYSTACK);
    expect(payRef.startsWith("alm_pay_")).toBe(true);
    const manRef = generatePaymentReference(PaymentProvider.MANUAL);
    expect(manRef.startsWith("alm_man_")).toBe(true);
  });
});

test.describe("Finance Rules — Crypto & Webhook Signatures", () => {
  const secretKey = "sk_test_secret_key_12345";
  const rawPayload = JSON.stringify({ event: "charge.success", data: { reference: "alm_pay_123", amount: 5000000 } });

  test("verifies valid HMAC-SHA512 webhook signature", () => {
    const hmac = crypto.createHmac("sha512", secretKey);
    hmac.update(rawPayload);
    const validSignature = hmac.digest("hex");

    expect(verifyPaystackSignature(rawPayload, validSignature, secretKey)).toBe(true);
  });

  test("rejects invalid signature or wrong secret key", () => {
    const hmac = crypto.createHmac("sha512", "wrong_key");
    hmac.update(rawPayload);
    const wrongSignature = hmac.digest("hex");

    expect(verifyPaystackSignature(rawPayload, wrongSignature, secretKey)).toBe(false);
  });

  test("rejects tampered raw payload", () => {
    const hmac = crypto.createHmac("sha512", secretKey);
    hmac.update(rawPayload);
    const signature = hmac.digest("hex");

    const tamperedPayload = JSON.stringify({ event: "charge.success", data: { reference: "alm_pay_123", amount: 100 } });
    expect(verifyPaystackSignature(tamperedPayload, signature, secretKey)).toBe(false);
  });

  test("rejects missing or empty signature", () => {
    expect(verifyPaystackSignature(rawPayload, null, secretKey)).toBe(false);
    expect(verifyPaystackSignature(rawPayload, "", secretKey)).toBe(false);
    expect(verifyPaystackSignature(rawPayload, "   ", secretKey)).toBe(false);
  });

  test("computes deterministic SHA-256 hash of raw payload", () => {
    const hash1 = computePayloadHash(rawPayload);
    const hash2 = computePayloadHash(rawPayload);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});
