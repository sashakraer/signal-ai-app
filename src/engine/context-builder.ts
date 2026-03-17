import { eq, and, desc, sql, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  customers,
  contacts,
  interactions,
  tickets,
  deals,
  signals,
  employees,
} from "../db/schema.js";

// ─── MiniContext360 ──────────────────────────────────────────────────────────

export interface MiniContext360 {
  customer: {
    id: string;
    name: string;
    segment: string | null;
    arr: string | null;
    tier: string;
    healthScore: number;
    renewalDate: string | null;
    fiscalYearEnd: string | null;
    products: string[];
    signalThesis: string | null;
  };
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    influence: string | null;
    lastInteractionAt: string | null;
    sentimentBaseline: number;
  }>;
  recentInteractions: Array<{
    id: string;
    type: string;
    direction: string;
    occurredAt: string;
    subject: string | null;
    sentiment: number | null;
    employeeName: string | null;
  }>;
  openTickets: Array<{
    id: string;
    subject: string;
    priority: string;
    status: string;
    openedAt: string;
    ageDays: number;
  }>;
  activeDeals: Array<{
    id: string;
    name: string;
    amount: string | null;
    stage: string;
    closeDate: string;
    type: string | null;
  }>;
  recentSignals: Array<{
    id: string;
    type: string;
    agent: string;
    title: string;
    sentAt: string | null;
    feedback: string | null;
  }>;
  csm: { id: string; name: string; email: string } | null;
  ae: { id: string; name: string; email: string } | null;
}

export interface ContextBuildOptions {
  tenantId: string;
  customerId: string;
  interactionLimit?: number;
  signalLimit?: number;
  includeBodyText?: boolean;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a MiniContext360 snapshot for a customer.
 * Queries are parallelized for performance.
 */
export async function buildContext(
  options: ContextBuildOptions
): Promise<MiniContext360> {
  const {
    tenantId,
    customerId,
    interactionLimit = 20,
    signalLimit = 10,
  } = options;

  const now = new Date();

  const [customerRow, contactRows, interactionRows, ticketRows, dealRows, signalRows] =
    await Promise.all([
      db.select().from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .limit(1),

      db.select({
        id: contacts.id, name: contacts.name, title: contacts.title,
        influence: contacts.influence, lastInteractionAt: contacts.lastInteractionAt,
        sentimentBaseline: contacts.sentimentBaseline,
      }).from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.customerId, customerId))),

      db.select({
        id: interactions.id, type: interactions.type, direction: interactions.direction,
        occurredAt: interactions.occurredAt, subject: interactions.subject,
        sentiment: interactions.sentiment, employeeId: interactions.employeeId,
      }).from(interactions)
        .where(and(eq(interactions.tenantId, tenantId), eq(interactions.customerId, customerId)))
        .orderBy(desc(interactions.occurredAt))
        .limit(interactionLimit),

      db.select({
        id: tickets.id, subject: tickets.subject, priority: tickets.priority,
        status: tickets.status, openedAt: tickets.openedAt,
      }).from(tickets)
        .where(and(
          eq(tickets.tenantId, tenantId), eq(tickets.customerId, customerId),
          ne(tickets.status, "closed")
        )),

      db.select({
        id: deals.id, name: deals.name, amount: deals.amount,
        stage: deals.stage, closeDate: deals.closeDate, type: deals.type,
      }).from(deals)
        .where(and(
          eq(deals.tenantId, tenantId), eq(deals.customerId, customerId),
          ne(deals.stage, "Closed Won"), ne(deals.stage, "Closed Lost")
        )),

      db.select({
        id: signals.id, type: signals.type, agent: signals.agent,
        title: signals.title, sentAt: signals.sentAt, feedback: signals.feedback,
      }).from(signals)
        .where(and(eq(signals.tenantId, tenantId), eq(signals.customerId, customerId)))
        .orderBy(desc(signals.createdAt))
        .limit(signalLimit),
    ]);

  if (customerRow.length === 0) {
    throw new Error(`Customer ${customerId} not found for tenant ${tenantId}`);
  }

  const cust = customerRow[0];

  // Gather employee IDs for name lookup
  const employeeIds = new Set<string>();
  if (cust.csmEmployeeId) employeeIds.add(cust.csmEmployeeId);
  if (cust.aeEmployeeId) employeeIds.add(cust.aeEmployeeId);
  for (const i of interactionRows) {
    if (i.employeeId) employeeIds.add(i.employeeId);
  }

  const employeeMap = new Map<string, { id: string; name: string; email: string }>();
  if (employeeIds.size > 0) {
    const ids = [...employeeIds];
    const empRows = await db
      .select({ id: employees.id, name: employees.name, email: employees.email })
      .from(employees)
      .where(eq(employees.tenantId, tenantId));

    for (const emp of empRows) {
      if (ids.includes(emp.id)) {
        employeeMap.set(emp.id, emp);
      }
    }
  }

  return {
    customer: {
      id: cust.id,
      name: cust.name,
      segment: cust.segment,
      arr: cust.arr,
      tier: cust.tier ?? "medium",
      healthScore: cust.healthScore ?? 50,
      renewalDate: cust.renewalDate,
      fiscalYearEnd: cust.fiscalYearEnd,
      products: (cust.products as string[]) ?? [],
      signalThesis: cust.signalThesis,
    },
    contacts: contactRows.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      influence: c.influence,
      lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
      sentimentBaseline: c.sentimentBaseline ?? 0,
    })),
    recentInteractions: interactionRows.map((i) => ({
      id: i.id,
      type: i.type,
      direction: i.direction ?? "unknown",
      occurredAt: i.occurredAt.toISOString(),
      subject: i.subject,
      sentiment: i.sentiment,
      employeeName: i.employeeId ? (employeeMap.get(i.employeeId)?.name ?? null) : null,
    })),
    openTickets: ticketRows.map((t) => ({
      id: t.id,
      subject: t.subject,
      priority: t.priority ?? "medium",
      status: t.status ?? "open",
      openedAt: t.openedAt.toISOString(),
      ageDays: Math.floor((now.getTime() - t.openedAt.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    activeDeals: dealRows.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      stage: d.stage ?? "unknown",
      closeDate: d.closeDate ?? "",
      type: d.type,
    })),
    recentSignals: signalRows.map((s) => ({
      id: s.id,
      type: s.type,
      agent: s.agent,
      title: s.title,
      sentAt: s.sentAt?.toISOString() ?? null,
      feedback: s.feedback,
    })),
    csm: cust.csmEmployeeId ? (employeeMap.get(cust.csmEmployeeId) ?? null) : null,
    ae: cust.aeEmployeeId ? (employeeMap.get(cust.aeEmployeeId) ?? null) : null,
  };
}

/**
 * Build a lightweight context (no interactions/signals).
 */
export async function buildLightContext(
  tenantId: string,
  customerId: string
): Promise<Pick<MiniContext360, "customer" | "csm" | "ae">> {
  const ctx = await buildContext({ tenantId, customerId, interactionLimit: 0, signalLimit: 0 });
  return { customer: ctx.customer, csm: ctx.csm, ae: ctx.ae };
}
