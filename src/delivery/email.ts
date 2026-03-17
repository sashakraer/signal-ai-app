// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  /** Optional tracking pixel ID for open tracking */
  trackingId?: string;
}

export interface EmailSendResult {
  messageId: string;
  status: "sent" | "queued" | "failed";
  error?: string;
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send a signal notification via email.
 * Uses a transactional email provider (e.g., Resend, SendGrid, SES).
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  // TODO: Integrate with email provider
  // 1. Build email payload
  // 2. Insert tracking pixel if trackingId provided
  // 3. Send via provider API
  // 4. Return result with provider messageId

  throw new Error("Not implemented");
}

/**
 * Format a signal into an email-ready HTML body.
 */
export function formatSignalEmail(
  title: string,
  body: string,
  recommendation: string | null,
  severity: string,
  customerName: string
): { subject: string; htmlBody: string; textBody: string } {
  // TODO: Build branded HTML template with:
  // - Signal title as heading
  // - Severity indicator (color-coded)
  // - Customer name
  // - Signal body content
  // - Recommendation callout box
  // - Feedback buttons (helpful / not helpful)

  const subject = `[Signal] ${title} — ${customerName}`;

  const htmlBody = `
    <!-- TODO: Replace with branded HTML template -->
    <h2>${title}</h2>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Severity:</strong> ${severity}</p>
    <div>${body}</div>
    ${recommendation ? `<div><strong>Recommendation:</strong> ${recommendation}</div>` : ""}
  `.trim();

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
