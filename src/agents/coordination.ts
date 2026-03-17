import type { AgentDefinition, SignalOutput } from "./types";
import type { MiniContext360 } from "@/engine/context-builder";
import type { DetectedEvent } from "@/engine/event-detector";
import { EventType } from "@/engine/event-detector";

// ─── Collision Types ─────────────────────────────────────────────────────────

/**
 * Type A: Two reps reaching out to the same contact within a short window.
 * Type B: Conflicting messages — one rep offers a discount while another pushes upsell.
 * Type C: Support and Sales both contacting during an open escalation.
 * Type D: Manager/exec reaching out without CSM awareness.
 */
export enum CollisionType {
  /** Two reps reaching out to the same contact within a short window */
  TYPE_A_DUPLICATE_OUTREACH = "type_a",
  /** Conflicting messages from different reps */
  TYPE_B_CONFLICTING_MESSAGES = "type_b",
  /** Support and Sales both contacting during an open escalation */
  TYPE_C_SUPPORT_SALES_OVERLAP = "type_c",
  /** Manager/exec outreach without CSM awareness */
  TYPE_D_EXEC_BYPASS = "type_d",
}

export interface CollisionDetail {
  type: CollisionType;
  /** Employee IDs involved in the collision */
  employeeIds: string[];
  /** Contact ID that received duplicate outreach */
  contactId: string | null;
  /** Description of the conflict */
  description: string;
}

// ─── Detection Windows ──────────────────────────────────────────────────────

/** Hours within which duplicate outreach to same contact is a collision */
export const DUPLICATE_OUTREACH_WINDOW_HOURS = 24;

/** Hours to look back for conflicting message detection */
export const CONFLICTING_MESSAGE_WINDOW_HOURS = 48;

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * Coordination Agent: detects multi-rep collisions on the same customer.
 *
 * Monitors outreach patterns and alerts when multiple employees
 * contact the same customer/contact in ways that could cause confusion.
 */
async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  // TODO: Implementation steps:
  // 1. Determine collision type from event data
  // 2. Identify all employees involved
  // 3. Determine who should be notified:
  //    - Type A: Both reps + CSM
  //    - Type B: Both reps + their managers
  //    - Type C: Support lead + Sales rep + CSM
  //    - Type D: CSM (primary notification)
  // 4. Build collision-specific context for Claude prompt
  // 5. Generate signal with recommendation (who should proceed, who should hold)
  // 6. Return one SignalOutput per recipient

  throw new Error("Not implemented");
}

/**
 * Detect if a new outreach creates a collision with recent activity.
 * Called in real-time when a new email or meeting is detected.
 */
export async function checkForCollision(
  tenantId: string,
  employeeId: string,
  customerId: string,
  contactId: string | null
): Promise<CollisionDetail | null> {
  // TODO: Query recent interactions for this customer:
  // 1. Find outreach from OTHER employees to same contact within window
  // 2. Check for open support escalations (Type C)
  // 3. Check if the employee is a manager/exec bypassing CSM (Type D)
  // 4. Return the most severe collision found, or null

  throw new Error("Not implemented");
}

export const coordinationAgent: AgentDefinition = {
  name: "coordination",
  description: "Detects multi-rep collisions and coordinates outreach to prevent customer confusion",
  handles: [EventType.COLLISION],
  process,
};
