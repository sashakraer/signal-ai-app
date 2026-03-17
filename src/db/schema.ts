import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  real,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  sfCredentials: jsonb("sf_credentials"),
  msCredentials: jsonb("ms_credentials"),
  waConfig: jsonb("wa_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Employees ────────────────────────────────────────────────────────────────

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(), // csm / ae / support / manager / renewals / vp
    department: text("department"),
    sfUserId: text("sf_user_id"),
    msUserId: text("ms_user_id"),
    waPhone: text("wa_phone"),
    directManagerId: uuid("direct_manager_id").references((): any => employees.id),
    notificationPrefs: jsonb("notification_prefs").default({}),
    isMonitored: boolean("is_monitored").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_employees_tenant_email").on(table.tenantId, table.email),
    index("idx_employees_tenant_ms").on(table.tenantId, table.msUserId),
  ]
);

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    sfAccountId: text("sf_account_id"),
    name: text("name").notNull(),
    segment: text("segment"), // enterprise / smb / strategic
    arr: numeric("arr"),
    renewalDate: date("renewal_date"),
    healthScore: integer("health_score").default(50),
    healthDetails: jsonb("health_details"), // { usage, sentiment, engagement, renewal_history }
    tier: text("tier").default("medium"), // high / medium / low
    products: jsonb("products").default([]),
    csmEmployeeId: uuid("csm_employee_id").references(() => employees.id),
    aeEmployeeId: uuid("ae_employee_id").references(() => employees.id),
    profile360: jsonb("profile_360"),
    signalThesis: text("signal_thesis"),
    beliefs: jsonb("beliefs").default([]),
    fiscalYearEnd: date("fiscal_year_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_customers_tenant_sf").on(table.tenantId, table.sfAccountId),
    index("idx_customers_tenant_renewal").on(table.tenantId, table.renewalDate),
    index("idx_customers_tenant_tier").on(table.tenantId, table.tier),
  ]
);

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    sfContactId: text("sf_contact_id"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    influence: text("influence"), // decision_maker / champion / advocate / professional / blocker / check_signer
    power: text("power"), // high / low
    interest: text("interest"), // high / low
    sentimentBaseline: real("sentiment_baseline").default(0),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_contacts_tenant_sf").on(table.tenantId, table.sfContactId),
    index("idx_contacts_tenant_email").on(table.tenantId, table.email),
    index("idx_contacts_customer").on(table.tenantId, table.customerId),
  ]
);

// ─── Interactions ─────────────────────────────────────────────────────────────

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    type: text("type").notNull(), // email / meeting / call / chat
    direction: text("direction"), // inbound / outbound / internal
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    subject: text("subject"),
    summary: text("summary"),
    bodyText: text("body_text"), // deleted after 30 days
    sentiment: real("sentiment"),
    sentimentLabel: text("sentiment_label"), // positive / neutral / negative
    keyPoints: jsonb("key_points").default([]),
    urgency: text("urgency").default("low"),
    sourceId: text("source_id"),
    source: text("source"), // outlook / salesforce / teams / whatsapp
    rawMetadata: jsonb("raw_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_interactions_source").on(table.tenantId, table.source, table.sourceId),
    index("idx_interactions_customer_time").on(table.tenantId, table.customerId, table.occurredAt),
    index("idx_interactions_employee_time").on(table.tenantId, table.employeeId, table.occurredAt),
  ]
);

// ─── Deals ────────────────────────────────────────────────────────────────────

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    sfOpportunityId: text("sf_opportunity_id"),
    name: text("name").notNull(),
    amount: numeric("amount"),
    stage: text("stage"),
    closeDate: date("close_date"),
    type: text("type"), // renewal / upsell / new / cross_sell
    ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id),
    pushCount: integer("push_count").default(0),
    probability: integer("probability"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_deals_tenant_sf").on(table.tenantId, table.sfOpportunityId),
  ]
);

// ─── Tickets ──────────────────────────────────────────────────────────────────

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    sfCaseId: text("sf_case_id"),
    subject: text("subject").notNull(),
    priority: text("priority").default("medium"),
    status: text("status").default("open"),
    category: text("category"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
    ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tickets_tenant_sf").on(table.tenantId, table.sfCaseId),
    index("idx_tickets_customer_status").on(table.tenantId, table.customerId, table.status),
  ]
);

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    type: text("type").notNull(),
    // meeting_scheduled, email_received, sentiment_change, collision,
    // ticket_critical, ticket_aged, renewal_approaching, stage_change
    source: text("source"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    data: jsonb("data").notNull(),
    processed: boolean("processed").default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_events_unprocessed").on(table.tenantId, table.processed, table.occurredAt),
  ]
);

// ─── Signals ──────────────────────────────────────────────────────────────────

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    type: text("type").notNull(), // meeting_prep / collision / risk / opportunity
    subtype: text("subtype"), // deep_brief / quick_brief / type_a-d / expansion / ticket_addon / knowledge_gap
    severity: text("severity"), // low / medium / high / critical
    agent: text("agent").notNull(), // preparation / risk / coordination / opportunity
    recipientEmployeeId: uuid("recipient_employee_id").notNull().references(() => employees.id),
    channel: text("channel").default("email"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    recommendation: text("recommendation"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    actedOn: boolean("acted_on").default(false),
    feedback: text("feedback"),
    feedbackAt: timestamp("feedback_at", { withTimezone: true }),
    triggeringEventId: uuid("triggering_event_id").references(() => events.id),
    contextSnapshot: jsonb("context_snapshot"),
    suppressed: boolean("suppressed").default(false),
    suppressionReason: text("suppression_reason"),
    escalationDueAt: timestamp("escalation_due_at", { withTimezone: true }),
    escalated: boolean("escalated").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_signals_delivery").on(
      table.tenantId,
      table.recipientEmployeeId,
      table.scheduledFor
    ),
    index("idx_signals_customer_active").on(table.tenantId, table.customerId, table.type),
    index("idx_signals_escalation").on(table.escalationDueAt),
  ]
);
