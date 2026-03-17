import { eq, and, lt, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { tenants, employees, events, signals, customers, interactions } from "./db/schema.js";
import { logger } from "./lib/logger.js";
import {
  createWorker,
  syncSalesforceQueue,
  syncEmailQueue,
  processEventQueue,
  sendSignalQueue,
  syncCalendarQueue,
  collisionDetectionQueue,
  escalationCheckQueue,
} from "./lib/queue.js";
import { runSync, type SyncOptions } from "./adapters/salesforce/sync.js";
import { syncMail } from "./adapters/microsoft/mail.js";
import { syncCalendar, getUpcomingMeetings } from "./adapters/microsoft/calendar.js";
import type { MsGraphCredentials } from "./adapters/microsoft/client.js";
import type { SalesforceCredentials } from "./adapters/salesforce/client.js";
import { detectEvents, EventType } from "./engine/event-detector.js";
import { buildContext } from "./engine/context-builder.js";
import { resolveEmails } from "./engine/entity-resolver.js";
import { preparationAgent } from "./agents/preparation.js";
import { riskAgent } from "./agents/risk.js";
import { coordinationAgent } from "./agents/coordination.js";
import { opportunityAgent } from "./agents/opportunity.js";
import { checkForCollision } from "./agents/coordination.js";
import type { AgentDefinition } from "./agents/types.js";
import { routeSignal, type RecipientInfo } from "./delivery/router.js";
import { sendEmail, formatSignalEmail } from "./delivery/email.js";
import { deliverViaWhatsApp } from "./delivery/whatsapp.js";

// ─── Agent Registry ──────────────────────────────────────────────────────────

const ALL_AGENTS: AgentDefinition[] = [
  preparationAgent,
  riskAgent,
  coordinationAgent,
  opportunityAgent,
];

function findAgentForEvent(eventType: string): AgentDefinition | undefined {
  return ALL_AGENTS.find((a) => a.handles.includes(eventType));
}

// ─── Job Processors ──────────────────────────────────────────────────────────

const syncSalesforceWorker = createWorker("sync-salesforce", async (job) => {
  const log = logger.child({ job: "sf-sync" });

  // Fetch all tenants with SF credentials
  const allTenants = await db.select().from(tenants);
  const sfTenants = allTenants.filter((t) => t.sfCredentials);

  for (const tenant of sfTenants) {
    try {
      const creds = tenant.sfCredentials as SalesforceCredentials;
      const result = await runSync({
        tenantId: tenant.id,
        credentials: creds,
      });

      log.info(
        { tenantId: tenant.id, ...result },
        "SF sync completed for tenant"
      );

      // After sync, run event detection
      await processEventQueue.add("detect-events", {
        tenantId: tenant.id,
        trigger: "sf-sync",
      });
    } catch (err) {
      log.error(
        { tenantId: tenant.id, error: (err as Error).message },
        "SF sync failed for tenant"
      );
    }
  }
});

const syncEmailWorker = createWorker("sync-email", async (job) => {
  const log = logger.child({ job: "email-sync" });

  const allTenants = await db.select().from(tenants);
  const msTenants = allTenants.filter((t) => t.msCredentials);

  for (const tenant of msTenants) {
    try {
      const creds = tenant.msCredentials as MsGraphCredentials;
      const config = tenant.config as Record<string, unknown>;
      const internalDomains = (config?.internalDomains as string[]) ?? [];

      // Get monitored employees with MS user IDs
      const monitoredEmployees = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.tenantId, tenant.id),
            eq(employees.isMonitored, true)
          )
        );

      const msEmployees = monitoredEmployees.filter((e) => e.msUserId);
      if (msEmployees.length === 0) continue;

      const result = await syncMail({
        tenantId: tenant.id,
        credentials: creds,
        userIds: msEmployees.map((e) => e.msUserId!),
        userEmails: msEmployees.map((e) => e.email),
        internalDomains,
        deltaToken: (config?.lastMailDeltaToken as string) ?? undefined,
      });

      log.info(
        { tenantId: tenant.id, messages: result.messages },
        "Mail sync completed for tenant"
      );

      // After sync, run event detection
      await processEventQueue.add("detect-events", {
        tenantId: tenant.id,
        trigger: "mail-sync",
      });
    } catch (err) {
      log.error(
        { tenantId: tenant.id, error: (err as Error).message },
        "Mail sync failed for tenant"
      );
    }
  }
});

const processEventWorker = createWorker("process-event", async (job) => {
  const { tenantId, eventId, trigger, eventData } = job.data;
  const log = logger.child({ job: "process-event", tenantId, eventId, trigger });

  // Inline event data (e.g., from calendar scan)
  if (eventData) {
    const agent = findAgentForEvent(eventData.type);
    if (!agent) return;

    try {
      const context = await buildContext({
        tenantId,
        customerId: eventData.customerId,
      });

      const signalOutputs = await agent.process(eventData, context);
      for (const signal of signalOutputs) {
        await sendSignalQueue.add("deliver-signal", { signal, tenantId });
      }
      log.info({ eventType: eventData.type, signals: signalOutputs.length }, "Inline event processed");
    } catch (err) {
      log.error({ error: (err as Error).message }, "Inline event processing failed");
    }
    return;
  }

  if (eventId) {
    // Process a specific event
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, tenantId)))
      .limit(1);

    if (!event || event.processed) return;

    const agent = findAgentForEvent(event.type);
    if (!agent) {
      log.warn({ eventType: event.type }, "No agent handles this event type");
      await markEventProcessed(eventId);
      return;
    }

    try {
      const context = await buildContext({
        tenantId,
        customerId: event.customerId!,
      });

      const detectedEvent = {
        type: event.type as any,
        tenantId,
        customerId: event.customerId,
        occurredAt: event.occurredAt,
        source: event.source ?? "system",
        data: event.data as Record<string, unknown>,
      };

      const signalOutputs = await agent.process(detectedEvent, context);

      for (const signal of signalOutputs) {
        await sendSignalQueue.add("deliver-signal", {
          signal,
          tenantId,
        });
      }

      await markEventProcessed(eventId);
      log.info(
        { signals: signalOutputs.length },
        "Event processed"
      );
    } catch (err) {
      log.error({ error: (err as Error).message }, "Event processing failed");
      throw err; // Let BullMQ handle retry
    }
  } else {
    // Run full event detection scan (from cron or sync trigger)
    log.info("Running event detection scan");

    try {
      const detected = await detectEvents({ tenantId });
      log.info({ count: detected.length }, "Events detected");

      // Process each new event via agent
      for (const event of detected) {
        const agent = findAgentForEvent(event.type);
        if (!agent) continue;

        try {
          const context = event.customerId
            ? await buildContext({ tenantId, customerId: event.customerId })
            : null;

          if (!context) continue;

          const signalOutputs = await agent.process(event, context);

          for (const signal of signalOutputs) {
            await sendSignalQueue.add("deliver-signal", {
              signal,
              tenantId,
            });
          }
        } catch (err) {
          log.error(
            { eventType: event.type, customerId: event.customerId, error: (err as Error).message },
            "Agent processing failed for event"
          );
        }
      }
    } catch (err) {
      log.error({ error: (err as Error).message }, "Event detection scan failed");
      throw err;
    }
  }
});

const sendSignalWorker = createWorker("send-signal", async (job) => {
  const { signal, tenantId } = job.data;
  const log = logger.child({ job: "send-signal", tenantId });

  // Look up the recipient employee
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, signal.recipientEmployeeId))
    .limit(1);

  if (!employee) {
    log.warn({ employeeId: signal.recipientEmployeeId }, "Recipient employee not found");
    return;
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenantConfig = (tenant?.config as Record<string, unknown>) ?? {};

  const recipient: RecipientInfo = {
    employeeId: employee.id,
    email: employee.email,
    phone: employee.waPhone,
    timezone: (tenantConfig.timezone as string) ?? "UTC",
    preferredChannel: employee.waPhone ? "whatsapp" : "email",
  };

  // Route the signal (persist, check suppression/rate-limit/quiet hours)
  const result = await routeSignal(signal, recipient);

  if (result.status !== "sent") {
    log.info({ status: result.status, signalId: result.signalId }, "Signal not delivered");
    return;
  }

  // Actually deliver
  try {
    if (recipient.preferredChannel === "whatsapp" && recipient.phone && tenant?.waConfig) {
      await deliverViaWhatsApp({
        phone: recipient.phone,
        title: signal.title,
        body: signal.body,
        severity: signal.severity,
        customerName: signal.contextSnapshot?.customer?.name ?? "Unknown",
        waConfig: tenant.waConfig as any,
      });
    } else {
      // Email delivery via Microsoft Graph
      const msCreds = tenant?.msCredentials as MsGraphCredentials | null;
      if (msCreds) {
        const formatted = formatSignalEmail(
          signal.title,
          signal.body,
          signal.recommendation,
          signal.severity,
          signal.contextSnapshot?.customer?.name ?? "Unknown"
        );
        await sendEmail(
          {
            to: employee.email,
            subject: formatted.subject,
            htmlBody: formatted.htmlBody,
            textBody: formatted.textBody,
            senderUserId: (tenantConfig.signalSenderUserId as string) ?? "me",
          },
          msCreds
        );
      } else {
        log.warn("No MS credentials for email delivery");
      }
    }

    log.info({ signalId: result.signalId, channel: recipient.preferredChannel }, "Signal delivered");
  } catch (err) {
    log.error(
      { signalId: result.signalId, error: (err as Error).message },
      "Signal delivery failed"
    );
    // Mark as failed
    await db
      .update(signals)
      .set({ sentAt: null })
      .where(eq(signals.id, result.signalId));
  }
});

// ─── Calendar Sync + Meeting Prep Trigger ─────────────────────────────────────

const syncCalendarWorker = createWorker("sync-calendar", async (job) => {
  const log = logger.child({ job: "calendar-sync" });

  const allTenants = await db.select().from(tenants);
  const msTenants = allTenants.filter((t) => t.msCredentials);

  for (const tenant of msTenants) {
    try {
      const creds = tenant.msCredentials as MsGraphCredentials;
      const config = tenant.config as Record<string, unknown>;
      const internalDomains = (config?.internalDomains as string[]) ?? [];

      const monitoredEmployees = await db
        .select()
        .from(employees)
        .where(
          and(eq(employees.tenantId, tenant.id), eq(employees.isMonitored, true))
        );

      const msEmployees = monitoredEmployees.filter((e) => e.msUserId);
      if (msEmployees.length === 0) continue;

      // Sync calendar events for the next 48 hours
      const now = new Date();
      const endDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      await syncCalendar({
        tenantId: tenant.id,
        credentials: creds,
        userIds: msEmployees.map((e) => e.msUserId!),
        userEmails: msEmployees.map((e) => e.email),
        internalDomains,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Scan for upcoming meetings that need briefs
      for (const emp of msEmployees) {
        try {
          const meetings = await getUpcomingMeetings(
            emp.msUserId!,
            emp.email,
            creds,
            internalDomains,
            48 // 48-hour window
          );

          for (const meeting of meetings) {
            // Resolve attendees to find the customer
            const resolved = await resolveEmails(
              meeting.attendeeEmails,
              { tenantId: tenant.id }
            );

            // Find first resolved customer from the map
            let customerMatch: { customerId: string } | null = null;
            for (const [, entity] of resolved) {
              if (entity.customerId) {
                customerMatch = { customerId: entity.customerId };
                break;
              }
            }
            if (!customerMatch) continue;

            // Emit MEETING_SCHEDULED event for the Preparation Agent
            await processEventQueue.add("meeting-prep", {
              tenantId: tenant.id,
              trigger: "calendar-scan",
              eventData: {
                type: EventType.MEETING_SCHEDULED,
                tenantId: tenant.id,
                customerId: customerMatch.customerId,
                occurredAt: new Date(),
                source: "calendar",
                data: {
                  startTime: meeting.startTime.toISOString(),
                  endTime: meeting.endTime.toISOString(),
                  subject: meeting.subject,
                  employeeId: emp.id,
                  attendeeEmails: meeting.attendeeEmails,
                  customerName: meeting.subject,
                },
              },
            });
          }
        } catch (err) {
          log.error(
            { employeeId: emp.id, error: (err as Error).message },
            "Failed to scan meetings for employee"
          );
        }
      }

      log.info({ tenantId: tenant.id }, "Calendar sync + meeting scan completed");
    } catch (err) {
      log.error(
        { tenantId: tenant.id, error: (err as Error).message },
        "Calendar sync failed"
      );
    }
  }
});

// ─── Collision Detection ──────────────────────────────────────────────────────

const collisionDetectionWorker = createWorker("collision-detection", async (job) => {
  const log = logger.child({ job: "collision-detection" });

  const allTenants = await db.select().from(tenants);

  for (const tenant of allTenants) {
    try {
      const allCustomers = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(eq(customers.tenantId, tenant.id));

      const monitoredEmployees = await db
        .select()
        .from(employees)
        .where(
          and(eq(employees.tenantId, tenant.id), eq(employees.isMonitored, true))
        );

      let collisionCount = 0;

      for (const customer of allCustomers) {
        for (const emp of monitoredEmployees) {
          const collision = await checkForCollision(
            tenant.id,
            emp.id,
            customer.id,
            null
          );

          if (collision) {
            collisionCount++;

            // Build context and trigger the coordination agent
            try {
              const context = await buildContext({
                tenantId: tenant.id,
                customerId: customer.id,
              });

              const collisionEvent = {
                type: EventType.COLLISION,
                tenantId: tenant.id,
                customerId: customer.id,
                occurredAt: new Date(),
                source: "collision-scan",
                data: collision as unknown as Record<string, unknown>,
              };

              const signalOutputs = await coordinationAgent.process(
                collisionEvent,
                context
              );

              for (const signal of signalOutputs) {
                await sendSignalQueue.add("deliver-signal", {
                  signal,
                  tenantId: tenant.id,
                });
              }
            } catch (err) {
              log.error(
                { customerId: customer.id, error: (err as Error).message },
                "Failed to process collision"
              );
            }

            // Only need to detect collision once per customer
            break;
          }
        }
      }

      log.info(
        { tenantId: tenant.id, collisions: collisionCount },
        "Collision detection completed"
      );
    } catch (err) {
      log.error(
        { tenantId: tenant.id, error: (err as Error).message },
        "Collision detection failed"
      );
    }
  }
});

// ─── Escalation Timer Checker ─────────────────────────────────────────────────

const escalationCheckWorker = createWorker("escalation-check", async (job) => {
  const log = logger.child({ job: "escalation-check" });

  // Find signals past their escalation deadline that haven't been escalated or acted on
  const overdueSignals = await db
    .select()
    .from(signals)
    .where(
      and(
        lt(signals.escalationDueAt, new Date()),
        eq(signals.escalated, false),
        eq(signals.actedOn, false)
      )
    );

  log.info({ count: overdueSignals.length }, "Overdue signals found");

  for (const signal of overdueSignals) {
    try {
      // Find the recipient's manager
      const [recipient] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, signal.recipientEmployeeId))
        .limit(1);

      if (!recipient?.directManagerId) {
        // No manager to escalate to — mark as escalated anyway
        await db
          .update(signals)
          .set({ escalated: true })
          .where(eq(signals.id, signal.id));
        continue;
      }

      // Find the manager
      const [manager] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, recipient.directManagerId))
        .limit(1);

      if (!manager) {
        await db
          .update(signals)
          .set({ escalated: true })
          .where(eq(signals.id, signal.id));
        continue;
      }

      // Create an escalation signal for the manager
      await sendSignalQueue.add("deliver-signal", {
        signal: {
          tenantId: signal.tenantId,
          customerId: signal.customerId,
          type: signal.type,
          subtype: signal.subtype,
          severity: "critical",
          agent: "escalation",
          recipientEmployeeId: manager.id,
          channel: "email",
          title: `[ESCALATION] ${signal.title}`,
          body: `This signal was sent to ${recipient.name} ${
            signal.severity === "critical" ? "24" : "48"
          } hours ago and has not been acted on.\n\n---\n\n${signal.body}`,
          recommendation: `Follow up with ${recipient.name} about this ${signal.severity} ${signal.type} signal.`,
          scheduledFor: new Date(),
          triggeringEventId: signal.triggeringEventId,
          contextSnapshot: signal.contextSnapshot,
          suppressed: false,
          suppressionReason: null,
        },
        tenantId: signal.tenantId,
      });

      // Mark original as escalated
      await db
        .update(signals)
        .set({ escalated: true })
        .where(eq(signals.id, signal.id));

      log.info(
        { signalId: signal.id, managerId: manager.id },
        "Signal escalated to manager"
      );
    } catch (err) {
      log.error(
        { signalId: signal.id, error: (err as Error).message },
        "Escalation failed"
      );
    }
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function markEventProcessed(eventId: string) {
  await db
    .update(events)
    .set({ processed: true, processedAt: new Date() })
    .where(eq(events.id, eventId));
}

// ─── Recurring Jobs (Cron) ────────────────────────────────────────────────────

async function setupRecurringJobs() {
  // Salesforce sync — every 15 minutes
  await syncSalesforceQueue.upsertJobScheduler(
    "sf-sync-recurring",
    { pattern: "*/15 * * * *" },
    { name: "sf-sync", data: { type: "all-tenants" } }
  );

  // Email sync — every 15 minutes
  await syncEmailQueue.upsertJobScheduler(
    "email-sync-recurring",
    { pattern: "*/15 * * * *" },
    { name: "email-sync", data: { type: "all-tenants" } }
  );

  // Calendar sync + meeting prep — every 30 minutes
  await syncCalendarQueue.upsertJobScheduler(
    "calendar-sync-recurring",
    { pattern: "*/30 * * * *" },
    { name: "calendar-sync", data: { type: "all-tenants" } }
  );

  // Collision detection — daily at 07:00 UTC
  await collisionDetectionQueue.upsertJobScheduler(
    "collision-detection-daily",
    { pattern: "0 7 * * *" },
    { name: "collision-scan", data: {} }
  );

  // Escalation timer check — every hour
  await escalationCheckQueue.upsertJobScheduler(
    "escalation-check-hourly",
    { pattern: "0 * * * *" },
    { name: "escalation-check", data: {} }
  );

  logger.info("Recurring jobs configured (6 schedulers)");
}

// ─── Start ────────────────────────────────────────────────────────────────────

logger.info("Signal AI worker started");
setupRecurringJobs().catch((err) => {
  logger.error(err, "Failed to set up recurring jobs");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down workers...");
  await syncSalesforceWorker.close();
  await syncEmailWorker.close();
  await syncCalendarWorker.close();
  await processEventWorker.close();
  await sendSignalWorker.close();
  await collisionDetectionWorker.close();
  await escalationCheckWorker.close();
  process.exit(0);
});
