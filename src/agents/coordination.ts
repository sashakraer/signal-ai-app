import type { AgentDefinition, SignalOutput } from "./types.js";
import type { MiniContext360 } from "../engine/context-builder.js";
import type { DetectedEvent } from "../engine/event-detector.js";
import { EventType } from "../engine/event-detector.js";
import { generateSignalDraft } from "../engine/intelligence.js";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { interactions } from "../db/schema.js";

// ─── Collision Types ─────────────────────────────────────────────────────────

export enum CollisionType {
  TYPE_A_DUPLICATE_OUTREACH = "type_a",
  TYPE_B_CONFLICTING_MESSAGES = "type_b",
  TYPE_C_SUPPORT_SALES_OVERLAP = "type_c",
  TYPE_D_EXEC_BYPASS = "type_d",
}

export interface CollisionDetail {
  type: CollisionType;
  employeeIds: string[];
  contactId: string | null;
  description: string;
}

export const DUPLICATE_OUTREACH_WINDOW_HOURS = 24;
export const CONFLICTING_MESSAGE_WINDOW_HOURS = 48;

// ─── Prompt ──────────────────────────────────────────────────────────────────

const COORDINATION_PROMPT = `You are the Coordination Agent detecting multi-rep collisions on the same customer.

Generate a signal that:
1. Clearly identifies who is contacting whom and when
2. Explains the risk of uncoordinated outreach (confusion, conflicting messages)
3. Recommends who should proceed and who should hold
4. If applicable, suggests a quick sync between the involved parties

Be diplomatic — the goal is coordination, not blame.`;

// ─── Agent ───────────────────────────────────────────────────────────────────

async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  const collision = event.data as unknown as CollisionDetail;
  if (!collision.employeeIds || collision.employeeIds.length === 0) return [];

  const draft = await generateSignalDraft(COORDINATION_PROMPT, context, event.data);

  // Send to all involved employees + CSM
  const recipientIds = new Set(collision.employeeIds);
  if (context.csm) recipientIds.add(context.csm.id);

  return [...recipientIds].map((recipientId) => ({
    tenantId: event.tenantId,
    customerId: event.customerId!,
    type: "collision" as const,
    subtype: collision.type as any,
    severity: "medium" as const,
    agent: "coordination",
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
  }));
}

/**
 * Check if a new outreach creates a collision with recent activity.
 */
export async function checkForCollision(
  tenantId: string,
  employeeId: string,
  customerId: string,
  contactId: string | null
): Promise<CollisionDetail | null> {
  const windowStart = new Date(
    Date.now() - DUPLICATE_OUTREACH_WINDOW_HOURS * 60 * 60 * 1000
  );

  // Find recent outbound interactions from OTHER employees to the same customer
  const recentOutreach = await db
    .select({
      employeeId: interactions.employeeId,
      contactId: interactions.contactId,
      occurredAt: interactions.occurredAt,
      subject: interactions.subject,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.tenantId, tenantId),
        eq(interactions.customerId, customerId),
        eq(interactions.direction, "outbound"),
        gt(interactions.occurredAt, windowStart)
      )
    );

  // Filter to other employees' outreach
  const otherOutreach = recentOutreach.filter(
    (r) => r.employeeId && r.employeeId !== employeeId
  );

  if (otherOutreach.length === 0) return null;

  // Type A: Same contact contacted by different reps
  if (contactId) {
    const sameContact = otherOutreach.filter((r) => r.contactId === contactId);
    if (sameContact.length > 0) {
      return {
        type: CollisionType.TYPE_A_DUPLICATE_OUTREACH,
        employeeIds: [employeeId, ...sameContact.map((r) => r.employeeId!)],
        contactId,
        description: `Multiple reps contacted the same contact within ${DUPLICATE_OUTREACH_WINDOW_HOURS}h`,
      };
    }
  }

  // Type A fallback: Same customer contacted by different reps
  if (otherOutreach.length > 0) {
    return {
      type: CollisionType.TYPE_A_DUPLICATE_OUTREACH,
      employeeIds: [employeeId, ...otherOutreach.map((r) => r.employeeId!)],
      contactId: null,
      description: `Multiple reps contacted the same customer within ${DUPLICATE_OUTREACH_WINDOW_HOURS}h`,
    };
  }

  return null;
}

export const coordinationAgent: AgentDefinition = {
  name: "coordination",
  description: "Detects multi-rep collisions and coordinates outreach",
  handles: [EventType.COLLISION],
  process,
};
