import crypto from "node:crypto";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BatchEmailItem {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface MockEmailMessage {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  html?: string;
  sentAt: string;
}

const mockEmailStore: MockEmailMessage[] = [];

export function getMockEmails(): MockEmailMessage[] {
  return [...mockEmailStore];
}

export function clearMockEmails(): void {
  mockEmailStore.length = 0;
}

/**
 * Validates an email address format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Sends an email via Resend API or dev/mock inbox.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const validRecipients = recipients.filter(isValidEmail);

  if (validRecipients.length === 0) {
    return {
      success: false,
      error: `Invalid email address: ${recipients.join(", ")}`,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM || "Al-Eemaan School <notifications@aleemaan.sch.ng>";
  const from = params.from || defaultFrom;

  // Mock / Test mode fallback
  if (!apiKey || process.env.NODE_ENV === "test") {
    const mockId = `resend-mock-${crypto.randomUUID()}`;
    for (const to of validRecipients) {
      mockEmailStore.push({
        id: mockId,
        to,
        from,
        subject: params.subject,
        body: params.body,
        html: params.html,
        sentAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      messageId: mockId,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: validRecipients,
        subject: params.subject,
        text: params.body,
        html: params.html || params.body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Resend API error (${res.status}): ${errText}`,
      };
    }

    const data = (await res.json()) as { id?: string };
    return {
      success: true,
      messageId: data.id || `resend-${Date.now()}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Email dispatch failed: ${msg}`,
    };
  }
}

/**
 * Sends a batch of individual personalized emails.
 */
export async function sendBatchEmails(items: BatchEmailItem[]): Promise<SendEmailResult[]> {
  const results: SendEmailResult[] = [];
  for (const item of items) {
    const res = await sendEmail(item);
    results.push(res);
  }
  return results;
}
