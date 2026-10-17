import crypto from "node:crypto";

export interface TermiiSendParams {
  to: string; // Recipient phone number
  message: string;
  channel?: "generic" | "dnd" | "whatsapp";
  mediaUrl?: string;
  caption?: string;
}

export interface TermiiSendResult {
  success: boolean;
  messageId?: string;
  balance?: number;
  error?: string;
}

/**
 * Normalizes a phone number to Nigerian MSISDN format without the leading '+'.
 * E.g., '08012345678' -> '2348012345678'
 *       '+2348012345678' -> '2348012345678'
 *       '2348012345678' -> '2348012345678'
 */
export function normalizeNigerianPhoneNumber(input: string): string {
  const cleaned = input.trim().replace(/[\s\-\(\)]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned.slice(1);
  }

  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "234" + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Validates if the phone number is a valid MSISDN (Nigerian standard or international).
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizeNigerianPhoneNumber(phone);
  // Nigerian format: 234 + 10 digits starting with 7, 8, or 9
  const nigerianRegex = /^234[789][01]\d{8}$/;
  // General E.164 without plus: 8 to 15 digits
  const generalRegex = /^\d{8,15}$/;

  return nigerianRegex.test(normalized) || generalRegex.test(normalized);
}

// In-memory mock storage for development & testing inspection
export interface MockTermiiMessage {
  id: string;
  to: string;
  from: string;
  message: string;
  channel: string;
  sentAt: string;
}

const mockTermiiStore: MockTermiiMessage[] = [];

export function getMockTermiiMessages(): MockTermiiMessage[] {
  return [...mockTermiiStore];
}

export function clearMockTermiiMessages(): void {
  mockTermiiStore.length = 0;
}

/**
 * Dispatches an SMS or WhatsApp message via Termii API or mock fallback.
 */
export async function sendTermiiMessage(params: TermiiSendParams): Promise<TermiiSendResult> {
  const { to, message, channel = "generic" } = params;

  if (!isValidPhoneNumber(to)) {
    return {
      success: false,
      error: `Invalid phone number format: ${to}`,
    };
  }

  const normalizedTo = normalizeNigerianPhoneNumber(to);
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID || "ALEEMAAN";

  // Use mock fallback in test or if API key is not configured
  if (!apiKey || process.env.NODE_ENV === "test") {
    const mockId = `termii-mock-${crypto.randomUUID()}`;
    mockTermiiStore.push({
      id: mockId,
      to: normalizedTo,
      from: senderId,
      message,
      channel,
      sentAt: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: mockId,
    };
  }

  try {
    const endpoint =
      channel === "whatsapp"
        ? "https://api.ng.termii.com/api/sms/otp/send" // or whatsapp endpoint
        : "https://api.ng.termii.com/api/sms/send";

    const payload = {
      to: normalizedTo,
      from: senderId,
      sms: message,
      type: "plain",
      channel,
      api_key: apiKey,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        success: false,
        error: `Termii API error (${res.status}): ${errBody}`,
      };
    }

    const data = (await res.json()) as { message_id?: string; message?: string; balance?: number };
    return {
      success: true,
      messageId: data.message_id || `termii-${Date.now()}`,
      balance: data.balance,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Termii dispatch failed: ${msg}`,
    };
  }
}
