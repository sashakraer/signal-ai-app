import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/index.js", () => ({ db: {} }));
vi.mock("../../src/config/index.js", () => ({
  config: {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    APP_URL: "https://app.signal-ai.com",
  },
}));
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  generateViewToken,
  validateViewToken,
  generate360Url,
} from "../../src/api/view360-token.js";

describe("generateViewToken + validateViewToken", () => {
  it("generates a valid token that can be validated", () => {
    const token = generateViewToken("tenant-1", "customer-1");
    const payload = validateViewToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe("tenant-1");
    expect(payload!.customerId).toBe("customer-1");
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it("includes signalId when provided", () => {
    const token = generateViewToken("tenant-1", "customer-1", "signal-42");
    const payload = validateViewToken(token);

    expect(payload!.signalId).toBe("signal-42");
  });

  it("returns null for tampered token", () => {
    const token = generateViewToken("tenant-1", "customer-1");
    const tampered = token.slice(0, -3) + "abc";

    expect(validateViewToken(tampered)).toBeNull();
  });

  it("returns null for expired token", () => {
    const token = generateViewToken("tenant-1", "customer-1", undefined, -1);

    expect(validateViewToken(token)).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(validateViewToken("not-a-valid-token")).toBeNull();
    expect(validateViewToken("")).toBeNull();
    expect(validateViewToken("a.b.c")).toBeNull();
  });

  it("returns null for empty payload fields", () => {
    // Can't easily forge this without the key, but test the guard
    expect(validateViewToken("eyJ0ZW5hbnRJZCI6IiJ9.fake")).toBeNull();
  });
});

describe("generate360Url", () => {
  it("generates a full URL with token", () => {
    const url = generate360Url("tenant-1", "customer-1");

    expect(url).toMatch(/^https:\/\/app\.signal-ai\.com\/360\/.+\..+$/);
  });

  it("generated URL token validates correctly", () => {
    const url = generate360Url("tenant-1", "customer-1", "signal-7");
    const token = url.split("/360/")[1];
    const payload = validateViewToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe("tenant-1");
    expect(payload!.customerId).toBe("customer-1");
    expect(payload!.signalId).toBe("signal-7");
  });
});
