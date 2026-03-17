import { config } from "@/config";

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

// ─── Client ──────────────────────────────────────────────────────────────────

let cachedAuth: SalesforceAuthResult | null = null;

/**
 * Authenticate with Salesforce using JWT Bearer flow.
 * Returns an access token for subsequent API calls.
 */
export async function authenticate(
  credentials: SalesforceCredentials
): Promise<SalesforceAuthResult> {
  // TODO: Implement JWT Bearer token flow
  // 1. Build JWT claim with iss=clientId, sub=username, aud=login.salesforce.com
  // 2. Sign with privateKey (RS256)
  // 3. POST to /services/oauth2/token
  // 4. Cache result and return
  throw new Error("Not implemented");
}

/**
 * Execute a SOQL query against Salesforce REST API.
 */
export async function query<T = Record<string, unknown>>(
  soql: string,
  credentials: SalesforceCredentials
): Promise<SalesforceQueryResult<T>> {
  // TODO: Ensure authenticated, then GET /services/data/v59.0/query?q=...
  // Handle pagination via nextRecordsUrl
  throw new Error("Not implemented");
}

/**
 * Fetch a single record by ID from a Salesforce object.
 */
export async function getRecord<T = Record<string, unknown>>(
  objectType: string,
  recordId: string,
  fields: string[],
  credentials: SalesforceCredentials
): Promise<T> {
  // TODO: GET /services/data/v59.0/sobjects/{objectType}/{recordId}?fields=...
  throw new Error("Not implemented");
}

/**
 * Invalidate cached auth token (e.g., on 401 responses).
 */
export function clearAuthCache(): void {
  cachedAuth = null;
}
