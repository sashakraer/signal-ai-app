import type { AgentDefinition, SignalOutput, Severity } from "./types.js";
import type { MiniContext360 } from "../engine/context-builder.js";
import type { DetectedEvent } from "../engine/event-detector.js";
import { EventType } from "../engine/event-detector.js";
import { generateSignalDraft } from "../engine/intelligence.js";
import * as thresholds from "../engine/thresholds.js";

// ─── Risk Categories ─────────────────────────────────────────────────────────

export type RiskCategory =
  | "usage_decline"
  | "contact_gap"
  | "ticket_aging"
  | "sentiment_drop"
  | "competitor_threat"
  | "renewal_risk";

// ─── Escalation Timers ──────────────────────────────────────────────────────

const ESCALATION_HOURS: Record<Severity, number | null> = {
  low: null,
  medium: null,
  high: 48,
  critical: 24,
};

// ─── Prompt ──────────────────────────────────────────────────────────────────

const RISK_PROMPT = `You are the Risk Agent identifying churn risk for a B2B customer.

Analyze the risk indicators and generate a signal that:
1. Clearly states the risk type and what triggered it
2. Provides context (how long, how severe, what changed)
3. References specific data points (dates, scores, counts)
4. Gives a concrete action the recipient should take within 24-48 hours
5. If renewal is approaching, emphasize the urgency

Be direct and actionable. CSMs need to know exactly what to do.`;

// ─── Agent ───────────────────────────────────────────────────────────────────

async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  const category = eventToCategory(event.type);
  if (!category) return [];

  const severity = assessSeverity(category, context, event.data);

  // Determine recipients based on severity
  const recipients: string[] = [];
  if (context.csm) recipients.push(context.csm.id);
  if (severity === "high" || severity === "critical") {
    if (context.ae) recipients.push(context.ae.id);
  }

  if (recipients.length === 0) return [];

  const draft = await generateSignalDraft(RISK_PROMPT, context, {
    ...event.data,
    riskCategory: category,
    assessedSeverity: severity,
  });

  const escalationHours = ESCALATION_HOURS[severity];
  const escalationDueAt = escalationHours
    ? new Date(Date.now() + escalationHours * 60 * 60 * 1000)
    : undefined;

  return recipients.map((recipientId) => ({
    tenantId: event.tenantId,
    customerId: event.customerId!,
    type: "risk" as const,
    subtype: null,
    severity,
    agent: "risk",
    recipientEmployeeId: recipientId,
    channel: "email" as const,
    title: draft.title,
    body: draft.body,
    recommendation: draft.recommendation,
    scheduledFor: new Date(),
    triggeringEventId: null,
    contextSnapshot: context,
    suppressed: false,
    suppressionReason: null,
    ...(escalationDueAt ? { escalationDueAt } : {}),
  }));
}

function eventToCategory(type: EventType): RiskCategory | null {
  const map: Partial<Record<EventType, RiskCategory>> = {
    [EventType.USAGE_DECLINE]: "usage_decline",
    [EventType.CONTACT_GAP]: "contact_gap",
    [EventType.TICKET_AGED]: "ticket_aging",
    [EventType.TICKET_CRITICAL]: "ticket_aging",
    [EventType.SENTIMENT_CHANGE]: "sentiment_drop",
    [EventType.COMPETITOR_MENTION]: "competitor_threat",
    [EventType.RENEWAL_APPROACHING]: "renewal_risk",
  };
  return map[type] ?? null;
}

/**
 * Assess risk severity based on event type and context.
 */
export function assessSeverity(
  category: RiskCategory,
  context: MiniContext360,
  eventData: Record<string, unknown>
): Severity {
  switch (category) {
    case "usage_decline": {
      const percentDecline = (eventData.percentDecline as number) ?? 0;
      const daysToRenewal = getDaysToRenewal(context);
      if (
        percentDecline >= thresholds.USAGE_DECLINE_PERCENT_RED &&
        daysToRenewal != null &&
        daysToRenewal <= thresholds.USAGE_DECLINE_RENEWAL_PROXIMITY_RED_DAYS
      ) {
        return "critical";
      }
      if (percentDecline >= thresholds.USAGE_DECLINE_PERCENT_YELLOW) return "high";
      return "medium";
    }

    case "contact_gap": {
      const severity = eventData.severity as string;
      if (severity === "red") return "high";
      return "medium";
    }

    case "ticket_aging": {
      const severity = eventData.severity as string;
      const openCount = (eventData.openTicketCount as number) ?? 1;
      if (severity === "red") return "high";
      if (openCount >= thresholds.TICKET_OPEN_COUNT_ORANGE) return "high";
      return "medium";
    }

    case "sentiment_drop": {
      const sentiment = (eventData.sentiment as number) ?? 0;
      if (sentiment < -0.5) return "high";
      return "medium";
    }

    case "competitor_threat":
      return "critical";

    case "renewal_risk": {
      const daysToRenewal = (eventData.daysUntilRenewal as number) ?? 90;
      const healthScore = context.customer.healthScore;
      if (daysToRenewal <= 14 && healthScore < 40) return "critical";
      if (daysToRenewal <= 30 && healthScore < 50) return "high";
      if (daysToRenewal <= 60) return "medium";
      return "low";
    }

    default:
      return "medium";
  }
}

function getDaysToRenewal(context: MiniContext360): number | null {
  if (!context.customer.renewalDate) return null;
  const renewal = new Date(context.customer.renewalDate);
  return Math.floor((renewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export const riskAgent: AgentDefinition = {
  name: "risk",
  description: "Detects and alerts on customer churn risk indicators",
  handles: [
    EventType.USAGE_DECLINE,
    EventType.CONTACT_GAP,
    EventType.TICKET_AGED,
    EventType.TICKET_CRITICAL,
    EventType.SENTIMENT_CHANGE,
    EventType.COMPETITOR_MENTION,
    EventType.RENEWAL_APPROACHING,
  ],
  process,
};
