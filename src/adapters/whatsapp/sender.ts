import { createHmac } from "node:crypto";
import { logger } from "../../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret?: string;
}

export interface WhatsAppSendResult {
  messageId: string | null;
  status: "sent" | "failed";
  error?: string;
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp text message via the Cloud API.
 */
export async function sendMessage(
  to: string,
  text: string,
  waConfig: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const log = logger.child({ to });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${waConfig.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waConfig.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      log.error({ status: response.status, errorBody }, "WhatsApp send failed");
      return { messageId: null, status: "failed", error: errorBody };
    }

    const result = (await response.json()) as { messages?: Array<{ id: string }> };
    const messageId = result.messages?.[0]?.id ?? null;

    log.info({ messageId }, "WhatsApp message sent");
    return { messageId, status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: msg }, "WhatsApp send error");
    return { messageId: null, status: "failed", error: msg };
  }
}

/**
 * Send a signal notification via WhatsApp.
 */
export async function sendSignalNotification(
  phone: string,
  title: string,
  body: string,
  waConfig: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  return sendMessage(phone, body, waConfig);
}

/**
 * Verify webhook signature from WhatsApp Cloud API.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const expected = createHmac("sha256", appSecret).update(payload).digest("hex");
  return `sha256=${expected}` === signature;
}
