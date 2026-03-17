import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { interactions, tenants } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { graphGetAllPages, type MsGraphCredentials } from "./client.js";
import { mapMessage, type GraphMessage } from "./mapper.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MailSyncOptions {
  tenantId: string;
  credentials: MsGraphCredentials;
  /** MS user IDs to sync mail for (monitored employees) */
  userIds: string[];
  /** Email addresses corresponding to userIds (same order) */
  userEmails: string[];
  /** Internal company domains for direction detection */
  internalDomains: string[];
  /** Delta token from previous sync for incremental fetching */
  deltaToken?: string;
}

export interface MailSyncResult {
  messages: number;
  errors: number;
  newDeltaToken: string | null;
  durationMs: number;
}

// ─── Mail Fields ─────────────────────────────────────────────────────────────

const MESSAGE_SELECT = [
  "id", "subject", "bodyPreview", "body", "from",
  "toRecipients", "ccRecipients", "receivedDateTime", "sentDateTime",
  "isRead", "importance", "conversationId", "internetMessageId",
].join(",");

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync mail messages from Microsoft Graph for monitored users.
 * Uses delta queries when a deltaToken is available for incremental sync.
 */
export async function syncMail(options: MailSyncOptions): Promise<MailSyncResult> {
  const start = Date.now();
  const { tenantId, credentials, userIds, userEmails, internalDomains } = options;
  const log = logger.child({ tenantId, job: "mail-sync" });

  let totalMessages = 0;
  let totalErrors = 0;
  let latestDeltaToken: string | null = null;

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const userEmail = userEmails[i];
    const userLog = log.child({ userId });

    try {
      const result = await syncUserMail(
        tenantId,
        userId,
        userEmail,
        internalDomains,
        credentials,
        options.deltaToken
      );

      totalMessages += result.messages;
      totalErrors += result.errors;
      if (result.deltaToken) latestDeltaToken = result.deltaToken;

      userLog.info({ messages: result.messages, errors: result.errors }, "User mail synced");
    } catch (err) {
      userLog.error({ error: (err as Error).message }, "Failed to sync user mail");
      totalErrors++;
    }
  }

  const durationMs = Date.now() - start;
  log.info({ totalMessages, totalErrors, durationMs }, "Mail sync completed");

  return {
    messages: totalMessages,
    errors: totalErrors,
    newDeltaToken: latestDeltaToken,
    durationMs,
  };
}

/**
 * Sync mail for a single user.
 */
async function syncUserMail(
  tenantId: string,
  userId: string,
  userEmail: string,
  internalDomains: string[],
  credentials: MsGraphCredentials,
  deltaToken?: string
): Promise<{ messages: number; errors: number; deltaToken: string | null }> {
  let path: string;
  let params: Record<string, string> | undefined;

  if (deltaToken) {
    // Incremental sync via delta query
    path = `/users/${userId}/mailFolders/inbox/messages/delta`;
    params = { $deltatoken: deltaToken };
  } else {
    // Initial sync — get messages from inbox
    path = `/users/${userId}/mailFolders/inbox/messages/delta`;
    params = { $select: MESSAGE_SELECT, $top: "50" };
  }

  const { records, deltaLink } = await graphGetAllPages<GraphMessage>(
    path, credentials, params
  );

  let synced = 0;
  let errors = 0;

  for (const msg of records) {
    try {
      const mapped = mapMessage(msg, userEmail, internalDomains);

      // Skip internal emails — we only track external interactions
      if (mapped.direction === "internal") continue;

      await db
        .insert(interactions)
        .values({
          tenantId,
          type: mapped.type,
          direction: mapped.direction,
          occurredAt: new Date(mapped.occurredAt),
          subject: mapped.subject,
          bodyText: mapped.bodyText,
          sourceId: mapped.sourceId,
          source: mapped.source,
          rawMetadata: mapped.rawMetadata,
        })
        .onConflictDoNothing({
          target: [interactions.tenantId, interactions.source, interactions.sourceId],
        });

      synced++;
    } catch (err) {
      logger.error(
        { msgId: msg.id, error: (err as Error).message },
        "Failed to process message"
      );
      errors++;
    }
  }

  return {
    messages: synced,
    errors,
    deltaToken: deltaLink,
  };
}

/**
 * Fetch a single message by ID with full body content.
 */
export async function fetchMessage(
  userId: string,
  messageId: string,
  credentials: MsGraphCredentials
): Promise<GraphMessage> {
  const { graphGet } = await import("./client.js");
  return graphGet<GraphMessage>(
    `/users/${userId}/messages/${messageId}`,
    credentials,
    { $select: MESSAGE_SELECT }
  );
}
