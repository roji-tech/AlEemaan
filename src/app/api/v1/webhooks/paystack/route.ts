import { NextRequest, NextResponse } from "next/server";
import { processPaystackWebhook } from "@/lib/finance/service";
import { resolvePaystackMode } from "@/lib/finance/paystack";
import { CLOSE_AFTER_RESPONSE } from "@/lib/api/envelope";

// POST /api/v1/webhooks/paystack
// Public webhook endpoint for Paystack payment notifications (ported from Octalve Edu's hardened route; Octalve's design is canonical for shared parts).
//   401  unsigned or wrongly signed: nothing is written
//   503  payments not configured on this server, or a TRANSIENT failure (database, network): the provider retries, and a retry takes the idempotent path
//   413  body larger than the cap
//   200  processed, ignored, a duplicate, or a deliberate refusal (amount mismatch...) that retrying cannot change
// Until 2026-10-19 this answered 400 for a bad signature after writing to the ledger, verified with `PAYSTACK_SECRET_KEY || "mock_secret"` and answered every
// unforeseen failure 500; see processPaystackWebhook.
const MAX_BODY_BYTES = 256 * 1024;

/// The body as raw bytes (the signature is over the exact bytes), or null when it is larger than the cap. It reads the stream and stops at the cap, so a body
/// with no Content-Length, or a lying one, cannot make the server buffer all of it.
async function readCapped(req: NextRequest, max: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const mode = resolvePaystackMode();
  if (mode.kind === "not-configured" || mode.kind === "mock-refused") {
    return NextResponse.json({ received: false, error: "Payments are not configured." }, { status: 503 });
  }

  const rawBody = await readCapped(req, MAX_BODY_BYTES);
  if (!rawBody) {
    return NextResponse.json({ received: false, error: "Payload too large." }, { status: 413, headers: CLOSE_AFTER_RESPONSE });
  }

  try {
    const result = await processPaystackWebhook(rawBody, req.headers.get("x-paystack-signature"), mode.secret);
    switch (result.status) {
      case "invalid_signature":
        return NextResponse.json({ received: false, status: "invalid_signature" }, { status: 401 });
      case "retry":
        return NextResponse.json({ received: false, status: "retry" }, { status: 503 });
      case "refused":
        return NextResponse.json({ received: true, status: "refused", eventId: result.eventId, error: result.error });
      default:
        return NextResponse.json({
          received: true,
          status: result.status,
          eventId: result.eventId,
          ...("duplicate" in result && result.duplicate ? { duplicate: true } : {}),
        });
    }
  } catch (err: unknown) {
    // Anything unforeseen is transient from the provider's point of view: log it here, say nothing about it, ask for a retry.
    console.error("[PAYSTACK_WEBHOOK_ERROR]", err);
    return NextResponse.json({ received: false, status: "retry" }, { status: 503 });
  }
}
