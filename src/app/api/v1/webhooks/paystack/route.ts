import { NextRequest, NextResponse } from "next/server";
import { processPaystackWebhook, FinanceError } from "@/lib/finance/service";

/**
 * POST /api/v1/webhooks/paystack
 * Public endpoint receiving raw event deliveries from Paystack.
 * Signature is validated against exact raw buffer bytes.
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-paystack-signature");
    const arrayBuf = await req.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuf);

    const result = await processPaystackWebhook(rawBuffer, signature);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof FinanceError && error.code === "INVALID_SIGNATURE") {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    console.error("[PAYSTACK_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
