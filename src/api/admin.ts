import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { customers, signals, events, employees, contacts } from "../db/schema.js";
import { eq, desc, count } from "drizzle-orm";

export async function adminRoutes(app: FastifyInstance) {
  // List all customers for a tenant
  app.get("/api/admin/customers", async (request, reply) => {
    const tenantId = (request.query as any).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });

    const result = await db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, tenantId))
      .orderBy(desc(customers.updatedAt));

    return result;
  });

  // Get single customer with full detail
  app.get("/api/admin/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = (request.query as any).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });

    const customer = await db.query.customers.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.tenantId, tenantId)),
    });

    if (!customer) return reply.status(404).send({ error: "not found" });

    const customerContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.customerId, id));

    return { ...customer, contacts: customerContacts };
  });

  // List signals
  app.get("/api/admin/signals", async (request, reply) => {
    const tenantId = (request.query as any).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });

    const result = await db
      .select()
      .from(signals)
      .where(eq(signals.tenantId, tenantId))
      .orderBy(desc(signals.createdAt))
      .limit(100);

    return result;
  });

  // Sync status overview
  app.get("/api/admin/sync-status", async (request, reply) => {
    const tenantId = (request.query as any).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });

    const [customerCount] = await db
      .select({ count: count() })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));

    const [contactCount] = await db
      .select({ count: count() })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId));

    const [employeeCount] = await db
      .select({ count: count() })
      .from(employees)
      .where(eq(employees.tenantId, tenantId));

    const [eventCount] = await db
      .select({ count: count() })
      .from(events)
      .where(eq(events.tenantId, tenantId));

    const [signalCount] = await db
      .select({ count: count() })
      .from(signals)
      .where(eq(signals.tenantId, tenantId));

    return {
      customers: customerCount.count,
      contacts: contactCount.count,
      employees: employeeCount.count,
      events: eventCount.count,
      signals: signalCount.count,
    };
  });
}
