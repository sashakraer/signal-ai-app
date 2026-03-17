import type { AgentDefinition, SignalOutput, SuppressionCheckResult } from "./types";
import type { MiniContext360 } from "@/engine/context-builder";
import type { DetectedEvent } from "@/engine/event-detector";
import { EventType } from "@/engine/event-detector";
import * as thresholds from "@/engine/thresholds";

// ─── Opportunity Categories ──────────────────────────────────────────────────

export type OpportunityCategory =
  | "expansion"       // Seat utilization high -> upsell seats
  | "ticket_addon"    // Recurring tickets on a feature gap -> sell add-on
  | "knowledge_gap"   // No training/enablement in 60 days -> offer services
  | "budget_timing";  // Fiscal year end approaching -> propose before budget freeze

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * Opportunity Agent: identifies expansion and upsell opportunities.
 *
 * Monitors:
 * - Seat utilization approaching capacity (>=85%)
 * - Recurring support tickets suggesting feature needs
 * - Knowledge/training gaps
 * - Fiscal year timing for budget conversations
 */
async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  // TODO: Implementation steps:
  // 1. Categorize opportunity from event type
  // 2. Run suppression check — skip if customer health is critical
  // 3. Check for active deal on this customer (avoid duplicate opportunity signals)
  // 4. Determine recipient: AE for expansion, CSM for knowledge gap
  // 5. Build opportunity-specific prompt and call intelligence.generateSignalDraft()
  // 6. Set appropriate severity (opportunities are typically medium)
  // 7. Return SignalOutput with suppression status

  throw new Error("Not implemented");
}

/**
 * Check if an opportunity signal should be suppressed.
 *
 * Suppression rules:
 * - Customer health score < 30: suppress (focus on retention, not upsell)
 * - Active critical risk signal in last 7 days: suppress
 * - Similar opportunity signal sent in last 30 days: suppress (dedup)
 * - Customer explicitly flagged as "no outreach": suppress
 */
export async function checkSuppression(
  tenantId: string,
  customerId: string,
  category: OpportunityCategory,
  context: MiniContext360
): Promise<SuppressionCheckResult> {
  // TODO: Check each suppression rule:

  // Rule 1: Health score too low
  if (context.customer.healthScore < 30) {
    return {
      suppressed: true,
      reason: `Customer health score (${context.customer.healthScore}) below threshold for opportunity signals`,
    };
  }

  // TODO: Rule 2: Check for active critical risk signals in last 7 days
  // TODO: Rule 3: Check for duplicate opportunity signal in last 30 days
  // TODO: Rule 4: Check customer "no outreach" flag

  return { suppressed: false, reason: null };
}

export const opportunityAgent: AgentDefinition = {
  name: "opportunity",
  description: "Identifies expansion and upsell opportunities based on usage, tickets, and timing",
  handles: [
    EventType.SEAT_UTILIZATION,
    EventType.RECURRING_TICKETS,
    EventType.FISCAL_YEAR_END,
  ],
  process,
};
