/**
 * Unit tests for the entity resolution engine.
 *
 * Entity resolution is the most critical logic in the system — it maps raw
 * email addresses to employees, contacts, and customers.
 */

import { describe, it, vi, expect, beforeEach } from "vitest";

// TODO: uncomment once the module exists
// import { resolveEmail } from "../../src/engine/entity-resolver.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock the database module so tests run without a real Postgres connection.
vi.mock("../../src/db/index.js", () => ({
  db: {
    query: {
      employees: { findFirst: vi.fn() },
      contacts: { findFirst: vi.fn() },
    },
  },
}));

// ─── resolveEmail ───────────────────────────────────────────────────────────

describe("resolveEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve a known employee email", async () => {
    // TODO: mock db.query.employees.findFirst to return an employee
    // TODO: call resolveEmail(tenantId, "david@democompany.com")
    // TODO: assert result contains { employee } and no contact/customer
  });

  it("should resolve a known contact email and return the associated customer", async () => {
    // TODO: mock db.query.contacts.findFirst to return a contact with customer
    // TODO: call resolveEmail(tenantId, "shira.gold@meridianpharma.com")
    // TODO: assert result contains { contact, customer }
  });

  it("should return empty for an unknown email address", async () => {
    // TODO: mock both findFirst to return undefined
    // TODO: call resolveEmail(tenantId, "unknown@example.com")
    // TODO: assert result is empty {}
  });

  it("should detect internal-only interactions (employee-to-employee)", async () => {
    // TODO: resolve two addresses that are both employees
    // TODO: assert that the interaction would be classified as internal
    // This test validates the rule: if all participants are employees → skip
  });
});
