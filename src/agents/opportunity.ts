import { eq, and, gt } from "drizzle-orm";
import type { AgentDefinition, SignalOutput, SuppressionCheckResult } from "./types.js";
import type { MiniContext360 } from "../engine/context-builder.js";
import type { DetectedEvent } from "../engine/event-detector.js";
import { EventType } from "../engine/event-detector.js";
import { generateSignalDraft } from "../engine/intelligence.js";
import { db } from "../db/index.js";
import { signals } from "../db/schema.js";

// ─── Opportunity Categories ──────────────────────────────────────────────────

export type OpportunityCategory =
  | "expansion"
  | "ticket_addon"
  | "knowledge_gap"
  | "budget_timing";

// ─── Prompt ──────────────────────────────────────────────────────────────────

const OPPORTUNITY_PROMPT = `You are the Opportunity Agent identifying expansion and upsell opportunities for a B2B customer.

Generate a signal that:
1. Identifies the specific opportunity type and what triggered it
2. Provides supporting evidence (usage data, ticket patterns, timing)
3. Suggests a specific next step for the AE or CSM
4. Frames the opportunity in terms of customer value, not just revenue

Keep the tone consultative — this is about helping the customer succeed, which drives growth.`;

// ─── Agent ───────────────────────────────────────────────────────────────────

async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  const category = eventToCategory(event.type);
  if (!category) return [];

  // Check suppression rules
  const suppression = await checkSuppression(
    event.tenantId,
    event.customerId!,
    category,
    context
  );

  const draft = await generateSignalDraft(OPPORTUNITY_PROMPT, context, {
    ...event.data,
    opportunityCategory: category,
  });

  // Route to AE for expansion/budget, CSM for knowledge gap/ticket addon
  const recipientId =
    category === "expansion" || category === "budget_timing"
      ? (context.ae?.id ?? context.csm?.id)
      : (context.csm?.id ?? context.ae?.id);

  if (!recipientId) return [];

  return [
    {
      tenantId: event.tenantId,
      customerId: event.customerId!,
      type: "opportunity",
      subtype: category,
      severity: "medium",
      agent: "opportunity",
      recipientEmployeeId: recipientId,
      channel: "email" as const,
      title: draft.title,
      body: draft.body,
      recommendation: draft.recommendation,
      scheduledFor: new Date(),
      triggeringEventId: null,
      contextSnapshot: context,
      suppressed: suppression.suppressed,
      suppressionReason: suppression.reason,
    },
  ];
}

function eventToCategory(type: EventType): OpportunityCategory | null {
  const map: Partial<Record<EventType, OpportunityCategory>> = {
    [EventType.SEAT_UTILIZATION]: "expansion",
    [EventType.RECURRING_TICKETS]: "ticket_addon",
    [EventType.FISCAL_YEAR_END]: "budget_timing",
  };
  return map[type] ?? null;
}

/**
 * Check if an opportunity signal should be suppressed.
 */
export async function checkSuppression(
  tenantId: string,
  customerId: string,
  category: OpportunityCategory,
  context: MiniContext360
): Promise<SuppressionCheckResult> {
  // Rule 1: Health score too low
  if (context.customer.healthScore < 30) {
    return {
      suppressed: true,
      reason: `Customer health score (${context.customer.healthScore}) below threshold for opportunity signals`,
    };
  }

  // Rule 2: Active critical risk signal in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentRiskSignals = await db
    .select({ id: signals.id })
    .from(signals)
    .where(
      and(
        eq(signals.tenantId, tenantId),
        eq(signals.customerId, customerId),
        eq(signals.type, "risk"),
        eq(signals.severity, "critical"),
        gt(signals.createdAt, sevenDaysAgo)
      )
    )
    .limit(1);

  if (recentRiskSignals.length > 0) {
    return {
      suppressed: true,
      reason: "Active critical risk signal — focus on retention, not expansion",
    };
  }

  // Rule 3: Duplicate opportunity in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentOpportunity = await db
    .select({ id: signals.id })
    .from(signals)
    .where(
      and(
        eq(signals.tenantId, tenantId),
        eq(signals.customerId, customerId),
        eq(signals.type, "opportunity"),
        eq(signals.subtype, category),
        gt(signals.createdAt, thirtyDaysAgo)
      )
    )
    .limit(1);

  if (recentOpportunity.length > 0) {
    return {
      suppressed: true,
      reason: `Similar ${category} opportunity signal sent within last 30 days`,
    };
  }

  return { suppressed: false, reason: null };
}

export const opportunityAgent: AgentDefinition = {
  name: "opportunity",
  description: "Identifies expansion and upsell opportunities",
  handles: [EventType.SEAT_UTILIZATION, EventType.RECURRING_TICKETS, EventType.FISCAL_YEAR_END],
  process,
};
