import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { employees, contacts, customers } from "../db/schema.js";
import { logger } from "../lib/logger.js";

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

const UNRESOLVED: ResolvedEntity = {
  contactId: null,
  customerId: null,
  employeeId: null,
  isInternal: false,
};

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve an email address to internal entities (contact, customer, employee).
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
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check employees
  const employee = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, ctx.tenantId),
        eq(employees.email, normalizedEmail)
      )
    )
    .limit(1);

  if (employee.length > 0) {
    return {
      contactId: null,
      customerId: null,
      employeeId: employee[0].id,
      isInternal: true,
    };
  }

  // 2. Check contacts
  const contact = await db
    .select({ id: contacts.id, customerId: contacts.customerId })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, ctx.tenantId),
        eq(contacts.email, normalizedEmail)
      )
    )
    .limit(1);

  if (contact.length > 0) {
    return {
      contactId: contact[0].id,
      customerId: contact[0].customerId,
      employeeId: null,
      isInternal: false,
    };
  }

  // 3. Check domain cache for customer domain match
  const domain = normalizedEmail.split("@")[1];
  if (domain && ctx.domainCache) {
    const customerId = ctx.domainCache.get(domain);
    if (customerId) {
      return {
        contactId: null,
        customerId,
        employeeId: null,
        isInternal: false,
      };
    }
  }

  // 4. Unresolved
  return { ...UNRESOLVED };
}

/**
 * Resolve multiple email addresses in batch for efficiency.
 * Returns a map of email -> ResolvedEntity.
 *
 * Uses batch queries to avoid N+1:
 * - Single query for all employees matching any email
 * - Single query for all contacts matching any email
 * - Domain cache lookup for remaining unresolved emails
 */
export async function resolveEmails(
  emails: string[],
  ctx: ResolutionContext
): Promise<Map<string, ResolvedEntity>> {
  const results = new Map<string, ResolvedEntity>();
  const normalizedEmails = emails.map((e) => e.toLowerCase().trim());
  const uniqueEmails = [...new Set(normalizedEmails)];

  if (uniqueEmails.length === 0) return results;

  // 1. Batch query employees
  const matchedEmployees = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, ctx.tenantId),
        inArray(employees.email, uniqueEmails)
      )
    );

  for (const emp of matchedEmployees) {
    results.set(emp.email, {
      contactId: null,
      customerId: null,
      employeeId: emp.id,
      isInternal: true,
    });
  }

  // 2. Batch query contacts for unresolved emails
  const unresolvedAfterEmployees = uniqueEmails.filter((e) => !results.has(e));

  if (unresolvedAfterEmployees.length > 0) {
    const matchedContacts = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        customerId: contacts.customerId,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, ctx.tenantId),
          inArray(contacts.email, unresolvedAfterEmployees)
        )
      );

    for (const contact of matchedContacts) {
      if (contact.email) {
        results.set(contact.email, {
          contactId: contact.id,
          customerId: contact.customerId,
          employeeId: null,
          isInternal: false,
        });
      }
    }
  }

  // 3. Domain cache lookup for remaining unresolved
  const stillUnresolved = uniqueEmails.filter((e) => !results.has(e));

  if (stillUnresolved.length > 0 && ctx.domainCache) {
    for (const email of stillUnresolved) {
      const domain = email.split("@")[1];
      if (domain) {
        const customerId = ctx.domainCache.get(domain);
        if (customerId) {
          results.set(email, {
            contactId: null,
            customerId,
            employeeId: null,
            isInternal: false,
          });
        }
      }
    }
  }

  // 4. Fill remaining as unresolved
  for (const email of uniqueEmails) {
    if (!results.has(email)) {
      results.set(email, { ...UNRESOLVED });
    }
  }

  return results;
}

/**
 * Build the domain-to-customer cache for a tenant.
 * Extracts unique email domains from all contacts and maps them to customer IDs.
 *
 * If multiple customers share a domain (e.g., gmail.com), that domain is excluded
 * from the cache to avoid false matches.
 */
export async function buildDomainCache(
  tenantId: string
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();

  // Query all contacts with emails grouped by customer
  const contactRows = await db
    .select({
      email: contacts.email,
      customerId: contacts.customerId,
    })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));

  // Build domain -> Set<customerId> to detect shared domains
  const domainCustomers = new Map<string, Set<string>>();

  for (const row of contactRows) {
    if (!row.email) continue;
    const domain = row.email.toLowerCase().split("@")[1];
    if (!domain) continue;

    // Skip common free email providers — these can't uniquely identify a customer
    if (FREE_EMAIL_DOMAINS.has(domain)) continue;

    if (!domainCustomers.has(domain)) {
      domainCustomers.set(domain, new Set());
    }
    domainCustomers.get(domain)!.add(row.customerId);
  }

  // Only include domains that map to exactly one customer
  for (const [domain, customerIds] of domainCustomers) {
    if (customerIds.size === 1) {
      cache.set(domain, [...customerIds][0]);
    } else {
      logger.debug(
        { domain, customerCount: customerIds.size },
        "Domain maps to multiple customers — excluded from cache"
      );
    }
  }

  logger.info({ tenantId, domainCount: cache.size }, "Domain cache built");
  return cache;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Free email providers that cannot uniquely identify a customer */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "protonmail.com",
  "proton.me",
  "walla.co.il",
  "012.net.il",
  "bezeqint.net",
]);
