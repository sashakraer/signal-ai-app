// ─── Usage Decline Thresholds ────────────────────────────────────────────────

/** Number of users that triggers a yellow usage alert */
export const USAGE_DECLINE_USER_COUNT_YELLOW = 3;

/** Percentage decline over 30 days that triggers yellow */
export const USAGE_DECLINE_PERCENT_YELLOW = 25;
/** Window in days for percentage decline check */
export const USAGE_DECLINE_PERCENT_WINDOW_DAYS = 30;

/** Percentage decline that, combined with renewal proximity, triggers red */
export const USAGE_DECLINE_PERCENT_RED = 15;
/** Renewal proximity in days for red usage alert */
export const USAGE_DECLINE_RENEWAL_PROXIMITY_RED_DAYS = 30;

// ─── Contact Gap Thresholds (days) ──────────────────────────────────────────

/** High tier: yellow after N days without interaction */
export const CONTACT_GAP_HIGH_YELLOW_DAYS = 14;
/** High tier: red after N days without interaction */
export const CONTACT_GAP_HIGH_RED_DAYS = 7;

/** Medium tier: yellow after N days without interaction */
export const CONTACT_GAP_MEDIUM_YELLOW_DAYS = 30;
/** Medium tier: red after N days without interaction */
export const CONTACT_GAP_MEDIUM_RED_DAYS = 14;

/** Low tier: yellow after N days without interaction */
export const CONTACT_GAP_LOW_YELLOW_DAYS = 45;
/** Low tier: red after N days without interaction */
export const CONTACT_GAP_LOW_RED_DAYS = 21;

export const CONTACT_GAP_BY_TIER = {
  high: { yellowDays: CONTACT_GAP_HIGH_YELLOW_DAYS, redDays: CONTACT_GAP_HIGH_RED_DAYS },
  medium: { yellowDays: CONTACT_GAP_MEDIUM_YELLOW_DAYS, redDays: CONTACT_GAP_MEDIUM_RED_DAYS },
  low: { yellowDays: CONTACT_GAP_LOW_YELLOW_DAYS, redDays: CONTACT_GAP_LOW_RED_DAYS },
} as const;

// ─── Ticket Thresholds ──────────────────────────────────────────────────────

/** Days an open ticket ages before yellow alert */
export const TICKET_AGING_YELLOW_DAYS = 14;

/** Number of simultaneously open tickets that triggers orange */
export const TICKET_OPEN_COUNT_ORANGE = 3;

/** Days a HIGH priority ticket can age before red alert */
export const TICKET_HIGH_PRIORITY_RED_DAYS = 7;

// ─── Sentiment Thresholds ───────────────────────────────────────────────────

/** Sentiment score below this triggers yellow (scale -1.0 to 1.0) */
export const SENTIMENT_YELLOW_THRESHOLD = 0.3;

/** Number of negative sentiment interactions in window that triggers orange */
export const SENTIMENT_NEGATIVE_COUNT_ORANGE = 2;
/** Window in days for counting negative sentiment interactions */
export const SENTIMENT_NEGATIVE_WINDOW_DAYS = 14;

/** Explicit competitor mention triggers red */
export const SENTIMENT_COMPETITOR_MENTION_RED = true;

// ─── Opportunity Thresholds ─────────────────────────────────────────────────

/** Seat utilization percentage that triggers expansion opportunity */
export const OPPORTUNITY_SEAT_UTILIZATION_PERCENT = 85;

/** Days before fiscal year end to trigger budget opportunity */
export const OPPORTUNITY_FISCAL_YEAR_WINDOW_DAYS = 60;

/** Days of knowledge gap (no product training/enablement) to trigger opportunity */
export const OPPORTUNITY_KNOWLEDGE_GAP_DAYS = 60;

/** Number of tickets on same topic within window to trigger add-on opportunity */
export const OPPORTUNITY_RECURRING_TICKETS_COUNT = 2;
/** Window in days for recurring ticket detection */
export const OPPORTUNITY_RECURRING_TICKETS_WINDOW_DAYS = 30;

// ─── Delivery Thresholds ────────────────────────────────────────────────────

/** Maximum signals per recipient per day */
export const RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY = 5;

/** Quiet hours start (inclusive, 24h format) */
export const QUIET_HOURS_START = "08:00";
/** Quiet hours end (inclusive, 24h format) */
export const QUIET_HOURS_END = "20:00";

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Returns contact gap thresholds for a given customer tier.
 */
export function getContactGapThresholds(tier: string): { yellowDays: number; redDays: number } {
  const key = tier.toLowerCase() as keyof typeof CONTACT_GAP_BY_TIER;
  return CONTACT_GAP_BY_TIER[key] ?? CONTACT_GAP_BY_TIER.medium;
}
