import { sendSignalNotification, type WhatsAppConfig } from "../adapters/whatsapp/sender.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppDeliveryOptions {
  phone: string;
  title: string;
  body: string;
  severity: string;
  customerName: string;
  waConfig: WhatsAppConfig;
  view360Url?: string;
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
  const { phone, title, body, severity, customerName, waConfig, view360Url } = options;

  const formattedBody = formatWhatsAppMessage(title, body, severity, customerName, view360Url);

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
  customerName: string,
  view360Url?: string
): string {
  const severityIcon =
    severity === "critical" ? "\u{1F534}" :
    severity === "high" ? "\u{1F7E0}" :
    severity === "medium" ? "\u{1F535}" : "\u{26AA}";

  const parts = [
    `${severityIcon} *${title}*`,
    `_${customerName}_`,
    "",
    body,
  ];

  if (view360Url) {
    parts.push("", `\u{1F517} Full 360: ${view360Url}`);
  }

  return parts.join("\n").slice(0, 4096);
}
