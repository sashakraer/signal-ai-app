import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/index.js", () => ({ db: {} }));
vi.mock("../../src/config/index.js", () => ({ config: {} }));
vi.mock("../../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../src/engine/intelligence.js", () => ({ generateSignalDraft: vi.fn() }));

import { assessSeverity, type RiskCategory } from "../../src/agents/risk.js";
import type { MiniContext360 } from "../../src/engine/context-builder.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<MiniContext360["customer"]> = {}): MiniContext360 {
  return {
    customer: {
      id: "cust-001",
      name: "Atlas Defense",
      segment: "enterprise",
      arr: "250000",
      tier: "high",
      healthScore: 50,
      renewalDate: null,
      fiscalYearEnd: null,
      products: ["Platform"],
      signalThesis: null,
      ...overrides,
    },
    contacts: [],
    recentInteractions: [],
    openTickets: [],
    activeDeals: [],
    recentSignals: [],
    csm: null,
    ae: null,
  };
}

// ─── assessSeverity ──────────────────────────────────────────────────────────

describe("assessSeverity", () => {
  describe("usage_decline", () => {
    it("returns critical when high decline + renewal proximity", () => {
      const ctx = makeContext({
        renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      });
      expect(assessSeverity("usage_decline", ctx, { percentDecline: 20 })).toBe("critical");
    });

    it("returns high for significant decline", () => {
      expect(assessSeverity("usage_decline", makeContext(), { percentDecline: 30 })).toBe("high");
    });

    it("returns medium for moderate decline", () => {
      expect(assessSeverity("usage_decline", makeContext(), { percentDecline: 10 })).toBe("medium");
    });
  });

  describe("contact_gap", () => {
    it("returns high for red severity", () => {
      expect(assessSeverity("contact_gap", makeContext(), { severity: "red" })).toBe("high");
    });

    it("returns medium for yellow severity", () => {
      expect(assessSeverity("contact_gap", makeContext(), { severity: "yellow" })).toBe("medium");
    });
  });

  describe("ticket_aging", () => {
    it("returns high for red severity", () => {
      expect(assessSeverity("ticket_aging", makeContext(), { severity: "red" })).toBe("high");
    });

    it("returns high for many open tickets", () => {
      expect(assessSeverity("ticket_aging", makeContext(), { openTicketCount: 4 })).toBe("high");
    });

    it("returns medium for yellow", () => {
      expect(assessSeverity("ticket_aging", makeContext(), { severity: "yellow" })).toBe("medium");
    });
  });

  describe("sentiment_drop", () => {
    it("returns high for very negative sentiment", () => {
      expect(assessSeverity("sentiment_drop", makeContext(), { sentiment: -0.7 })).toBe("high");
    });

    it("returns medium for moderate negative", () => {
      expect(assessSeverity("sentiment_drop", makeContext(), { sentiment: -0.3 })).toBe("medium");
    });
  });

  describe("competitor_threat", () => {
    it("always returns critical", () => {
      expect(assessSeverity("competitor_threat", makeContext(), {})).toBe("critical");
    });
  });

  describe("renewal_risk", () => {
    it("returns critical for imminent renewal with low health", () => {
      expect(
        assessSeverity("renewal_risk", makeContext({ healthScore: 35 }), { daysUntilRenewal: 10 })
      ).toBe("critical");
    });

    it("returns high for 30-day renewal with moderate health", () => {
      expect(
        assessSeverity("renewal_risk", makeContext({ healthScore: 45 }), { daysUntilRenewal: 25 })
      ).toBe("high");
    });

    it("returns medium for 60-day renewal", () => {
      expect(
        assessSeverity("renewal_risk", makeContext(), { daysUntilRenewal: 55 })
      ).toBe("medium");
    });

    it("returns low for distant renewal", () => {
      expect(
        assessSeverity("renewal_risk", makeContext(), { daysUntilRenewal: 100 })
      ).toBe("low");
    });
  });
});
