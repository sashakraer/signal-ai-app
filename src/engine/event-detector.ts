// ─── Event Types ─────────────────────────────────────────────────────────────

export enum EventType {
  /** New email received from or sent to a customer contact */
  EMAIL_RECEIVED = "email_received",
  /** Calendar meeting scheduled with customer contacts */
  MEETING_SCHEDULED = "meeting_scheduled",
  /** Significant change in sentiment detected */
  SENTIMENT_CHANGE = "sentiment_change",
  /** Potential multi-rep collision on same customer */
  COLLISION = "collision",
  /** Support ticket aged past threshold */
  TICKET_AGED = "ticket_aged",
  /** Critical support ticket opened or escalated */
  TICKET_CRITICAL = "ticket_critical",
  /** Renewal date approaching within threshold */
  RENEWAL_APPROACHING = "renewal_approaching",
  /** Deal stage changed in CRM */
  STAGE_CHANGE = "stage_change",
  /** Usage metrics declined past threshold */
  USAGE_DECLINE = "usage_decline",
  /** Contact gap — no interaction past threshold for tier */
  CONTACT_GAP = "contact_gap",
  /** Competitor mention detected in communications */
  COMPETITOR_MENTION = "competitor_mention",
  /** Fiscal year end approaching for customer */
  FISCAL_YEAR_END = "fiscal_year_end",
  /** Seat utilization near capacity */
  SEAT_UTILIZATION = "seat_utilization",
  /** Multiple tickets on same topic */
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
  /** Time window to look back for pattern detection */
  lookbackMinutes?: number;
}

// ─── Detector ────────────────────────────────────────────────────────────────

/**
 * Main event detection pipeline. Scans recent data for threshold breaches
 * and pattern matches, emitting events for agent processing.
 */
export async function detectEvents(ctx: DetectionContext): Promise<DetectedEvent[]> {
  const events: DetectedEvent[] = [];

  // TODO: Run each detector in parallel:
  // 1. detectContactGaps(ctx) — check last interaction dates vs tier thresholds
  // 2. detectTicketAging(ctx) — check open tickets vs aging thresholds
  // 3. detectRenewalApproaching(ctx) — check renewal dates vs window
  // 4. detectUsageDecline(ctx) — check usage metrics vs decline thresholds
  // 5. detectSentimentChanges(ctx) — check recent sentiment scores
  // 6. detectCollisions(ctx) — check for multi-rep outreach to same customer
  // 7. detectCompetitorMentions(ctx) — scan recent interactions for competitor names
  // 8. detectSeatUtilization(ctx) — check seat usage percentages
  // 9. detectRecurringTickets(ctx) — cluster tickets by topic

  throw new Error("Not implemented");
}

/**
 * Detect events from a single new interaction (real-time path).
 * Called when a new email/meeting is ingested, for immediate event detection.
 */
export async function detectEventsFromInteraction(
  interactionId: string,
  ctx: DetectionContext
): Promise<DetectedEvent[]> {
  // TODO: Load the interaction, check for:
  // - Sentiment below threshold
  // - Competitor mentions in body
  // - Collision with recent outreach from other employees
  throw new Error("Not implemented");
}
