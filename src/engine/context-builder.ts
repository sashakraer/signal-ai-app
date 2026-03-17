// ─── MiniContext360 ──────────────────────────────────────────────────────────

export interface MiniContext360 {
  customer: {
    id: string;
    name: string;
    segment: string | null;
    arr: string | null;
    tier: string;
    healthScore: number;
    renewalDate: string | null;
    fiscalYearEnd: string | null;
    products: string[];
    signalThesis: string | null;
  };
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    influence: string | null;
    lastInteractionAt: string | null;
    sentimentBaseline: number;
  }>;
  recentInteractions: Array<{
    id: string;
    type: string;
    direction: string;
    occurredAt: string;
    subject: string | null;
    sentiment: number | null;
    employeeName: string | null;
  }>;
  openTickets: Array<{
    id: string;
    subject: string;
    priority: string;
    status: string;
    openedAt: string;
    ageDays: number;
  }>;
  activeDeals: Array<{
    id: string;
    name: string;
    amount: string | null;
    stage: string;
    closeDate: string;
    type: string | null;
  }>;
  recentSignals: Array<{
    id: string;
    type: string;
    agent: string;
    title: string;
    sentAt: string | null;
    feedback: string | null;
  }>;
  /** Assigned CSM details */
  csm: {
    id: string;
    name: string;
    email: string;
  } | null;
  /** Assigned AE details */
  ae: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface ContextBuildOptions {
  tenantId: string;
  customerId: string;
  /** Number of recent interactions to include */
  interactionLimit?: number;
  /** Number of recent signals to include */
  signalLimit?: number;
  /** Include full body text of recent interactions (for Claude analysis) */
  includeBodyText?: boolean;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a MiniContext360 snapshot for a customer.
 * This is the primary context object passed to Claude for signal generation.
 * Queries are parallelized for performance.
 */
export async function buildContext(
  options: ContextBuildOptions
): Promise<MiniContext360> {
  const {
    tenantId,
    customerId,
    interactionLimit = 20,
    signalLimit = 10,
  } = options;

  // TODO: Run all queries in parallel:
  // 1. Fetch customer record
  // 2. Fetch contacts for customer
  // 3. Fetch recent interactions (last N, ordered by occurredAt desc)
  // 4. Fetch open tickets
  // 5. Fetch active deals (non-closed)
  // 6. Fetch recent signals sent about this customer
  // 7. Fetch CSM and AE employee records

  // TODO: Compute derived fields:
  // - ageDays for each ticket
  // - Filter and sort contacts by relevance

  throw new Error("Not implemented");
}

/**
 * Build a lightweight context for quick checks (no interactions/signals).
 * Used by the coordination agent for collision detection.
 */
export async function buildLightContext(
  tenantId: string,
  customerId: string
): Promise<Pick<MiniContext360, "customer" | "csm" | "ae">> {
  // TODO: Fetch only customer + assigned employees
  throw new Error("Not implemented");
}
