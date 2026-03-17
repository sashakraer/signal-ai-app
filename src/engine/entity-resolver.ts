// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedEntity {
  contactId: string | null;
  customerId: string | null;
  employeeId: string | null;
  /** Whether the email belongs to an internal employee */
  isInternal: boolean;
}

export interface ResolutionContext {
  tenantId: string;
  /** Cached domain-to-customer mappings for the tenant */
  domainCache?: Map<string, string>;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve an email address to internal entities (contact, customer, employee).
 * This is the core entity resolution function used by all adapters.
 *
 * Resolution order:
 * 1. Check if email matches an employee -> isInternal=true
 * 2. Check if email matches a known contact -> return contactId + customerId
 * 3. Check if email domain matches a customer domain -> return customerId only
 * 4. Return unresolved (all nulls, isInternal=false)
 */
export async function resolveEmail(
  email: string,
  ctx: ResolutionContext
): Promise<ResolvedEntity> {
  // TODO: Query employees table for exact email match
  // TODO: Query contacts table for exact email match
  // TODO: Extract domain and check against customer domains
  // TODO: Use domainCache if available to avoid repeated DB queries

  throw new Error("Not implemented");
}

/**
 * Resolve multiple email addresses in batch for efficiency.
 * Returns a map of email -> ResolvedEntity.
 */
export async function resolveEmails(
  emails: string[],
  ctx: ResolutionContext
): Promise<Map<string, ResolvedEntity>> {
  // TODO: Batch query for all emails at once instead of N+1
  // 1. Single query for employees matching any of the emails
  // 2. Single query for contacts matching any of the emails
  // 3. Extract unique domains, single query for customer domains
  // 4. Merge results

  throw new Error("Not implemented");
}

/**
 * Build or refresh the domain-to-customer cache for a tenant.
 */
export async function buildDomainCache(
  tenantId: string
): Promise<Map<string, string>> {
  // TODO: Query all contacts grouped by customer, extract unique domains
  // Return map of domain -> customerId
  throw new Error("Not implemented");
}
