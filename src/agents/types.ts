import type { MiniContext360 } from "../engine/context-builder.js";
import type { DetectedEvent } from "../engine/event-detector.js";

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
  suppressed: boolean;
  suppressionReason: string | null;
}

// ─── Agent Function Signature ────────────────────────────────────────────────

export type AgentFunction = (
  event: DetectedEvent,
  context: MiniContext360
) => Promise<SignalOutput[]>;

export interface AgentDefinition {
  name: string;
  description: string;
  handles: string[];
  process: AgentFunction;
}

// ─── Suppression Check ──────────────────────────────────────────────────────

export interface SuppressionCheckResult {
  suppressed: boolean;
  reason: string | null;
}
