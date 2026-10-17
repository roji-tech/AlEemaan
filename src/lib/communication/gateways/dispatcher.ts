import { NotificationChannel } from "@prisma/client";
import { sendEmail } from "./email";
import { sendTermiiMessage } from "./termii";

export interface NotificationDispatchPayload {
  dispatchId: string;
  branchId: string;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  subject?: string | null;
  body: string;
}

export interface DispatchHandlerResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

/**
 * Universal multi-channel message dispatcher.
 * Dispatches to Resend, Termii, or internal In-App mechanisms based on payload.channel.
 */
export async function defaultNotificationDispatcher(payload: NotificationDispatchPayload): Promise<DispatchHandlerResult> {
  const { channel, recipientAddress, subject, body, dispatchId } = payload;

  switch (channel) {
    case NotificationChannel.EMAIL: {
      const emailRes = await sendEmail({
        to: recipientAddress,
        subject: subject || "Notification from Al-Eemaan School",
        body,
      });

      return {
        success: emailRes.success,
        externalId: emailRes.messageId,
        error: emailRes.error,
      };
    }

    case NotificationChannel.SMS: {
      const termiiRes = await sendTermiiMessage({
        to: recipientAddress,
        message: body,
        channel: "generic",
      });

      return {
        success: termiiRes.success,
        externalId: termiiRes.messageId,
        error: termiiRes.error,
      };
    }

    case NotificationChannel.WHATSAPP: {
      const whatsappRes = await sendTermiiMessage({
        to: recipientAddress,
        message: body,
        channel: "whatsapp",
      });

      return {
        success: whatsappRes.success,
        externalId: whatsappRes.messageId,
        error: whatsappRes.error,
      };
    }

    case NotificationChannel.IN_APP: {
      // In-App dispatches are immediately ready in the user's notification feed
      return {
        success: true,
        externalId: `inapp-${dispatchId}`,
      };
    }

    default: {
      return {
        success: false,
        error: `Unsupported notification channel: ${channel}`,
      };
    }
  }
}
