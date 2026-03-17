import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { tenants, customers, events, signals, interactions } from "../db/schema.js";
import { sql, eq, gt, count } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  // Basic health check
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed system status (per tenant)
  app.get("/health/detailed", async (request, reply) => {
    const tenantId = (request.query as any).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });

    const checks: Record<string, string> = {};
    const stats: Record<string, unknown> = {};

    // DB check
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Tenant exists
    const tenantRow = await db
      .select({ id: tenants.id, config: tenants.config })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenantRow.length === 0) {
      return reply.status(404).send({ error: "Tenant not found" });
    }

    checks.tenant = "ok";
    const config = tenantRow[0].config as Record<string, unknown>;
    stats.lastSfSync = config?.lastSfSyncAt ?? null;

    // Counts
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [custCount] = await db.select({ n: count() }).from(customers).where(eq(customers.tenantId, tenantId));
    const [eventsLast24h] = await db.select({ n: count() }).from(events).where(
      sql`${events.tenantId} = ${tenantId} AND ${events.createdAt} > ${last24h}`
    );
    const [signalsLast24h] = await db.select({ n: count() }).from(signals).where(
      sql`${signals.tenantId} = ${tenantId} AND ${signals.createdAt} > ${last24h}`
    );
    const [signalsLast7d] = await db.select({ n: count() }).from(signals).where(
      sql`${signals.tenantId} = ${tenantId} AND ${signals.createdAt} > ${last7d}`
    );
    const [interactionsLast24h] = await db.select({ n: count() }).from(interactions).where(
      sql`${interactions.tenantId} = ${tenantId} AND ${interactions.createdAt} > ${last24h}`
    );

    stats.customers = custCount.n;
    stats.eventsLast24h = eventsLast24h.n;
    stats.signalsLast24h = signalsLast24h.n;
    stats.signalsLast7d = signalsLast7d.n;
    stats.interactionsLast24h = interactionsLast24h.n;

    // Sync health
    if (stats.lastSfSync) {
      const lastSync = new Date(stats.lastSfSync as string);
      const minutesSinceSync = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60));
      stats.minutesSinceLastSync = minutesSinceSync;
      checks.sfSync = minutesSinceSync < 30 ? "ok" : minutesSinceSync < 60 ? "stale" : "overdue";
    } else {
      checks.sfSync = "never_synced";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? "healthy" : "degraded",
      checks,
      stats,
      timestamp: now.toISOString(),
    });
  });
}
