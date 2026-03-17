// ─── Salesforce Raw Types ────────────────────────────────────────────────────

export interface SfAccount {
  Id: string;
  Name: string;
  Type: string | null;
  Industry: string | null;
  AnnualRevenue: number | null;
  NumberOfEmployees: number | null;
  OwnerId: string;
  Website: string | null;
  BillingCountry: string | null;
  LastModifiedDate: string;
  [key: string]: unknown;
}

export interface SfContact {
  Id: string;
  AccountId: string;
  FirstName: string | null;
  LastName: string;
  Email: string | null;
  Phone: string | null;
  Title: string | null;
  Department: string | null;
  LastModifiedDate: string;
  [key: string]: unknown;
}

export interface SfOpportunity {
  Id: string;
  AccountId: string;
  Name: string;
  Amount: number | null;
  StageName: string;
  CloseDate: string;
  Type: string | null;
  OwnerId: string;
  Probability: number | null;
  LastModifiedDate: string;
  [key: string]: unknown;
}

export interface SfCase {
  Id: string;
  AccountId: string;
  ContactId: string | null;
  Subject: string;
  Priority: string;
  Status: string;
  Type: string | null;
  CreatedDate: string;
  ClosedDate: string | null;
  LastModifiedDate: string;
  OwnerId: string;
  [key: string]: unknown;
}

// ─── Internal Types ──────────────────────────────────────────────────────────

export interface MappedCustomer {
  sfAccountId: string;
  name: string;
  segment: string | null;
  arr: string | null;
  products: string[];
  tier: string;
}

export interface MappedContact {
  sfContactId: string;
  sfAccountId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  influence: string | null;
  power: string | null;
  interest: string | null;
}

export interface MappedDeal {
  sfOpportunityId: string;
  sfAccountId: string;
  name: string;
  amount: string | null;
  stage: string;
  closeDate: string;
  type: string | null;
  probability: number | null;
  sfOwnerId: string;
}

export interface MappedTicket {
  sfCaseId: string;
  sfAccountId: string;
  sfContactId: string | null;
  subject: string;
  priority: string;
  status: string;
  category: string | null;
  openedAt: string;
  resolvedAt: string | null;
  sfOwnerId: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Map a Salesforce Account to our internal Customer shape.
 */
export function mapAccount(sf: SfAccount): MappedCustomer {
  return {
    sfAccountId: sf.Id,
    name: sf.Name,
    segment: inferSegment(sf.AnnualRevenue, sf.NumberOfEmployees),
    arr: sf.AnnualRevenue?.toString() ?? null,
    products: [], // Custom field — will be configured per tenant
    tier: inferTier(sf.AnnualRevenue),
  };
}

/**
 * Map a Salesforce Contact to our internal Contact shape.
 */
export function mapContact(sf: SfContact): MappedContact {
  const titleLower = sf.Title?.toLowerCase() ?? "";
  return {
    sfContactId: sf.Id,
    sfAccountId: sf.AccountId,
    name: [sf.FirstName, sf.LastName].filter(Boolean).join(" "),
    email: sf.Email,
    phone: sf.Phone,
    title: sf.Title,
    influence: inferInfluence(titleLower),
    power: inferPower(titleLower),
    interest: null, // Derived from engagement data, not from SF
  };
}

/**
 * Map a Salesforce Opportunity to our internal Deal shape.
 */
export function mapOpportunity(sf: SfOpportunity): MappedDeal {
  return {
    sfOpportunityId: sf.Id,
    sfAccountId: sf.AccountId,
    name: sf.Name,
    amount: sf.Amount?.toString() ?? null,
    stage: sf.StageName,
    closeDate: sf.CloseDate,
    type: normalizeOpportunityType(sf.Type),
    probability: sf.Probability,
    sfOwnerId: sf.OwnerId,
  };
}

/**
 * Map a Salesforce Case to our internal Ticket shape.
 */
export function mapCase(sf: SfCase): MappedTicket {
  return {
    sfCaseId: sf.Id,
    sfAccountId: sf.AccountId,
    sfContactId: sf.ContactId,
    subject: sf.Subject,
    priority: sf.Priority?.toLowerCase() ?? "medium",
    status: sf.Status?.toLowerCase() ?? "open",
    category: sf.Type, // SF Case.Type maps to our category
    openedAt: sf.CreatedDate,
    resolvedAt: sf.ClosedDate,
    sfOwnerId: sf.OwnerId,
  };
}

// ─── Inference Helpers ───────────────────────────────────────────────────────

/**
 * Infer customer segment from ARR and employee count.
 * strategic: ARR > 500K or 1000+ employees
 * enterprise: ARR > 100K or 200+ employees
 * smb: everything else
 */
export function inferSegment(
  annualRevenue: number | null,
  employeeCount: number | null
): string | null {
  if (annualRevenue == null && employeeCount == null) return null;

  if ((annualRevenue ?? 0) > 500_000 || (employeeCount ?? 0) > 1000) {
    return "strategic";
  }
  if ((annualRevenue ?? 0) > 100_000 || (employeeCount ?? 0) > 200) {
    return "enterprise";
  }
  return "smb";
}

/**
 * Infer tier from ARR for prioritization.
 * high: ARR > 200K
 * medium: ARR > 50K
 * low: below 50K or unknown
 */
export function inferTier(annualRevenue: number | null): string {
  if (annualRevenue == null) return "medium";
  if (annualRevenue > 200_000) return "high";
  if (annualRevenue > 50_000) return "medium";
  return "low";
}

/**
 * Infer contact influence level from title.
 */
export function inferInfluence(titleLower: string): string | null {
  if (!titleLower) return null;

  // C-level / VP → decision_maker
  if (
    /\b(ceo|cto|cfo|coo|cio|ciso|cmo|cro|chief|president)\b/.test(titleLower) ||
    /\bvp\b/.test(titleLower) ||
    /\bvice.president\b/.test(titleLower)
  ) {
    return "decision_maker";
  }

  // Director / Head of → champion
  if (/\b(director|head of|head)\b/.test(titleLower)) {
    return "champion";
  }

  // Manager / Lead → advocate
  if (/\b(manager|lead|senior)\b/.test(titleLower)) {
    return "advocate";
  }

  return "professional";
}

/**
 * Infer contact power level from title.
 */
export function inferPower(titleLower: string): string | null {
  if (!titleLower) return null;

  if (
    /\b(ceo|cto|cfo|coo|cio|ciso|cmo|cro|chief|president|vp|vice.president|director|head)\b/.test(
      titleLower
    )
  ) {
    return "high";
  }

  return "low";
}

function normalizeOpportunityType(sfType: string | null): string | null {
  if (!sfType) return null;
  const map: Record<string, string> = {
    "New Business": "new",
    "Existing Business": "upsell",
    Renewal: "renewal",
  };
  return map[sfType] ?? sfType.toLowerCase();
}
