import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config/index.js";

// ─── Token Format ────────────────────────────────────────────────────────────
// Base64URL-encoded JSON: { tenantId, customerId, signalId?, exp }
// Signed with HMAC-SHA256 using a derived key from DATABASE_URL (as secret).
// Format: <payload>.<signature>

const SECRET = createHmac("sha256", "signal-ai-360-token")
  .update(config.DATABASE_URL)
  .digest();

const TOKEN_EXPIRY_DAYS = 7;

export interface TokenPayload {
  tenantId: string;
  customerId: string;
  signalId?: string;
  exp: number;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/**
 * Generate a signed token for 360 view access.
 */
export function generateViewToken(
  tenantId: string,
  customerId: string,
  signalId?: string,
  expiryDays: number = TOKEN_EXPIRY_DAYS
): string {
  const payload: TokenPayload = {
    tenantId,
    customerId,
    signalId,
    exp: Date.now() + expiryDays * 24 * 60 * 60 * 1000,
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

/**
 * Validate and decode a 360 view token.
 * Returns null if invalid or expired.
 */
export function validateViewToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expectedSig = sign(encoded);

  // Constant-time comparison
  if (signature.length !== expectedSig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as TokenPayload;
    if (payload.exp < Date.now()) return null;
    if (!payload.tenantId || !payload.customerId) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a full URL for the 360 view.
 */
export function generate360Url(
  tenantId: string,
  customerId: string,
  signalId?: string
): string {
  const token = generateViewToken(tenantId, customerId, signalId);
  return `${config.APP_URL}/360/${token}`;
}
