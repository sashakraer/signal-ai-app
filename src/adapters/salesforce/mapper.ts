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
  // TODO: Implement segment inference from Industry/AnnualRevenue/NumberOfEmployees
  // TODO: Implement tier assignment logic (high/medium/low)
  // TODO: Extract products from custom fields if available
  return {
    sfAccountId: sf.Id,
    name: sf.Name,
    segment: null, // TODO: derive from sf.Industry / sf.AnnualRevenue
    arr: sf.AnnualRevenue?.toString() ?? null,
    products: [], // TODO: parse from custom field
    tier: "medium", // TODO: compute based on ARR thresholds
  };
}

/**
 * Map a Salesforce Contact to our internal Contact shape.
 */
export function mapContact(sf: SfContact): MappedContact {
  // TODO: Implement influence/power/interest inference from Title and Department
  return {
    sfContactId: sf.Id,
    sfAccountId: sf.AccountId,
    name: [sf.FirstName, sf.LastName].filter(Boolean).join(" "),
    email: sf.Email,
    phone: sf.Phone,
    title: sf.Title,
    influence: null, // TODO: infer from title (VP/C-level -> decision_maker, etc.)
    power: null, // TODO: infer from title
    interest: null, // TODO: derive from engagement data
  };
}

/**
 * Map a Salesforce Opportunity to our internal Deal shape.
 */
export function mapOpportunity(sf: SfOpportunity): MappedDeal {
  // TODO: Normalize stage names to internal stages if needed
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeOpportunityType(sfType: string | null): string | null {
  if (!sfType) return null;
  const map: Record<string, string> = {
    "New Business": "new",
    "Existing Business": "upsell",
    Renewal: "renewal",
    // TODO: Add more mappings based on customer SF configurations
  };
  return map[sfType] ?? sfType.toLowerCase();
}
