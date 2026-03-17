/**
 * Unit tests for the entity resolution engine.
 *
 * Entity resolution is the most critical logic in the system — it maps raw
 * email addresses to employees, contacts, and customers.
 */

import { describe, it, vi, expect, beforeEach } from "vitest";

// Mock the database module before importing the resolver
vi.mock("../../src/db/index.js", () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();

  // Chainable query builder mock
  const createChain = () => {
    const chain = {
      select: mockSelect.mockReturnThis(),
      from: mockFrom.mockReturnThis(),
      where: mockWhere.mockReturnThis(),
      limit: mockLimit,
    };
    mockSelect.mockReturnValue(chain);
    return chain;
  };

  return {
    db: {
      select: mockSelect,
      _mocks: { mockSelect, mockFrom, mockWhere, mockLimit, createChain },
    },
  };
});

// Mock drizzle-orm operators to be passthrough
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  inArray: vi.fn((a, b) => ({ op: "inArray", a, b })),
  sql: vi.fn(),
}));

// Mock schema
vi.mock("../../src/db/schema.js", () => ({
  employees: { tenantId: "employees.tenantId", email: "employees.email", id: "employees.id" },
  contacts: {
    tenantId: "contacts.tenantId",
    email: "contacts.email",
    id: "contacts.id",
    customerId: "contacts.customerId",
  },
  customers: { tenantId: "customers.tenantId", id: "customers.id" },
}));

// Mock logger
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveEmail, resolveEmails, buildDomainCache } from "../../src/engine/entity-resolver.js";
import { db } from "../../src/db/index.js";

const TENANT_ID = "tenant-001";

// Helper to set up mock DB responses
function setupDbMock(responses: unknown[][]) {
  const mocks = (db as any)._mocks;
  let callIndex = 0;

  mocks.mockSelect.mockImplementation(() => {
    const chain = {
      select: mocks.mockSelect,
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(responses[callIndex] ?? []),
        }),
      }),
    };
    callIndex++;
    return chain;
  });
}

function setupDbMockNoLimit(responses: unknown[][]) {
  const mocks = (db as any)._mocks;
  let callIndex = 0;

  mocks.mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(responses[callIndex++] ?? []),
    }),
  }));
}

// ─── resolveEmail ───────────────────────────────────────────────────────────

describe("resolveEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a known employee email as internal", async () => {
    setupDbMock([
      [{ id: "emp-001" }], // employee match
    ]);

    const result = await resolveEmail("david@democompany.com", { tenantId: TENANT_ID });

    expect(result.isInternal).toBe(true);
    expect(result.employeeId).toBe("emp-001");
    expect(result.contactId).toBeNull();
    expect(result.customerId).toBeNull();
  });

  it("resolves a known contact email with customer association", async () => {
    setupDbMock([
      [], // no employee match
      [{ id: "contact-001", customerId: "cust-001" }], // contact match
    ]);

    const result = await resolveEmail("yael@atlas-defense.com", { tenantId: TENANT_ID });

    expect(result.isInternal).toBe(false);
    expect(result.contactId).toBe("contact-001");
    expect(result.customerId).toBe("cust-001");
    expect(result.employeeId).toBeNull();
  });

  it("resolves via domain cache when no employee or contact match", async () => {
    setupDbMock([
      [], // no employee match
      [], // no contact match
    ]);

    const domainCache = new Map([["atlas-defense.com", "cust-atlas"]]);

    const result = await resolveEmail("unknown@atlas-defense.com", {
      tenantId: TENANT_ID,
      domainCache,
    });

    expect(result.isInternal).toBe(false);
    expect(result.customerId).toBe("cust-atlas");
    expect(result.contactId).toBeNull();
    expect(result.employeeId).toBeNull();
  });

  it("returns unresolved for completely unknown email", async () => {
    setupDbMock([
      [], // no employee match
      [], // no contact match
    ]);

    const result = await resolveEmail("unknown@example.com", { tenantId: TENANT_ID });

    expect(result.isInternal).toBe(false);
    expect(result.contactId).toBeNull();
    expect(result.customerId).toBeNull();
    expect(result.employeeId).toBeNull();
  });

  it("normalizes email to lowercase", async () => {
    setupDbMock([
      [{ id: "emp-001" }],
    ]);

    const result = await resolveEmail("David@DemoCompany.COM", { tenantId: TENANT_ID });
    expect(result.employeeId).toBe("emp-001");
  });

  it("trims whitespace from email", async () => {
    setupDbMock([
      [{ id: "emp-001" }],
    ]);

    const result = await resolveEmail("  david@democompany.com  ", { tenantId: TENANT_ID });
    expect(result.employeeId).toBe("emp-001");
  });
});

// ─── resolveEmails (batch) ──────────────────────────────────────────────────

describe("resolveEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a mix of employees, contacts, and unknown emails", async () => {
    setupDbMockNoLimit([
      // employees batch
      [{ id: "emp-001", email: "david@democompany.com" }],
      // contacts batch
      [{ id: "contact-001", email: "yael@atlas-defense.com", customerId: "cust-001" }],
    ]);

    const domainCache = new Map([["meridian.com", "cust-meridian"]]);

    const results = await resolveEmails(
      [
        "david@democompany.com",
        "yael@atlas-defense.com",
        "someone@meridian.com",
        "unknown@example.com",
      ],
      { tenantId: TENANT_ID, domainCache }
    );

    expect(results.size).toBe(4);

    const david = results.get("david@democompany.com")!;
    expect(david.isInternal).toBe(true);
    expect(david.employeeId).toBe("emp-001");

    const yael = results.get("yael@atlas-defense.com")!;
    expect(yael.contactId).toBe("contact-001");
    expect(yael.customerId).toBe("cust-001");

    const meridian = results.get("someone@meridian.com")!;
    expect(meridian.customerId).toBe("cust-meridian");
    expect(meridian.contactId).toBeNull();

    const unknown = results.get("unknown@example.com")!;
    expect(unknown.isInternal).toBe(false);
    expect(unknown.contactId).toBeNull();
    expect(unknown.customerId).toBeNull();
  });

  it("deduplicates emails", async () => {
    setupDbMockNoLimit([
      [{ id: "emp-001", email: "david@democompany.com" }],
      [],
    ]);

    const results = await resolveEmails(
      ["david@democompany.com", "DAVID@DEMOCOMPANY.COM", "david@democompany.com"],
      { tenantId: TENANT_ID }
    );

    // Should only have 1 unique entry
    expect(results.size).toBe(1);
    expect(results.get("david@democompany.com")!.employeeId).toBe("emp-001");
  });

  it("returns empty map for empty input", async () => {
    const results = await resolveEmails([], { tenantId: TENANT_ID });
    expect(results.size).toBe(0);
  });
});

// ─── buildDomainCache ───────────────────────────────────────────────────────

describe("buildDomainCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds cache from contact emails", async () => {
    setupDbMockNoLimit([
      [
        { email: "yael@atlas-defense.com", customerId: "cust-001" },
        { email: "moshe@atlas-defense.com", customerId: "cust-001" },
        { email: "shira@meridian.com", customerId: "cust-002" },
      ],
    ]);

    const cache = await buildDomainCache(TENANT_ID);

    expect(cache.get("atlas-defense.com")).toBe("cust-001");
    expect(cache.get("meridian.com")).toBe("cust-002");
  });

  it("excludes domains shared by multiple customers", async () => {
    setupDbMockNoLimit([
      [
        { email: "user1@shared-domain.com", customerId: "cust-001" },
        { email: "user2@shared-domain.com", customerId: "cust-002" },
        { email: "yael@atlas-defense.com", customerId: "cust-001" },
      ],
    ]);

    const cache = await buildDomainCache(TENANT_ID);

    expect(cache.has("shared-domain.com")).toBe(false);
    expect(cache.get("atlas-defense.com")).toBe("cust-001");
  });

  it("excludes free email providers (gmail, yahoo, etc.)", async () => {
    setupDbMockNoLimit([
      [
        { email: "contact@gmail.com", customerId: "cust-001" },
        { email: "contact@yahoo.com", customerId: "cust-002" },
        { email: "yael@atlas-defense.com", customerId: "cust-001" },
      ],
    ]);

    const cache = await buildDomainCache(TENANT_ID);

    expect(cache.has("gmail.com")).toBe(false);
    expect(cache.has("yahoo.com")).toBe(false);
    expect(cache.get("atlas-defense.com")).toBe("cust-001");
  });

  it("handles contacts with null emails", async () => {
    setupDbMockNoLimit([
      [
        { email: null, customerId: "cust-001" },
        { email: "yael@atlas-defense.com", customerId: "cust-001" },
      ],
    ]);

    const cache = await buildDomainCache(TENANT_ID);

    expect(cache.size).toBe(1);
    expect(cache.get("atlas-defense.com")).toBe("cust-001");
  });

  it("handles Israeli free email providers", async () => {
    setupDbMockNoLimit([
      [
        { email: "user@walla.co.il", customerId: "cust-001" },
        { email: "user@012.net.il", customerId: "cust-002" },
        { email: "user@bezeqint.net", customerId: "cust-003" },
      ],
    ]);

    const cache = await buildDomainCache(TENANT_ID);

    expect(cache.has("walla.co.il")).toBe(false);
    expect(cache.has("012.net.il")).toBe(false);
    expect(cache.has("bezeqint.net")).toBe(false);
  });
});
