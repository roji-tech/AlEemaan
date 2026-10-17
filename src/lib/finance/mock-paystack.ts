import crypto from "node:crypto";
import type { InitializePaymentParams, InitializePaymentResult, VerifyTransactionResult, PaystackGateway } from "./paystack-types";

interface MockTransactionRecord {
  reference: string;
  email: string;
  amountInKobo: number;
  status: "success" | "failed" | "abandoned";
  paidAt?: Date;
  channel: string;
  createdAt: Date;
}

/**
 * In-memory deterministic Paystack simulator for development and automated test suites.
 */
export class MockPaystackGateway implements PaystackGateway {
  private transactions = new Map<string, MockTransactionRecord>();

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    if (params.amountInKobo <= 0) {
      throw new Error("Amount must be positive in kobo");
    }

    const accessCode = `mock_acc_${crypto.randomBytes(8).toString("hex")}`;
    const authorizationUrl = `http://localhost:3000/checkout/mock/${params.reference}`;

    this.transactions.set(params.reference, {
      reference: params.reference,
      email: params.email,
      amountInKobo: params.amountInKobo,
      status: "abandoned", // Initially abandoned until completed
      channel: "mock_card",
      createdAt: new Date(),
    });

    return {
      authorizationUrl,
      accessCode,
      reference: params.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const record = this.transactions.get(reference);
    if (!record) {
      return {
        status: "failed",
        reference,
        amountInKobo: 0,
        currency: "NGN",
        gatewayResponse: "Transaction reference not found",
      };
    }

    return {
      status: record.status,
      reference: record.reference,
      amountInKobo: record.amountInKobo,
      paidAt: record.paidAt,
      channel: record.channel,
      currency: "NGN",
      gatewayResponse: record.status === "success" ? "Successful" : "Pending or Failed",
    };
  }

  // --- Test & Simulator Helpers ---

  /**
   * Simulates a successful or failed card/bank charge on Paystack checkout.
   */
  simulatePaymentCompletion(reference: string, status: "success" | "failed" = "success", amountInKobo?: number): void {
    const record = this.transactions.get(reference);
    if (!record) {
      this.transactions.set(reference, {
        reference,
        email: "test@aleemaan.internal",
        amountInKobo: amountInKobo ?? 100000,
        status,
        paidAt: new Date(),
        channel: "card",
        createdAt: new Date(),
      });
      return;
    }

    record.status = status;
    if (amountInKobo !== undefined) {
      record.amountInKobo = amountInKobo;
    }
    record.paidAt = status === "success" ? new Date() : undefined;
  }

  /**
   * Generates a signed Paystack charge.success webhook payload and header.
   */
  generateWebhookPayload(
    reference: string,
    secretKey: string,
    amountInKobo?: number,
    email?: string,
  ): { rawBody: string; signature: string } {
    const record = this.transactions.get(reference);
    const resolvedAmount = amountInKobo ?? (record ? record.amountInKobo : 100000);
    const resolvedEmail = email ?? (record ? record.email : "payer@test.local");

    const payloadObj = {
      event: "charge.success",
      data: {
        id: Math.floor(Math.random() * 10000000),
        domain: "test",
        status: "success",
        reference,
        amount: resolvedAmount,
        gateway_response: "Successful",
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        channel: "card",
        currency: "NGN",
        ip_address: "127.0.0.1",
        customer: {
          id: 12345,
          first_name: "Amina",
          last_name: "Bello",
          email: resolvedEmail,
          customer_code: "CUS_test123",
        },
      },
    };

    const rawBody = JSON.stringify(payloadObj);
    const hmac = crypto.createHmac("sha512", secretKey);
    hmac.update(Buffer.from(rawBody, "utf8"));
    const signature = hmac.digest("hex");

    return { rawBody, signature };
  }

  reset(): void {
    this.transactions.clear();
  }
}

export const mockPaystack = new MockPaystackGateway();
