/**
 * Simulate script — runs the full signal engine pipeline against seed data.
 *
 * Detects events across all seeded customers, builds context, and runs
 * agent logic (without Claude API calls).
 *
 * Usage: npm run simulate  (or: npx tsx scripts/simulate.ts)
 * Requires: seeded database (npm run seed) + DATABASE_URL env var.
 */

import { db } from "../src/db/index.js";
import {
  tenants, customers, contacts, interactions, tickets, deals, events, signals, employees,
} from "../src/db/schema.js";
import { eq, count } from "drizzle-orm";
import { detectEvents, type DetectedEvent, EventType } from "../src/engine/event-detector.js";
import { buildContext } from "../src/engine/context-builder.js";
import { determineBriefType } from "../src/agents/preparation.js";
import { assessSeverity, type RiskCategory } from "../src/agents/risk.js";
import { checkSuppression } from "../src/agents/opportunity.js";
import { isWithinDeliveryHours } from "../src/delivery/router.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severity(s: string): string {
  const colors: Record<string, string> = {
    critical: "\x1b[31m●\x1b[0m",
    high: "\x1b[33m●\x1b[0m",
    medium: "\x1b[36m●\x1b[0m",
    low: "\x1b[90m●\x1b[0m",
  };
  return `${colors[s] ?? "○"} ${s}`;
}

function header(text: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"═".repeat(60)}`);
}

function section(text: string) {
  console.log(`\n── ${text} ${"─".repeat(Math.max(0, 55 - text.length))}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function simulate() {
  header("Signal AI — Simulation Engine");
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Delivery hours: ${isWithinDeliveryHours() ? "YES (within window)" : "NO (quiet hours)"}`);

  // 1. Find tenant
  const tenantRows = await db.select().from(tenants).limit(1);
  if (tenantRows.length === 0) {
    console.error("\n  No tenants found. Run 'npm run seed' first.");
    process.exit(1);
  }
  const tenant = tenantRows[0];
  const tenantId = tenant.id;
  console.log(`  Tenant: ${tenant.name} (${tenantId})`);

  // 2. Data summary
  section("Data Summary");
  const [custCount] = await db.select({ n: count() }).from(customers).where(eq(customers.tenantId, tenantId));
  const [contCount] = await db.select({ n: count() }).from(contacts).where(eq(contacts.tenantId, tenantId));
  const [empCount] = await db.select({ n: count() }).from(employees).where(eq(employees.tenantId, tenantId));
  const [intCount] = await db.select({ n: count() }).from(interactions).where(eq(interactions.tenantId, tenantId));
  const [tickCount] = await db.select({ n: count() }).from(tickets).where(eq(tickets.tenantId, tenantId));
  const [dealCount] = await db.select({ n: count() }).from(deals).where(eq(deals.tenantId, tenantId));

  console.log(`  Customers:    ${custCount.n}`);
  console.log(`  Contacts:     ${contCount.n}`);
  console.log(`  Employees:    ${empCount.n}`);
  console.log(`  Interactions: ${intCount.n}`);
  console.log(`  Tickets:      ${tickCount.n}`);
  console.log(`  Deals:        ${dealCount.n}`);

  // 3. Customer overview
  section("Customer Health Overview");
  const allCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(customers.healthScore);

  for (const c of allCustomers) {
    const renewalDays = c.renewalDate
      ? Math.floor((new Date(c.renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    const renewalStr = renewalDays != null ? `renewal in ${renewalDays}d` : "no renewal";
    const hs = c.healthScore ?? 50;
    const bar = "█".repeat(Math.round(hs / 10)) + "░".repeat(10 - Math.round(hs / 10));

    console.log(
      `  ${c.name.padEnd(28)} [${bar}] ${String(hs).padStart(3)}/100  ${(c.tier ?? "medium").padEnd(6)}  $${(c.arr ?? "-").padStart(7)}  ${renewalStr}`
    );
  }

  // 4. Event detection
  section("Event Detection");
  console.log("  Running detectors...");

  let detectedEvents: DetectedEvent[] = [];
  try {
    detectedEvents = await detectEvents({ tenantId });
    console.log(`  Detected ${detectedEvents.length} events`);

    const byType = new Map<string, DetectedEvent[]>();
    for (const event of detectedEvents) {
      const list = byType.get(event.type) ?? [];
      list.push(event);
      byType.set(event.type, list);
    }

    for (const [type, evts] of byType) {
      console.log(`\n  ${type} (${evts.length}):`);
      for (const e of evts.slice(0, 5)) {
        const custName = (e.data.customerName as string) ?? e.customerId ?? "unknown";
        const details = Object.entries(e.data)
          .filter(([k]) => k !== "customerName")
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        console.log(`    → ${custName}: ${details}`);
      }
      if (evts.length > 5) console.log(`    ... and ${evts.length - 5} more`);
    }
  } catch (err) {
    console.log(`  Event detection error: ${(err as Error).message}`);
  }

  // 5. Context building for at-risk customers
  section("Context Building (at-risk customers)");
  const atRisk = allCustomers.filter((c) => (c.healthScore ?? 50) < 50).slice(0, 3);

  for (const c of atRisk) {
    try {
      const ctx = await buildContext({ tenantId, customerId: c.id, interactionLimit: 5, signalLimit: 3 });
      console.log(`\n  ${ctx.customer.name}:`);
      console.log(`    Contacts: ${ctx.contacts.length}  Interactions: ${ctx.recentInteractions.length}  Tickets: ${ctx.openTickets.length}  Deals: ${ctx.activeDeals.length}`);
      console.log(`    CSM: ${ctx.csm?.name ?? "unassigned"}  AE: ${ctx.ae?.name ?? "unassigned"}`);

      // Risk assessment for events on this customer
      const customerEvents = detectedEvents.filter((e) => e.customerId === c.id);
      for (const event of customerEvents.slice(0, 3)) {
        const category = eventToRiskCategory(event.type);
        if (category) {
          const sev = assessSeverity(category, ctx, event.data);
          console.log(`    Risk: ${event.type} → ${severity(sev)}`);
        }
      }

      // Opportunity suppression check
      const suppression = await checkSuppression(tenantId, c.id, "expansion", ctx);
      console.log(`    Opportunity suppressed: ${suppression.suppressed}${suppression.reason ? ` (${suppression.reason})` : ""}`);
    } catch (err) {
      console.log(`  Context build failed for ${c.name}: ${(err as Error).message}`);
    }
  }

  // 6. Meeting prep readiness
  section("Meeting Prep Timing");
  const now = new Date();
  const times = [
    { label: "In 1 hour", date: new Date(now.getTime() + 1 * 60 * 60 * 1000) },
    { label: "In 3 hours", date: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
    { label: "In 12 hours", date: new Date(now.getTime() + 12 * 60 * 60 * 1000) },
    { label: "In 24 hours", date: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    { label: "In 48 hours", date: new Date(now.getTime() + 48 * 60 * 60 * 1000) },
  ];
  for (const t of times) {
    const briefType = determineBriefType(t.date, now);
    console.log(`    ${t.label.padEnd(15)} → ${briefType ?? "no brief needed"}`);
  }

  // 7. Summary
  section("DB Totals");
  const [existingSignals] = await db.select({ n: count() }).from(signals).where(eq(signals.tenantId, tenantId));
  const [existingEvents] = await db.select({ n: count() }).from(events).where(eq(events.tenantId, tenantId));
  console.log(`  Events in DB: ${existingEvents.n}  Signals in DB: ${existingSignals.n}`);

  header("Simulation Complete");
  console.log(`  ${detectedEvents.length} events detected, ${atRisk.length} at-risk customers analyzed`);
  console.log(`  Pipeline operational (Claude API calls skipped)\n`);

  process.exit(0);
}

function eventToRiskCategory(type: EventType): RiskCategory | null {
  const map: Partial<Record<EventType, RiskCategory>> = {
    [EventType.USAGE_DECLINE]: "usage_decline",
    [EventType.CONTACT_GAP]: "contact_gap",
    [EventType.TICKET_AGED]: "ticket_aging",
    [EventType.TICKET_CRITICAL]: "ticket_aging",
    [EventType.SENTIMENT_CHANGE]: "sentiment_drop",
    [EventType.COMPETITOR_MENTION]: "competitor_threat",
    [EventType.RENEWAL_APPROACHING]: "renewal_risk",
  };
  return map[type] ?? null;
}

simulate().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
