import type { InitializePaymentParams, InitializePaymentResult, VerifyTransactionResult, PaystackGateway } from "./paystack-types";
import { appEnv } from "@/lib/dev-tools";
import { mockPaystack } from "./mock-paystack";

export * from "./paystack-types";
export { MockPaystackGateway, mockPaystack } from "./mock-paystack";

export class RealPaystackGateway implements PaystackGateway {
  private secretKey: string;
  private baseUrl = "https://api.paystack.co";

  constructor(secretKey: string) {
    if (!secretKey) {
      throw new Error("Paystack secret key is required");
    }
    this.secretKey = secretKey;
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        amount: params.amountInKobo,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Paystack initialize failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      status: boolean;
      message: string;
      data: {
        authorization_url: string;
        access_code: string;
        reference: string;
      };
    };

    if (!data.status || !data.data) {
      throw new Error(`Paystack initialization rejected: ${data.message}`);
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Paystack verify failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      status: boolean;
      message: string;
      data: {
        status: string;
        reference: string;
        amount: number;
        paid_at?: string;
        channel?: string;
        currency: string;
        gateway_response?: string;
      };
    };

    if (!data.status || !data.data) {
      return {
        status: "failed",
        reference,
        amountInKobo: 0,
        currency: "NGN",
        gatewayResponse: data.message || "Failed verification",
      };
    }

    const statusMap: Record<string, "success" | "failed" | "abandoned"> = {
      success: "success",
      failed: "failed",
      abandoned: "abandoned",
    };

    const status = statusMap[data.data.status] || "failed";

    return {
      status,
      reference: data.data.reference,
      amountInKobo: data.data.amount,
      paidAt: data.data.paid_at ? new Date(data.data.paid_at) : undefined,
      channel: data.data.channel,
      currency: data.data.currency || "NGN",
      gatewayResponse: data.data.gateway_response,
    };
  }
}

/// The signing/auth secret of the MOCK gateway, and of the webhook when no real key is configured on a development or staging server. Public by design (it is
/// in this file): it must never be reachable in a real deployment; see `resolvePaystackMode`. Until 2026-10-19 the webhook route fell back to the string
/// "mock_secret" whenever PAYSTACK_SECRET_KEY was unset, in ANY environment: anyone who knew a payment reference could sign a `charge.success` with it and mark an
/// invoice paid. Ported from Octalve Edu's `resolvePaystackMode` (Octalve's design is canonical for shared parts).
export const MOCK_PAYSTACK_SECRET = "mock_sk_test_aleemaan_secret";

type Env = Record<string, string | undefined>;

export type PaystackMode =
  { kind: "real"; secret: string } | { kind: "mock"; secret: string } | { kind: "not-configured" } | { kind: "mock-refused" };

/// What payment mode a server is in: ONE pure function of its environment, unit tested over the whole matrix. Fail closed. A production-shaped server
/// (`appEnv()` treats a mistyped APP_ENV as production)
///  - with a key is REAL; with no key is NOT CONFIGURED, never the mock;
///  - with `FORCE_MOCK_PAYSTACK` is refused unless `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true` is ALSO set (only the test harness does that).
/// Development and staging use the mock when there is no key or `FORCE_MOCK_PAYSTACK` is set.
export function resolvePaystackMode(env: Env = process.env): PaystackMode {
  const key = env.PAYSTACK_SECRET_KEY?.trim() || "";
  const forceMock = env.FORCE_MOCK_PAYSTACK === "true";
  if (appEnv(env) === "production") {
    if (!key) return { kind: "not-configured" };
    if (forceMock) return env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION === "true" ? { kind: "mock", secret: key } : { kind: "mock-refused" };
    return { kind: "real", secret: key };
  }
  if (forceMock) return { kind: "mock", secret: key || MOCK_PAYSTACK_SECRET };
  return key ? { kind: "real", secret: key } : { kind: "mock", secret: MOCK_PAYSTACK_SECRET };
}

/// Thrown when online payments cannot be used on this server (no key in production, or the mock forced there). The pay route answers it with a 503.
export class PaymentsNotConfiguredError extends Error {
  readonly code: "PAYSTACK_NOT_CONFIGURED" | "MOCK_PAYMENTS_NOT_ALLOWED";
  constructor(code: "PAYSTACK_NOT_CONFIGURED" | "MOCK_PAYMENTS_NOT_ALLOWED") {
    super(
      code === "MOCK_PAYMENTS_NOT_ALLOWED"
        ? "MOCK_PAYMENTS_NOT_ALLOWED: FORCE_MOCK_PAYSTACK is set in a production environment"
        : "PAYSTACK_NOT_CONFIGURED: the Paystack secret key is missing in a production environment",
    );
    this.name = "PaymentsNotConfiguredError";
    this.code = code;
  }
}

/// The active Paystack gateway for this server. Never falls back to the mock where `resolvePaystackMode` says not to.
export function getPaystackGateway(): PaystackGateway {
  const mode = resolvePaystackMode();
  switch (mode.kind) {
    case "real":
      return new RealPaystackGateway(mode.secret);
    case "mock":
      return mockPaystack;
    case "mock-refused":
      throw new PaymentsNotConfiguredError("MOCK_PAYMENTS_NOT_ALLOWED");
    default:
      throw new PaymentsNotConfiguredError("PAYSTACK_NOT_CONFIGURED");
  }
}
