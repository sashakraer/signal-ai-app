/**
 * Unit tests for the hard-threshold definitions used by the signal engine.
 *
 * These thresholds are the Layer 1 filters — they determine when an event is
 * worth evaluating with Claude (Layer 2).
 */

import { describe, it, expect } from "vitest";
import {
  USAGE_DECLINE_USER_COUNT_YELLOW,
  USAGE_DECLINE_PERCENT_YELLOW,
  USAGE_DECLINE_PERCENT_WINDOW_DAYS,
  USAGE_DECLINE_PERCENT_RED,
  USAGE_DECLINE_RENEWAL_PROXIMITY_RED_DAYS,
  CONTACT_GAP_BY_TIER,
  getContactGapThresholds,
  TICKET_AGING_YELLOW_DAYS,
  TICKET_OPEN_COUNT_ORANGE,
  TICKET_HIGH_PRIORITY_RED_DAYS,
  SENTIMENT_YELLOW_THRESHOLD,
  SENTIMENT_NEGATIVE_COUNT_ORANGE,
  SENTIMENT_NEGATIVE_WINDOW_DAYS,
  OPPORTUNITY_SEAT_UTILIZATION_PERCENT,
  OPPORTUNITY_FISCAL_YEAR_WINDOW_DAYS,
  OPPORTUNITY_KNOWLEDGE_GAP_DAYS,
  OPPORTUNITY_RECURRING_TICKETS_COUNT,
  OPPORTUNITY_RECURRING_TICKETS_WINDOW_DAYS,
  RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
} from "../../src/engine/thresholds.js";

// ─── Usage Decline ──────────────────────────────────────────────────────────

describe("USAGE_DECLINE thresholds", () => {
  it("should flag an absolute drop of 3+ users", () => {
    expect(USAGE_DECLINE_USER_COUNT_YELLOW).toBe(3);
  });

  it("should flag a relative decline of >25% in 30 days", () => {
    expect(USAGE_DECLINE_PERCENT_YELLOW).toBe(25);
    expect(USAGE_DECLINE_PERCENT_WINDOW_DAYS).toBe(30);
  });

  it("should flag decline near renewal: >15% drop + renewal <30 days", () => {
    expect(USAGE_DECLINE_PERCENT_RED).toBe(15);
    expect(USAGE_DECLINE_RENEWAL_PROXIMITY_RED_DAYS).toBe(30);
  });
});

// ─── Contact Gap ────────────────────────────────────────────────────────────

describe("CONTACT_GAP thresholds", () => {
  it("should define outbound gap for high tier as 14 days", () => {
    expect(CONTACT_GAP_BY_TIER.high.yellowDays).toBe(14);
  });

  it("should define inbound gap for high tier as 7 days", () => {
    expect(CONTACT_GAP_BY_TIER.high.redDays).toBe(7);
  });

  it("should define outbound gap for medium tier as 30 days", () => {
    expect(CONTACT_GAP_BY_TIER.medium.yellowDays).toBe(30);
  });

  it("should define inbound gap for medium tier as 14 days", () => {
    expect(CONTACT_GAP_BY_TIER.medium.redDays).toBe(14);
  });

  it("should define outbound gap for low tier as 45 days", () => {
    expect(CONTACT_GAP_BY_TIER.low.yellowDays).toBe(45);
  });

  it("should define inbound gap for low tier as 21 days", () => {
    expect(CONTACT_GAP_BY_TIER.low.redDays).toBe(21);
  });

  it("should return medium defaults for unknown tier", () => {
    const result = getContactGapThresholds("unknown");
    expect(result.yellowDays).toBe(30);
  });
});

// ─── Tickets ────────────────────────────────────────────────────────────────

describe("TICKET thresholds", () => {
  it("should flag aging tickets at 14+ days with no update", () => {
    expect(TICKET_AGING_YELLOW_DAYS).toBe(14);
  });

  it("should flag multiple open tickets at 3+", () => {
    expect(TICKET_OPEN_COUNT_ORANGE).toBe(3);
  });

  it("should flag critical aging at 7+ days for HIGH priority", () => {
    expect(TICKET_HIGH_PRIORITY_RED_DAYS).toBe(7);
  });
});

// ─── Sentiment ──────────────────────────────────────────────────────────────

describe("SENTIMENT thresholds", () => {
  it("should flag a single message below 0.3 sentiment", () => {
    expect(SENTIMENT_YELLOW_THRESHOLD).toBe(0.3);
  });

  it("should flag recurring pattern: 2+ negative in 14 days", () => {
    expect(SENTIMENT_NEGATIVE_COUNT_ORANGE).toBe(2);
    expect(SENTIMENT_NEGATIVE_WINDOW_DAYS).toBe(14);
  });
});

// ─── Opportunity ────────────────────────────────────────────────────────────

describe("OPPORTUNITY thresholds", () => {
  it("should flag expansion at 85% seat utilization", () => {
    expect(OPPORTUNITY_SEAT_UTILIZATION_PERCENT).toBe(85);
  });

  it("should flag Q4 budget 60 days before fiscal year end", () => {
    expect(OPPORTUNITY_FISCAL_YEAR_WINDOW_DAYS).toBe(60);
  });

  it("should flag knowledge gap: 0% feature usage after 60 days", () => {
    expect(OPPORTUNITY_KNOWLEDGE_GAP_DAYS).toBe(60);
  });

  it("should flag ticket-to-addon: 2+ tickets same topic in 30 days", () => {
    expect(OPPORTUNITY_RECURRING_TICKETS_COUNT).toBe(2);
    expect(OPPORTUNITY_RECURRING_TICKETS_WINDOW_DAYS).toBe(30);
  });
});

// ─── Rate Limiting & Quiet Hours ────────────────────────────────────────────

describe("RATE_LIMIT", () => {
  it("should allow max 5 signals per recipient per day", () => {
    expect(RATE_LIMIT_SIGNALS_PER_RECIPIENT_PER_DAY).toBe(5);
  });
});

describe("QUIET_HOURS", () => {
  it("should define quiet hours as 08:00-20:00", () => {
    expect(QUIET_HOURS_START).toBe("08:00");
    expect(QUIET_HOURS_END).toBe("20:00");
  });
});
