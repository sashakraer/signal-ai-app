import { config } from "@/config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MsGraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface MsGraphAuthResult {
  accessToken: string;
  expiresAt: Date;
}

export interface GraphPagedResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

let cachedAuth: MsGraphAuthResult | null = null;

/**
 * Authenticate with Microsoft Graph using client credentials flow.
 */
export async function authenticate(
  credentials: MsGraphCredentials
): Promise<MsGraphAuthResult> {
  // TODO: POST to https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
  // with grant_type=client_credentials, scope=https://graph.microsoft.com/.default
  // Cache result and return
  throw new Error("Not implemented");
}

/**
 * Make an authenticated GET request to the Graph API.
 */
export async function graphGet<T>(
  path: string,
  credentials: MsGraphCredentials,
  params?: Record<string, string>
): Promise<T> {
  // TODO: Ensure authenticated, then GET https://graph.microsoft.com/v1.0/{path}
  throw new Error("Not implemented");
}

/**
 * Fetch all pages of a paginated Graph API response.
 */
export async function graphGetAllPages<T>(
  path: string,
  credentials: MsGraphCredentials,
  params?: Record<string, string>
): Promise<T[]> {
  // TODO: Follow @odata.nextLink until all pages consumed
  throw new Error("Not implemented");
}

/**
 * Make an authenticated POST request to the Graph API.
 */
export async function graphPost<TReq, TRes>(
  path: string,
  body: TReq,
  credentials: MsGraphCredentials
): Promise<TRes> {
  // TODO: Ensure authenticated, then POST to Graph API
  throw new Error("Not implemented");
}

/**
 * Invalidate cached auth token.
 */
export function clearAuthCache(): void {
  cachedAuth = null;
}
