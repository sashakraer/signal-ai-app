import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/index.js", () => ({ db: {} }));
vi.mock("../../src/config/index.js", () => ({ config: {} }));
vi.mock("../../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { isWithinDeliveryHours, getNextDeliveryWindow } from "../../src/delivery/router.js";

describe("isWithinDeliveryHours", () => {
  it("returns true during business hours (10:00 UTC)", () => {
    const date = new Date("2026-03-17T10:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(true);
  });

  it("returns true at exactly 08:00 UTC", () => {
    const date = new Date("2026-03-17T08:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(true);
  });

  it("returns true at exactly 20:00 UTC", () => {
    const date = new Date("2026-03-17T20:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(true);
  });

  it("returns false before business hours (06:00 UTC)", () => {
    const date = new Date("2026-03-17T06:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(false);
  });

  it("returns false after business hours (22:00 UTC)", () => {
    const date = new Date("2026-03-17T22:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(false);
  });

  it("returns false at midnight", () => {
    const date = new Date("2026-03-17T00:00:00Z");
    expect(isWithinDeliveryHours(date)).toBe(false);
  });
});

describe("getNextDeliveryWindow", () => {
  it("returns same time when within delivery hours", () => {
    const now = new Date("2026-03-17T10:00:00Z");
    const result = getNextDeliveryWindow(now);
    expect(result.getTime()).toBe(now.getTime());
  });

  it("returns next morning when after business hours", () => {
    const now = new Date("2026-03-17T22:00:00Z");
    const result = getNextDeliveryWindow(now);
    expect(result.getUTCDate()).toBe(18); // next day
    expect(result.getUTCHours()).toBe(8);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("returns same day start when before business hours", () => {
    const now = new Date("2026-03-17T05:00:00Z");
    const result = getNextDeliveryWindow(now);
    expect(result.getUTCDate()).toBe(17); // same day
    expect(result.getUTCHours()).toBe(8);
    expect(result.getUTCMinutes()).toBe(0);
  });
});
