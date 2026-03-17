import { graphGet, graphGetAllPages, type MsGraphCredentials, type GraphPagedResponse } from "./client";
import { mapMessage } from "./mapper";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MailSyncOptions {
  tenantId: string;
  credentials: MsGraphCredentials;
  /** MS user IDs to sync mail for (monitored employees) */
  userIds: string[];
  /** Only fetch messages after this timestamp */
  sinceTimestamp?: string;
  /** Delta token from previous sync for incremental fetching */
  deltaToken?: string;
}

export interface MailSyncResult {
  messages: number;
  errors: number;
  newDeltaToken: string | null;
  durationMs: number;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync mail messages from Microsoft Graph for monitored users.
 * Uses delta queries when a deltaToken is available for incremental sync.
 */
export async function syncMail(options: MailSyncOptions): Promise<MailSyncResult> {
  const start = Date.now();

  // TODO: For each userId:
  // 1. If deltaToken exists, use delta query: /users/{userId}/mailFolders/inbox/messages/delta
  // 2. Otherwise, fetch messages since sinceTimestamp
  // 3. Map each message via mapMessage
  // 4. Upsert into interactions table (type=email)
  // 5. Resolve contacts via entity-resolver
  // 6. Store new deltaToken for next run

  throw new Error("Not implemented");
}

/**
 * Fetch a single message by ID with full body content.
 */
export async function fetchMessage(
  userId: string,
  messageId: string,
  credentials: MsGraphCredentials
): Promise<unknown> {
  // TODO: GET /users/{userId}/messages/{messageId}?$select=subject,body,from,toRecipients,...
  throw new Error("Not implemented");
}
