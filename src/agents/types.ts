import type { MiniContext360 } from "@/engine/context-builder";
import type { DetectedEvent } from "@/engine/event-detector";

// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalType = "meeting_prep" | "collision" | "risk" | "opportunity";

export type SignalSubtype =
  | "deep_brief"
  | "quick_brief"
  | "type_a"
  | "type_b"
  | "type_c"
  | "type_d"
  | "expansion"
  | "ticket_addon"
  | "knowledge_gap"
  | "budget_timing";

export type Severity = "low" | "medium" | "high" | "critical";

export type DeliveryChannel = "email" | "whatsapp";

// ─── Signal Output ───────────────────────────────────────────────────────────

export interface SignalOutput {
  tenantId: string;
  customerId: string;
  type: SignalType;
  subtype: SignalSubtype | null;
  severity: Severity;
  agent: string;
  recipientEmployeeId: string;
  channel: DeliveryChannel;
  title: string;
  body: string;
  recommendation: string | null;
  scheduledFor: Date;
  triggeringEventId: string | null;
  contextSnapshot: MiniContext360;
  /** If true, the signal was generated but should not be sent */
  suppressed: boolean;
  suppressionReason: string | null;
}

// ─── Agent Function Signature ────────────────────────────────────────────────

/**
 * Every agent implements this function signature.
 * It receives an event and context, and returns zero or more signals.
 */
export type AgentFunction = (
  event: DetectedEvent,
  context: MiniContext360
) => Promise<SignalOutput[]>;

// ─── Agent Registration ──────────────────────────────────────────────────────

export interface AgentDefinition {
  name: string;
  description: string;
  /** Event types this agent handles */
  handles: string[];
  /** The agent's processing function */
  process: AgentFunction;
}

// ─── Suppression Check ──────────────────────────────────────────────────────

export interface SuppressionCheckResult {
  suppressed: boolean;
  reason: string | null;
}
