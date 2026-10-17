import type {
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyTransactionResult,
  PaystackGateway,
} from "./paystack-types";
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

/**
 * Returns the active Paystack gateway for the current environment.
 * In development or test, returns MockPaystackGateway.
 * In production, returns RealPaystackGateway or throws if keys are unconfigured.
 */
export function getPaystackGateway(): PaystackGateway {
  // If in test mode or explicitly requested, use mock
  if (process.env.USE_MOCK_PAYSTACK === "true" || process.env.NODE_ENV === "test") {
    return mockPaystack;
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (!secretKey) {
    if (isProd) {
      throw new Error("PAYSTACK_NOT_CONFIGURED: Missing PAYSTACK_SECRET_KEY in production");
    }
    return mockPaystack;
  }

  return new RealPaystackGateway(secretKey);
}
