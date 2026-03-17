import { sendSignalNotification, type WhatsAppConfig, type WhatsAppSendResult } from "@/adapters/whatsapp/sender";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppDeliveryOptions {
  phone: string;
  title: string;
  body: string;
  severity: string;
  customerName: string;
  waConfig: WhatsAppConfig;
}

export interface WhatsAppDeliveryResult {
  messageId: string | null;
  status: "sent" | "failed";
  error?: string;
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Deliver a signal notification via WhatsApp.
 * Formats the signal into a concise WhatsApp-friendly message.
 */
export async function deliverViaWhatsApp(
  options: WhatsAppDeliveryOptions
): Promise<WhatsAppDeliveryResult> {
  const { phone, title, body, severity, customerName, waConfig } = options;

  // TODO: Format signal for WhatsApp (shorter than email, no HTML)
  const formattedBody = formatWhatsAppMessage(title, body, severity, customerName);

  try {
    const result = await sendSignalNotification(phone, title, formattedBody, waConfig);
    return {
      messageId: result.messageId,
      status: result.status,
      error: result.error,
    };
  } catch (err) {
    return {
      messageId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Format a signal into a WhatsApp-friendly plain text message.
 * WhatsApp has a 4096 character limit; signals should be concise.
 */
export function formatWhatsAppMessage(
  title: string,
  body: string,
  severity: string,
  customerName: string
): string {
  // TODO: Add emoji indicators for severity
  // TODO: Truncate body if exceeding WhatsApp limits
  const severityIcon =
    severity === "critical" ? "[!!!]" :
    severity === "high" ? "[!!]" :
    severity === "medium" ? "[!]" : "";

  return [
    `${severityIcon} *${title}*`,
    `_${customerName}_`,
    "",
    body,
  ].join("\n").slice(0, 4096);
}
