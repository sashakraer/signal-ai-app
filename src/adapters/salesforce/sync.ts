import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { customers, contacts, deals, tickets, tenants } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import {
  query,
  getUpdatedRecords,
  fetchRecordsByIds,
  type SalesforceCredentials,
} from "./client.js";
import {
  mapAccount,
  mapContact,
  mapOpportunity,
  mapCase,
  type SfAccount,
  type SfContact,
  type SfOpportunity,
  type SfCase,
} from "./mapper.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncOptions {
  tenantId: string;
  credentials: SalesforceCredentials;
  /** ISO timestamp — only sync records modified after this point */
  sinceTimestamp?: string;
  /** Maximum records per object type per run */
  batchSize?: number;
}

export interface SyncResult {
  accounts: { synced: number; errors: number };
  contacts: { synced: number; errors: number };
  opportunities: { synced: number; errors: number };
  cases: { synced: number; errors: number };
  durationMs: number;
}

// ─── Field Lists ─────────────────────────────────────────────────────────────

const ACCOUNT_FIELDS = [
  "Id", "Name", "Type", "Industry", "AnnualRevenue",
  "NumberOfEmployees", "OwnerId", "Website", "BillingCountry", "LastModifiedDate",
];

const CONTACT_FIELDS = [
  "Id", "AccountId", "FirstName", "LastName", "Email",
  "Phone", "Title", "Department", "LastModifiedDate",
];

const OPPORTUNITY_FIELDS = [
  "Id", "AccountId", "Name", "Amount", "StageName",
  "CloseDate", "Type", "OwnerId", "Probability", "LastModifiedDate",
];

const CASE_FIELDS = [
  "Id", "AccountId", "ContactId", "Subject", "Priority",
  "Status", "Type", "CreatedDate", "ClosedDate", "LastModifiedDate", "OwnerId",
];

// ─── Sync Job ────────────────────────────────────────────────────────────────

/**
 * Run a full incremental sync from Salesforce for a given tenant.
 * Pulls Accounts, Contacts, Opportunities, and Cases modified since last sync.
 */
export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const start = Date.now();
  const { tenantId, credentials, batchSize = 2000 } = options;
  const log = logger.child({ tenantId, job: "sf-sync" });

  const sinceTimestamp = options.sinceTimestamp ?? (await getLastSyncTimestamp(tenantId));
  const isIncremental = !!sinceTimestamp;

  log.info({ isIncremental, sinceTimestamp }, "Starting Salesforce sync");

  const result: SyncResult = {
    accounts: { synced: 0, errors: 0 },
    contacts: { synced: 0, errors: 0 },
    opportunities: { synced: 0, errors: 0 },
    cases: { synced: 0, errors: 0 },
    durationMs: 0,
  };

  // 1. Sync Accounts → customers
  try {
    const records = await fetchRecords<SfAccount>(
      "Account", ACCOUNT_FIELDS, sinceTimestamp, batchSize, credentials, isIncremental
    );
    for (const sf of records) {
      try {
        const mapped = mapAccount(sf);
        await upsertCustomer(tenantId, mapped);
        result.accounts.synced++;
      } catch (err) {
        log.error({ sfId: sf.Id, error: (err as Error).message }, "Failed to sync account");
        result.accounts.errors++;
      }
    }
  } catch (err) {
    log.error({ error: (err as Error).message }, "Failed to fetch accounts from SF");
  }

  // 2. Sync Contacts → contacts
  try {
    const records = await fetchRecords<SfContact>(
      "Contact", CONTACT_FIELDS, sinceTimestamp, batchSize, credentials, isIncremental
    );
    for (const sf of records) {
      try {
        const mapped = mapContact(sf);
        await upsertContact(tenantId, mapped);
        result.contacts.synced++;
      } catch (err) {
        log.error({ sfId: sf.Id, error: (err as Error).message }, "Failed to sync contact");
        result.contacts.errors++;
      }
    }
  } catch (err) {
    log.error({ error: (err as Error).message }, "Failed to fetch contacts from SF");
  }

  // 3. Sync Opportunities → deals
  try {
    const records = await fetchRecords<SfOpportunity>(
      "Opportunity", OPPORTUNITY_FIELDS, sinceTimestamp, batchSize, credentials, isIncremental
    );
    for (const sf of records) {
      try {
        const mapped = mapOpportunity(sf);
        await upsertDeal(tenantId, mapped);
        result.opportunities.synced++;
      } catch (err) {
        log.error({ sfId: sf.Id, error: (err as Error).message }, "Failed to sync opportunity");
        result.opportunities.errors++;
      }
    }
  } catch (err) {
    log.error({ error: (err as Error).message }, "Failed to fetch opportunities from SF");
  }

  // 4. Sync Cases → tickets
  try {
    const records = await fetchRecords<SfCase>(
      "Case", CASE_FIELDS, sinceTimestamp, batchSize, credentials, isIncremental
    );
    for (const sf of records) {
      try {
        const mapped = mapCase(sf);
        await upsertTicket(tenantId, mapped);
        result.cases.synced++;
      } catch (err) {
        log.error({ sfId: sf.Id, error: (err as Error).message }, "Failed to sync case");
        result.cases.errors++;
      }
    }
  } catch (err) {
    log.error({ error: (err as Error).message }, "Failed to fetch cases from SF");
  }

  // 5. Update tenant's last sync timestamp
  await updateLastSyncTimestamp(tenantId);

  result.durationMs = Date.now() - start;
  log.info(result, "Salesforce sync completed");
  return result;
}

// ─── Record Fetching ─────────────────────────────────────────────────────────

/**
 * Fetch records either via full query (initial sync) or getUpdated (incremental).
 */
async function fetchRecords<T extends { Id: string }>(
  objectType: string,
  fields: string[],
  sinceTimestamp: string | null,
  batchSize: number,
  credentials: SalesforceCredentials,
  isIncremental: boolean
): Promise<T[]> {
  if (isIncremental && sinceTimestamp) {
    // Use getUpdated for incremental sync
    const startDate = new Date(sinceTimestamp);
    const endDate = new Date();
    const updated = await getUpdatedRecords(objectType, startDate, endDate, credentials);

    if (updated.ids.length === 0) return [];

    return fetchRecordsByIds<T>(objectType, updated.ids, fields, credentials);
  }

  // Full sync via SOQL
  const fieldList = fields.join(", ");
  const soql = `SELECT ${fieldList} FROM ${objectType} ORDER BY LastModifiedDate DESC LIMIT ${batchSize}`;
  const result = await query<T>(soql, credentials);
  return result.records;
}

// ─── Upsert Helpers ──────────────────────────────────────────────────────────

async function upsertCustomer(
  tenantId: string,
  mapped: ReturnType<typeof mapAccount>
) {
  await db
    .insert(customers)
    .values({
      tenantId,
      sfAccountId: mapped.sfAccountId,
      name: mapped.name,
      segment: mapped.segment,
      arr: mapped.arr,
      tier: mapped.tier,
      products: mapped.products,
    })
    .onConflictDoUpdate({
      target: [customers.tenantId, customers.sfAccountId],
      set: {
        name: mapped.name,
        segment: mapped.segment,
        arr: mapped.arr,
        tier: mapped.tier,
        products: mapped.products,
        updatedAt: new Date(),
      },
    });
}

async function upsertContact(
  tenantId: string,
  mapped: ReturnType<typeof mapContact>
) {
  // Look up the customer by SF Account ID
  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        eq(customers.sfAccountId, mapped.sfAccountId)
      )
    )
    .limit(1);

  if (customer.length === 0) {
    logger.warn(
      { sfAccountId: mapped.sfAccountId, sfContactId: mapped.sfContactId },
      "Skipping contact — parent customer not found"
    );
    return;
  }

  await db
    .insert(contacts)
    .values({
      tenantId,
      customerId: customer[0].id,
      sfContactId: mapped.sfContactId,
      name: mapped.name,
      email: mapped.email,
      phone: mapped.phone,
      title: mapped.title,
      influence: mapped.influence,
      power: mapped.power,
      interest: mapped.interest,
    })
    .onConflictDoUpdate({
      target: [contacts.tenantId, contacts.sfContactId],
      set: {
        name: mapped.name,
        email: mapped.email,
        phone: mapped.phone,
        title: mapped.title,
        influence: mapped.influence,
        power: mapped.power,
        interest: mapped.interest,
        updatedAt: new Date(),
      },
    });
}

async function upsertDeal(
  tenantId: string,
  mapped: ReturnType<typeof mapOpportunity>
) {
  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        eq(customers.sfAccountId, mapped.sfAccountId)
      )
    )
    .limit(1);

  if (customer.length === 0) {
    logger.warn(
      { sfAccountId: mapped.sfAccountId, sfOpportunityId: mapped.sfOpportunityId },
      "Skipping deal — parent customer not found"
    );
    return;
  }

  await db
    .insert(deals)
    .values({
      tenantId,
      customerId: customer[0].id,
      sfOpportunityId: mapped.sfOpportunityId,
      name: mapped.name,
      amount: mapped.amount,
      stage: mapped.stage,
      closeDate: mapped.closeDate,
      type: mapped.type,
      probability: mapped.probability,
    })
    .onConflictDoUpdate({
      target: [deals.tenantId, deals.sfOpportunityId],
      set: {
        name: mapped.name,
        amount: mapped.amount,
        stage: mapped.stage,
        closeDate: mapped.closeDate,
        type: mapped.type,
        probability: mapped.probability,
        updatedAt: new Date(),
      },
    });
}

async function upsertTicket(
  tenantId: string,
  mapped: ReturnType<typeof mapCase>
) {
  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        eq(customers.sfAccountId, mapped.sfAccountId)
      )
    )
    .limit(1);

  if (customer.length === 0) {
    logger.warn(
      { sfAccountId: mapped.sfAccountId, sfCaseId: mapped.sfCaseId },
      "Skipping ticket — parent customer not found"
    );
    return;
  }

  await db
    .insert(tickets)
    .values({
      tenantId,
      customerId: customer[0].id,
      sfCaseId: mapped.sfCaseId,
      subject: mapped.subject,
      priority: mapped.priority,
      status: mapped.status,
      category: mapped.category,
      openedAt: new Date(mapped.openedAt),
      resolvedAt: mapped.resolvedAt ? new Date(mapped.resolvedAt) : null,
    })
    .onConflictDoUpdate({
      target: [tickets.tenantId, tickets.sfCaseId],
      set: {
        subject: mapped.subject,
        priority: mapped.priority,
        status: mapped.status,
        category: mapped.category,
        resolvedAt: mapped.resolvedAt ? new Date(mapped.resolvedAt) : null,
        updatedAt: new Date(),
      },
    });
}

// ─── Sync Metadata ───────────────────────────────────────────────────────────

/**
 * Get the last successful sync timestamp for a tenant.
 */
export async function getLastSyncTimestamp(tenantId: string): Promise<string | null> {
  const result = await db
    .select({ config: tenants.config })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (result.length === 0) return null;

  const config = result[0].config as Record<string, unknown>;
  return (config?.lastSfSyncAt as string) ?? null;
}

/**
 * Update the tenant's last sync timestamp to now.
 */
async function updateLastSyncTimestamp(tenantId: string): Promise<void> {
  await db
    .update(tenants)
    .set({
      config: sql`jsonb_set(COALESCE(config, '{}'::jsonb), '{lastSfSyncAt}', to_jsonb(now()::text))`,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}
