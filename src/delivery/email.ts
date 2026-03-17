import { graphPost, type MsGraphCredentials } from "../adapters/microsoft/client.js";
import { logger } from "../lib/logger.js";
import { generate360Url } from "../api/view360-token.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  /** MS Graph sender user ID (shared mailbox or user) */
  senderUserId: string;
}

export interface EmailSendResult {
  messageId: string | null;
  status: "sent" | "failed";
  error?: string;
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send an email via Microsoft Graph sendMail API.
 */
export async function sendEmail(
  message: EmailMessage,
  credentials: MsGraphCredentials
): Promise<EmailSendResult> {
  try {
    await graphPost(
      `/users/${message.senderUserId}/sendMail`,
      {
        message: {
          subject: message.subject,
          body: {
            contentType: "HTML",
            content: message.htmlBody,
          },
          toRecipients: [{ emailAddress: { address: message.to } }],
          ...(message.replyTo
            ? { replyTo: [{ emailAddress: { address: message.replyTo } }] }
            : {}),
        },
        saveToSentItems: false,
      },
      credentials
    );

    logger.info({ to: message.to, subject: message.subject }, "Email sent via Graph");
    return { messageId: null, status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ to: message.to, error: msg }, "Email send failed");
    return { messageId: null, status: "failed", error: msg };
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#2563EB",
  low: "#6B7280",
};

/**
 * Format a signal into an email-ready HTML body.
 */
export function formatSignalEmail(
  title: string,
  body: string,
  recommendation: string | null,
  severity: string,
  customerName: string,
  options?: { tenantId?: string; customerId?: string; signalId?: string }
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[Signal] ${title} — ${customerName}`;
  const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="border-left: 4px solid ${color}; padding: 12px 16px; margin-bottom: 16px;">
    <h2 style="margin: 0 0 4px 0; font-size: 18px;">${escapeHtml(title)}</h2>
    <span style="color: ${color}; font-size: 12px; text-transform: uppercase; font-weight: 600;">${escapeHtml(severity)}</span>
    <span style="color: #6B7280; font-size: 12px; margin-left: 8px;">${escapeHtml(customerName)}</span>
  </div>
  <div style="padding: 0 16px; line-height: 1.6; color: #374151;">
    ${escapeHtml(body).replace(/\n/g, "<br>")}
  </div>
  ${recommendation ? `
  <div style="margin: 16px; padding: 12px; background: #F3F4F6; border-radius: 6px;">
    <strong style="font-size: 13px;">Recommendation:</strong>
    <p style="margin: 4px 0 0 0;">${escapeHtml(recommendation)}</p>
  </div>` : ""}
  ${options?.tenantId && options?.customerId ? `
  <div style="margin: 16px; text-align: center;">
    <a href="${generate360Url(options.tenantId, options.customerId, options.signalId)}" style="display:inline-block;padding:10px 24px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Full 360</a>
  </div>` : ""}
  <div style="margin-top: 24px; padding: 12px 16px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF;">
    Signal AI — Reply 1 (useful) or 2 (not relevant) to give feedback
  </div>
</div>`.trim();

  const textBody = [
    title,
    `Customer: ${customerName}`,
    `Severity: ${severity}`,
    "",
    body,
    recommendation ? `\nRecommendation: ${recommendation}` : "",
  ].join("\n");

  return { subject, htmlBody, textBody };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
