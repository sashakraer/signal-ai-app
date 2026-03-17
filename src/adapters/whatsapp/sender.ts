import { config } from "@/config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  phoneNumberId: string;
  apiKey: string;
  businessAccountId: string;
}

export interface WhatsAppMessage {
  to: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  text?: string;
  /** Optional header image URL */
  headerImageUrl?: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: "sent" | "failed";
  error?: string;
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp message using the Cloud API.
 * Supports both template messages and free-form text.
 */
export async function sendMessage(
  message: WhatsAppMessage,
  waConfig: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  // TODO: POST to https://graph.facebook.com/v18.0/{phoneNumberId}/messages
  // Headers: Authorization: Bearer {apiKey}
  // Body varies by template vs text message
  // Handle rate limiting and retries

  throw new Error("Not implemented");
}

/**
 * Send a signal notification via WhatsApp.
 * Formats the signal content into a WhatsApp-friendly template.
 */
export async function sendSignalNotification(
  phone: string,
  title: string,
  body: string,
  waConfig: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  // TODO: Format signal into WhatsApp template
  // Use the "signal_notification" template with title and body params
  return sendMessage(
    {
      to: phone,
      templateName: "signal_notification",
      templateParams: { title, body },
    },
    waConfig
  );
}

/**
 * Verify webhook signature from WhatsApp Cloud API.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  // TODO: HMAC-SHA256 verification
  throw new Error("Not implemented");
}
