import { query, type SalesforceCredentials, type SalesforceQueryResult } from "./client";
import { mapAccount, mapContact, mapOpportunity, mapCase } from "./mapper";

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

// ─── Sync Job ────────────────────────────────────────────────────────────────

/**
 * Run a full incremental sync from Salesforce for a given tenant.
 * Pulls Accounts, Contacts, Opportunities, and Cases modified since last sync.
 */
export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const start = Date.now();

  // TODO: Implement sync pipeline:
  // 1. Query SF for Accounts modified since sinceTimestamp
  // 2. Map via mapAccount and upsert into customers table
  // 3. Query SF for Contacts, map via mapContact, upsert into contacts table
  // 4. Query SF for Opportunities, map via mapOpportunity, upsert into deals table
  // 5. Query SF for Cases, map via mapCase, upsert into tickets table
  // 6. Update tenant's last sync timestamp
  // 7. Emit events for any significant changes detected (stage changes, new tickets, etc.)

  throw new Error("Not implemented");
}

/**
 * Get the last successful sync timestamp for a tenant.
 */
export async function getLastSyncTimestamp(tenantId: string): Promise<string | null> {
  // TODO: Query tenant record or sync_log table for last successful sync
  throw new Error("Not implemented");
}
