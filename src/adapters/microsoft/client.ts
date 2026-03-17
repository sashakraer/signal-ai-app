import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { logger } from "../../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MsGraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphPagedResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

// ─── Client Cache ────────────────────────────────────────────────────────────

const clientCache = new Map<string, { client: Client; msalApp: ConfidentialClientApplication }>();

/**
 * Get or create a Microsoft Graph client for the given credentials.
 * Uses MSAL ConfidentialClientApplication with client_credentials flow.
 */
export function getGraphClient(credentials: MsGraphCredentials): Client {
  const cacheKey = `${credentials.clientId}@${credentials.tenantId}`;
  const cached = clientCache.get(cacheKey);

  if (cached) return cached.client;

  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: credentials.clientId,
      authority: `https://login.microsoftonline.com/${credentials.tenantId}`,
      clientSecret: credentials.clientSecret,
    },
  });

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const result = await msalApp.acquireTokenByClientCredential({
          scopes: ["https://graph.microsoft.com/.default"],
        });
        if (!result?.accessToken) {
          throw new Error("Failed to acquire Microsoft Graph access token");
        }
        return result.accessToken;
      },
    },
  });

  clientCache.set(cacheKey, { client, msalApp });
  logger.info({ tenantId: credentials.tenantId }, "Microsoft Graph client initialized");
  return client;
}

/**
 * Make an authenticated GET request to the Graph API.
 */
export async function graphGet<T>(
  path: string,
  credentials: MsGraphCredentials,
  params?: Record<string, string>
): Promise<T> {
  const client = getGraphClient(credentials);
  let request = client.api(path);

  if (params) {
    // Build query string from params
    const queryParts = Object.entries(params).map(
      ([key, value]) => `${key}=${value}`
    );
    if (queryParts.length > 0) {
      request = request.query(params);
    }
  }

  return request.get();
}

/**
 * Fetch all pages of a paginated Graph API response.
 * Follows @odata.nextLink until all pages consumed.
 * Returns the deltaLink if present on the last page.
 */
export async function graphGetAllPages<T>(
  path: string,
  credentials: MsGraphCredentials,
  params?: Record<string, string>
): Promise<{ records: T[]; deltaLink: string | null }> {
  const allRecords: T[] = [];
  let deltaLink: string | null = null;

  // First page
  const firstPage = await graphGet<GraphPagedResponse<T>>(path, credentials, params);
  allRecords.push(...firstPage.value);

  // Follow nextLink for subsequent pages
  let nextLink = firstPage["@odata.nextLink"];
  deltaLink = firstPage["@odata.deltaLink"] ?? null;

  const client = getGraphClient(credentials);

  while (nextLink) {
    const page: GraphPagedResponse<T> = await client.api(nextLink).get();
    allRecords.push(...page.value);
    nextLink = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
  }

  return { records: allRecords, deltaLink };
}

/**
 * Make an authenticated POST request to the Graph API.
 */
export async function graphPost<TReq, TRes>(
  path: string,
  body: TReq,
  credentials: MsGraphCredentials
): Promise<TRes> {
  const client = getGraphClient(credentials);
  return client.api(path).post(body);
}

/**
 * Create or renew a Graph API subscription (webhook).
 * Subscriptions expire after 3 days for most resources.
 */
export async function createSubscription(
  resource: string,
  changeType: string,
  notificationUrl: string,
  credentials: MsGraphCredentials,
  expirationMinutes = 4230 // ~2.9 days (max for most resources)
): Promise<{ id: string; expirationDateTime: string }> {
  const expirationDateTime = new Date(
    Date.now() + expirationMinutes * 60 * 1000
  ).toISOString();

  return graphPost(
    "/subscriptions",
    {
      changeType,
      notificationUrl,
      resource,
      expirationDateTime,
      clientState: "signal-ai-webhook-secret",
    },
    credentials
  );
}

/**
 * Renew an existing subscription.
 */
export async function renewSubscription(
  subscriptionId: string,
  credentials: MsGraphCredentials,
  expirationMinutes = 4230
): Promise<void> {
  const client = getGraphClient(credentials);
  const expirationDateTime = new Date(
    Date.now() + expirationMinutes * 60 * 1000
  ).toISOString();

  await client.api(`/subscriptions/${subscriptionId}`).patch({
    expirationDateTime,
  });
}

/**
 * Clear cached client for a tenant.
 */
export function clearClientCache(credentials?: MsGraphCredentials): void {
  if (credentials) {
    const cacheKey = `${credentials.clientId}@${credentials.tenantId}`;
    clientCache.delete(cacheKey);
  } else {
    clientCache.clear();
  }
}
