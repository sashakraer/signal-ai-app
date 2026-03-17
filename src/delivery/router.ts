import type { SignalOutput } from "@/agents/types";
import { sendEmail, formatSignalEmail } from "./email";
import { deliverViaWhatsApp } from "./whatsapp";
import {
  RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
} from "@/engine/thresholds";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryResult {
  signalId: string;
  channel: "email" | "whatsapp";
  status: "sent" | "queued" | "rate_limited" | "quiet_hours" | "failed";
  scheduledFor?: Date;
  error?: string;
}

export interface RecipientInfo {
  employeeId: string;
  email: string;
  phone: string | null;
  timezone: string;
  preferredChannel: "email" | "whatsapp";
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Check if a recipient has exceeded their daily signal limit.
 */
export async function checkRateLimit(
  tenantId: string,
  recipientEmployeeId: string
): Promise<{ allowed: boolean; sentToday: number }> {
  // TODO: Query signals table for count of signals sent to this recipient today
  // Return allowed=false if sentToday >= RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY

  throw new Error("Not implemented");
}

// ─── Quiet Hours ────────────────────────────────────────────────────────────

/**
 * Check if the current time falls within delivery quiet hours.
 * Signals should only be delivered between QUIET_HOURS_START and QUIET_HOURS_END.
 *
 * @returns true if delivery is allowed (within business hours)
 */
export function isWithinDeliveryHours(
  now: Date = new Date(),
  timezone: string = "UTC"
): boolean {
  // TODO: Convert `now` to recipient's timezone
  // For now, use simple UTC comparison
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const currentTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

  return currentTime >= QUIET_HOURS_START && currentTime <= QUIET_HOURS_END;
}

/**
 * Calculate the next delivery window if currently in quiet hours.
 */
export function getNextDeliveryWindow(
  now: Date = new Date(),
  timezone: string = "UTC"
): Date {
  // TODO: Properly handle timezone conversion
  const next = new Date(now);
  const [startHour, startMin] = QUIET_HOURS_START.split(":").map(Number);

  if (!isWithinDeliveryHours(now, timezone)) {
    // If after end time, schedule for tomorrow's start
    if (now.getUTCHours() >= 20) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(startHour, startMin, 0, 0);
  }

  return next;
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * Main signal delivery router. Handles rate limiting, quiet hours,
 * channel selection, and actual delivery.
 */
export async function routeSignal(
  signal: SignalOutput,
  recipient: RecipientInfo
): Promise<DeliveryResult> {
  // Step 1: Check suppression
  if (signal.suppressed) {
    return {
      signalId: "", // TODO: get from persisted signal
      channel: recipient.preferredChannel,
      status: "rate_limited",
      error: signal.suppressionReason ?? "Suppressed",
    };
  }

  // Step 2: Check rate limit
  const rateCheck = await checkRateLimit(signal.tenantId, recipient.employeeId);
  if (!rateCheck.allowed) {
    return {
      signalId: "",
      channel: recipient.preferredChannel,
      status: "rate_limited",
      error: `Recipient has received ${rateCheck.sentToday}/${RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY} signals today`,
    };
  }

  // Step 3: Check quiet hours
  if (!isWithinDeliveryHours(new Date(), recipient.timezone)) {
    const nextWindow = getNextDeliveryWindow(new Date(), recipient.timezone);
    return {
      signalId: "",
      channel: recipient.preferredChannel,
      status: "quiet_hours",
      scheduledFor: nextWindow,
    };
  }

  // Step 4: Route to appropriate channel
  try {
    if (recipient.preferredChannel === "whatsapp" && recipient.phone) {
      // TODO: Get WhatsApp config from tenant
      // const result = await deliverViaWhatsApp({ ... });
      throw new Error("Not implemented: WhatsApp delivery");
    } else {
      const formatted = formatSignalEmail(
        signal.title,
        signal.body,
        signal.recommendation,
        signal.severity,
        signal.contextSnapshot.customer.name
      );
      const result = await sendEmail({
        to: recipient.email,
        subject: formatted.subject,
        htmlBody: formatted.htmlBody,
        textBody: formatted.textBody,
      });
      return {
        signalId: "",
        channel: "email",
        status: result.status === "failed" ? "failed" : "sent",
        error: result.error,
      };
    }
  } catch (err) {
    return {
      signalId: "",
      channel: recipient.preferredChannel,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown delivery error",
    };
  }
}
