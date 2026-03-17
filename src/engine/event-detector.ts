import { eq, and, lt, gt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, interactions, tickets, events } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import * as thresholds from "./thresholds.js";

// ─── Event Types ─────────────────────────────────────────────────────────────

export enum EventType {
  EMAIL_RECEIVED = "email_received",
  MEETING_SCHEDULED = "meeting_scheduled",
  SENTIMENT_CHANGE = "sentiment_change",
  COLLISION = "collision",
  TICKET_AGED = "ticket_aged",
  TICKET_CRITICAL = "ticket_critical",
  RENEWAL_APPROACHING = "renewal_approaching",
  STAGE_CHANGE = "stage_change",
  USAGE_DECLINE = "usage_decline",
  CONTACT_GAP = "contact_gap",
  COMPETITOR_MENTION = "competitor_mention",
  FISCAL_YEAR_END = "fiscal_year_end",
  SEAT_UTILIZATION = "seat_utilization",
  RECURRING_TICKETS = "recurring_tickets",
}

export interface DetectedEvent {
  type: EventType;
  tenantId: string;
  customerId: string | null;
  occurredAt: Date;
  source: string;
  data: Record<string, unknown>;
}

export interface DetectionContext {
  tenantId: string;
  lookbackMinutes?: number;
}

// ─── Main Detector ───────────────────────────────────────────────────────────

/**
 * Main event detection pipeline. Scans data for threshold breaches
 * and emits events for agent processing.
 */
export async function detectEvents(ctx: DetectionContext): Promise<DetectedEvent[]> {
  const { tenantId } = ctx;
  const log = logger.child({ tenantId, job: "event-detector" });

  const detectors = [
    detectContactGaps(tenantId),
    detectTicketAging(tenantId),
    detectRenewalApproaching(tenantId),
    detectOpenTicketVolume(tenantId),
  ];

  const results = await Promise.allSettled(detectors);
  const allEvents: DetectedEvent[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allEvents.push(...result.value);
    } else {
      log.error({ error: result.reason }, "Detector failed");
    }
  }

  // Persist detected events
  for (const event of allEvents) {
    try {
      await db.insert(events).values({
        tenantId: event.tenantId,
        customerId: event.customerId,
        type: event.type,
        source: event.source,
        occurredAt: event.occurredAt,
        data: event.data,
      });
    } catch {
      log.debug({ type: event.type, customerId: event.customerId }, "Event insert skipped");
    }
  }

  log.info({ eventCount: allEvents.length }, "Event detection completed");
  return allEvents;
}

/**
 * Detect events from a single new interaction (real-time path).
 */
export async function detectEventsFromInteraction(
  interactionId: string,
  ctx: DetectionContext
): Promise<DetectedEvent[]> {
  const detectedEvents: DetectedEvent[] = [];
  const { tenantId } = ctx;

  const rows = await db
    .select()
    .from(interactions)
    .where(
      and(eq(interactions.tenantId, tenantId), eq(interactions.id, interactionId))
    )
    .limit(1);

  if (rows.length === 0) return [];
  const interaction = rows[0];

  if (interaction.type === "meeting") {
    detectedEvents.push({
      type: EventType.MEETING_SCHEDULED,
      tenantId,
      customerId: interaction.customerId,
      occurredAt: interaction.occurredAt,
      source: "interaction",
      data: {
        interactionId: interaction.id,
        subject: interaction.subject,
        employeeId: interaction.employeeId,
      },
    });
  } else if (interaction.type === "email") {
    detectedEvents.push({
      type: EventType.EMAIL_RECEIVED,
      tenantId,
      customerId: interaction.customerId,
      occurredAt: interaction.occurredAt,
      source: "interaction",
      data: {
        interactionId: interaction.id,
        subject: interaction.subject,
        direction: interaction.direction,
        employeeId: interaction.employeeId,
      },
    });
  }

  // Sentiment threshold check
  if (
    interaction.sentiment != null &&
    interaction.sentiment < thresholds.SENTIMENT_YELLOW_THRESHOLD
  ) {
    detectedEvents.push({
      type: EventType.SENTIMENT_CHANGE,
      tenantId,
      customerId: interaction.customerId,
      occurredAt: interaction.occurredAt,
      source: "interaction",
      data: {
        interactionId: interaction.id,
        sentiment: interaction.sentiment,
        sentimentLabel: interaction.sentimentLabel,
      },
    });
  }

  return detectedEvents;
}

// ─── Individual Detectors ────────────────────────────────────────────────────

async function detectContactGaps(tenantId: string): Promise<DetectedEvent[]> {
  const detectedEvents: DetectedEvent[] = [];
  const now = new Date();

  const customerRows = await db
    .select({ id: customers.id, name: customers.name, tier: customers.tier })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));

  for (const customer of customerRows) {
    const tier = customer.tier ?? "medium";
    const gapThresholds = thresholds.getContactGapThresholds(tier);

    const lastInteraction = await db
      .select({ occurredAt: interactions.occurredAt })
      .from(interactions)
      .where(
        and(
          eq(interactions.tenantId, tenantId),
          eq(interactions.customerId, customer.id)
        )
      )
      .orderBy(sql`occurred_at DESC`)
      .limit(1);

    if (lastInteraction.length === 0) continue;

    const daysSince = Math.floor(
      (now.getTime() - lastInteraction[0].occurredAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const severity =
      daysSince >= gapThresholds.redDays
        ? "red"
        : daysSince >= gapThresholds.yellowDays
          ? "yellow"
          : null;

    if (severity) {
      detectedEvents.push({
        type: EventType.CONTACT_GAP,
        tenantId,
        customerId: customer.id,
        occurredAt: now,
        source: "scheduled_scan",
        data: {
          daysSinceContact: daysSince,
          tier,
          severity,
          customerName: customer.name,
          thresholdDays: severity === "red" ? gapThresholds.redDays : gapThresholds.yellowDays,
        },
      });
    }
  }

  return detectedEvents;
}

async function detectTicketAging(tenantId: string): Promise<DetectedEvent[]> {
  const detectedEvents: DetectedEvent[] = [];
  const now = new Date();

  const openTickets = await db
    .select({
      id: tickets.id,
      customerId: tickets.customerId,
      subject: tickets.subject,
      priority: tickets.priority,
      openedAt: tickets.openedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.status, "open")));

  for (const ticket of openTickets) {
    const ageDays = Math.floor(
      (now.getTime() - ticket.openedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (ticket.priority === "high" && ageDays >= thresholds.TICKET_HIGH_PRIORITY_RED_DAYS) {
      detectedEvents.push({
        type: EventType.TICKET_CRITICAL,
        tenantId,
        customerId: ticket.customerId,
        occurredAt: now,
        source: "scheduled_scan",
        data: { ticketId: ticket.id, subject: ticket.subject, priority: ticket.priority, ageDays, severity: "red" },
      });
    } else if (ageDays >= thresholds.TICKET_AGING_YELLOW_DAYS) {
      detectedEvents.push({
        type: EventType.TICKET_AGED,
        tenantId,
        customerId: ticket.customerId,
        occurredAt: now,
        source: "scheduled_scan",
        data: { ticketId: ticket.id, subject: ticket.subject, priority: ticket.priority, ageDays, severity: "yellow" },
      });
    }
  }

  return detectedEvents;
}

async function detectRenewalApproaching(tenantId: string): Promise<DetectedEvent[]> {
  const detectedEvents: DetectedEvent[] = [];
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const renewingCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      renewalDate: customers.renewalDate,
      arr: customers.arr,
      healthScore: customers.healthScore,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        gt(customers.renewalDate, now.toISOString().split("T")[0]),
        lt(customers.renewalDate, windowEnd.toISOString().split("T")[0])
      )
    );

  for (const customer of renewingCustomers) {
    if (!customer.renewalDate) continue;
    const renewalDate = new Date(customer.renewalDate);
    const daysUntilRenewal = Math.floor(
      (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const milestones = [90, 60, 30, 14, 7];
    const matchedMilestone = milestones.find(
      (m) => daysUntilRenewal <= m && daysUntilRenewal > m - 1
    );

    if (matchedMilestone) {
      detectedEvents.push({
        type: EventType.RENEWAL_APPROACHING,
        tenantId,
        customerId: customer.id,
        occurredAt: now,
        source: "scheduled_scan",
        data: {
          daysUntilRenewal,
          renewalDate: customer.renewalDate,
          arr: customer.arr,
          healthScore: customer.healthScore,
          customerName: customer.name,
          milestone: matchedMilestone,
        },
      });
    }
  }

  return detectedEvents;
}

async function detectOpenTicketVolume(tenantId: string): Promise<DetectedEvent[]> {
  const detectedEvents: DetectedEvent[] = [];
  const now = new Date();

  const ticketCounts = await db
    .select({
      customerId: tickets.customerId,
      count: sql<number>`count(*)::int`,
    })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.status, "open")))
    .groupBy(tickets.customerId);

  for (const row of ticketCounts) {
    if (row.count >= thresholds.TICKET_OPEN_COUNT_ORANGE) {
      detectedEvents.push({
        type: EventType.TICKET_CRITICAL,
        tenantId,
        customerId: row.customerId,
        occurredAt: now,
        source: "scheduled_scan",
        data: {
          openTicketCount: row.count,
          threshold: thresholds.TICKET_OPEN_COUNT_ORANGE,
          severity: "orange",
        },
      });
    }
  }

  return detectedEvents;
}
