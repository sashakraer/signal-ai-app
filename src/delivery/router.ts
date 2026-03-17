import { eq, and, gt, sql } from "drizzle-orm";
import type { SignalOutput } from "../agents/types.js";
import { db } from "../db/index.js";
import { signals } from "../db/schema.js";
import {
  RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
} from "../engine/thresholds.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryResult {
  signalId: string;
  channel: "email" | "whatsapp";
  status: "sent" | "queued" | "rate_limited" | "quiet_hours" | "suppressed" | "failed";
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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signals)
    .where(
      and(
        eq(signals.tenantId, tenantId),
        eq(signals.recipientEmployeeId, recipientEmployeeId),
        gt(signals.sentAt, todayStart)
      )
    );

  const sentToday = result[0]?.count ?? 0;
  return {
    allowed: sentToday < RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY,
    sentToday,
  };
}

// ─── Quiet Hours ────────────────────────────────────────────────────────────

/**
 * Check if delivery is allowed (within business hours).
 */
export function isWithinDeliveryHours(
  now: Date = new Date(),
  _timezone: string = "UTC"
): boolean {
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const currentTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  return currentTime >= QUIET_HOURS_START && currentTime <= QUIET_HOURS_END;
}

/**
 * Calculate next delivery window if currently in quiet hours.
 */
export function getNextDeliveryWindow(
  now: Date = new Date(),
  timezone: string = "UTC"
): Date {
  const next = new Date(now);
  const [startHour, startMin] = QUIET_HOURS_START.split(":").map(Number);

  if (!isWithinDeliveryHours(now, timezone)) {
    if (now.getUTCHours() >= 20) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(startHour, startMin, 0, 0);
  }

  return next;
}

// ─── Persist Signal ──────────────────────────────────────────────────────────

/**
 * Persist a signal to the database and return its ID.
 */
export async function persistSignal(signal: SignalOutput): Promise<string> {
  const rows = await db
    .insert(signals)
    .values({
      tenantId: signal.tenantId,
      customerId: signal.customerId,
      type: signal.type,
      subtype: signal.subtype,
      severity: signal.severity,
      agent: signal.agent,
      recipientEmployeeId: signal.recipientEmployeeId,
      channel: signal.channel,
      title: signal.title,
      body: signal.body,
      recommendation: signal.recommendation,
      scheduledFor: signal.scheduledFor,
      triggeringEventId: signal.triggeringEventId,
      contextSnapshot: signal.contextSnapshot,
      suppressed: signal.suppressed,
      suppressionReason: signal.suppressionReason,
    })
    .returning({ id: signals.id });

  return rows[0].id;
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * Main signal delivery router. Handles rate limiting, quiet hours,
 * channel selection, and persistence.
 */
export async function routeSignal(
  signal: SignalOutput,
  recipient: RecipientInfo
): Promise<DeliveryResult> {
  // Step 1: Persist the signal
  const signalId = await persistSignal(signal);

  // Step 2: Check suppression
  if (signal.suppressed) {
    return {
      signalId,
      channel: recipient.preferredChannel,
      status: "suppressed",
      error: signal.suppressionReason ?? "Suppressed",
    };
  }

  // Step 3: Check rate limit
  const rateCheck = await checkRateLimit(signal.tenantId, recipient.employeeId);
  if (!rateCheck.allowed) {
    return {
      signalId,
      channel: recipient.preferredChannel,
      status: "rate_limited",
      error: `${rateCheck.sentToday}/${RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY} signals today`,
    };
  }

  // Step 4: Check quiet hours
  if (!isWithinDeliveryHours(new Date(), recipient.timezone)) {
    const nextWindow = getNextDeliveryWindow(new Date(), recipient.timezone);
    await db
      .update(signals)
      .set({ scheduledFor: nextWindow })
      .where(eq(signals.id, signalId));

    return {
      signalId,
      channel: recipient.preferredChannel,
      status: "quiet_hours",
      scheduledFor: nextWindow,
    };
  }

  // Step 5: Mark as sent (actual delivery via email/whatsapp happens in delivery layer)
  await db
    .update(signals)
    .set({ sentAt: new Date() })
    .where(eq(signals.id, signalId));

  return {
    signalId,
    channel: recipient.preferredChannel,
    status: "sent",
  };
}
