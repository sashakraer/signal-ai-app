import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/index.js", () => ({ db: {} }));
vi.mock("../../src/config/index.js", () => ({ config: {} }));
vi.mock("../../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../src/engine/intelligence.js", () => ({ generateSignalDraft: vi.fn() }));

import { determineBriefType, DEEP_BRIEF_HOURS_BEFORE, QUICK_BRIEF_HOURS_BEFORE } from "../../src/agents/preparation.js";

describe("determineBriefType", () => {
  const now = new Date("2026-03-17T10:00:00Z");

  it("returns deep_brief for meeting 20 hours away", () => {
    const meeting = new Date("2026-03-18T06:00:00Z");
    expect(determineBriefType(meeting, now)).toBe("deep_brief");
  });

  it("returns deep_brief for meeting 24 hours away", () => {
    const meeting = new Date("2026-03-18T10:00:00Z");
    expect(determineBriefType(meeting, now)).toBe("deep_brief");
  });

  it("returns quick_brief for meeting 2 hours away", () => {
    const meeting = new Date("2026-03-17T12:00:00Z");
    expect(determineBriefType(meeting, now)).toBe("quick_brief");
  });

  it("returns quick_brief for meeting 1 hour away", () => {
    const meeting = new Date("2026-03-17T11:00:00Z");
    expect(determineBriefType(meeting, now)).toBe("quick_brief");
  });

  it("returns null for meeting already started", () => {
    const meeting = new Date("2026-03-17T09:00:00Z");
    expect(determineBriefType(meeting, now)).toBeNull();
  });

  it("returns null for meeting at current time", () => {
    expect(determineBriefType(now, now)).toBeNull();
  });

  it("returns null for meeting more than 25 hours away", () => {
    const meeting = new Date("2026-03-18T12:00:00Z");
    expect(determineBriefType(meeting, now)).toBeNull();
  });

  it("returns quick_brief at boundary (exactly 3 hours = within quick range)", () => {
    const meeting = new Date("2026-03-17T13:00:00Z");
    expect(determineBriefType(meeting, now)).toBe("quick_brief");
  });
});
