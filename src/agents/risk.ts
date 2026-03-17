import type { AgentDefinition, SignalOutput, Severity } from "./types";
import type { MiniContext360 } from "@/engine/context-builder";
import type { DetectedEvent } from "@/engine/event-detector";
import { EventType } from "@/engine/event-detector";
import * as thresholds from "@/engine/thresholds";

// ─── Risk Categories ─────────────────────────────────────────────────────────

export type RiskCategory =
  | "usage_decline"
  | "contact_gap"
  | "ticket_aging"
  | "sentiment_drop"
  | "competitor_threat"
  | "renewal_risk";

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * Risk Agent: detects and alerts on churn risk indicators.
 *
 * Monitors:
 * - Usage decline patterns
 * - Contact gaps (silence from key accounts)
 * - Ticket aging and volume
 * - Sentiment deterioration
 * - Competitor mentions
 * - Renewal proximity combined with negative signals
 */
async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  // TODO: Implementation steps:
  // 1. Determine risk category from event type
  // 2. Assess severity using thresholds
  // 3. Check if a similar risk signal was recently sent (dedup window)
  // 4. Determine recipient: CSM for operational risks, manager for escalations
  // 5. Build prompt with risk-specific context and call intelligence.generateSignalDraft()
  // 6. For critical severity, add escalation due date
  // 7. Return SignalOutput(s)

  throw new Error("Not implemented");
}

/**
 * Assess risk severity based on event type and context.
 */
export function assessSeverity(
  category: RiskCategory,
  context: MiniContext360,
  eventData: Record<string, unknown>
): Severity {
  // TODO: Implement severity logic per category:
  // - usage_decline: yellow if count <= 3, red if >15% + renewal < 30d
  // - contact_gap: based on tier thresholds from thresholds.ts
  // - ticket_aging: yellow at 14d, orange at 3+ open, red for HIGH 7+ days
  // - sentiment_drop: yellow < 0.3, orange 2+ in 14d, red competitor
  // - competitor_threat: always red
  // - renewal_risk: compound of other factors near renewal date

  throw new Error("Not implemented");
}

export const riskAgent: AgentDefinition = {
  name: "risk",
  description: "Detects and alerts on customer churn risk indicators across multiple dimensions",
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
