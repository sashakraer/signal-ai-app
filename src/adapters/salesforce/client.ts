import { Connection } from "jsforce";
import * as crypto from "node:crypto";
import { logger } from "../../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SalesforceCredentials {
  clientId: string;
  privateKey: string;
  username: string;
  instanceUrl: string;
}

export interface SalesforceAuthResult {
  accessToken: string;
  instanceUrl: string;
  expiresAt: Date;
}

export interface SalesforceQueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

export interface UpdatedRecordsResult {
  ids: string[];
  latestDateCovered: string;
}

// ─── Auth Cache ──────────────────────────────────────────────────────────────

const authCache = new Map<string, { conn: Connection; expiresAt: Date }>();

/**
 * Build a JWT assertion for Salesforce JWT Bearer flow.
 * Signs with RS256 using the provided private key.
 */
function buildJwtAssertion(credentials: SalesforceCredentials): string {
  const header = { alg: "RS256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.clientId,
    sub: credentials.username,
    aud: "https://login.salesforce.com",
    exp: now + 180, // 3 minutes
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(credentials.privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Authenticate with Salesforce using JWT Bearer flow.
 * Caches connections per username to avoid re-auth on every call.
 */
export async function getConnection(
  credentials: SalesforceCredentials
): Promise<Connection> {
  const cacheKey = `${credentials.username}@${credentials.instanceUrl}`;
  const cached = authCache.get(cacheKey);

  if (cached && cached.expiresAt > new Date()) {
    return cached.conn;
  }

  logger.info({ username: credentials.username }, "Authenticating with Salesforce");

  const conn = new Connection({
    loginUrl: "https://login.salesforce.com",
    instanceUrl: credentials.instanceUrl,
    version: "59.0",
  });

  const assertion = buildJwtAssertion(credentials);

  await conn.authorize({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  // Cache for 1 hour (SF tokens typically last 2h)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  authCache.set(cacheKey, { conn, expiresAt });

  logger.info("Salesforce authentication successful");
  return conn;
}

/**
 * Execute a SOQL query against Salesforce REST API.
 * Handles pagination automatically via jsforce.
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  soql: string,
  credentials: SalesforceCredentials
): Promise<SalesforceQueryResult<T>> {
  const conn = await getConnection(credentials);
  const result = await conn.query<T>(soql);

  // jsforce returns records directly; if not done, fetch remaining
  let allRecords = [...result.records];
  let queryResult = result;

  while (!queryResult.done && queryResult.nextRecordsUrl) {
    queryResult = await conn.queryMore<T>(queryResult.nextRecordsUrl);
    allRecords = allRecords.concat(queryResult.records);
  }

  return {
    totalSize: result.totalSize,
    done: true,
    records: allRecords,
  };
}

/**
 * Get IDs of records updated within a time range.
 * Used for incremental sync — avoids full table scans.
 */
export async function getUpdatedRecords(
  objectType: string,
  startDate: Date,
  endDate: Date,
  credentials: SalesforceCredentials
): Promise<UpdatedRecordsResult> {
  const conn = await getConnection(credentials);
  const result = await conn.sobject(objectType).updated(
    startDate.toISOString(),
    endDate.toISOString()
  );

  return {
    ids: result.ids,
    latestDateCovered: result.latestDateCovered,
  };
}

/**
 * Fetch records by IDs using SOQL IN clause.
 * Chunks into batches of 200 (SF SOQL IN limit).
 */
export async function fetchRecordsByIds<T extends Record<string, unknown> = Record<string, unknown>>(
  objectType: string,
  ids: string[],
  fields: string[],
  credentials: SalesforceCredentials
): Promise<T[]> {
  if (ids.length === 0) return [];

  const BATCH_SIZE = 200;
  const allRecords: T[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const idList = batch.map((id) => `'${id}'`).join(",");
    const soql = `SELECT ${fields.join(",")} FROM ${objectType} WHERE Id IN (${idList})`;
    const result = await query<T>(soql, credentials);
    allRecords.push(...result.records);
  }

  return allRecords;
}

/**
 * Invalidate cached auth for a given set of credentials.
 */
export function clearAuthCache(credentials?: SalesforceCredentials): void {
  if (credentials) {
    const cacheKey = `${credentials.username}@${credentials.instanceUrl}`;
    authCache.delete(cacheKey);
  } else {
    authCache.clear();
  }
}
