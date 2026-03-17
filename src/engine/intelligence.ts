import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";
import type { MiniContext360 } from "./context-builder.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  messages: ClaudeMessage[];
}

export interface ClaudeCompletionResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}

export interface SentimentAnalysis {
  score: number; // -1.0 to 1.0
  label: "positive" | "neutral" | "negative";
  confidence: number;
  keyPhrases: string[];
}

export interface SignalDraft {
  title: string;
  body: string;
  recommendation: string;
  severity: "low" | "medium" | "high" | "critical";
}

// ─── Client ──────────────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-20250514";
const OPUS_MODEL = "claude-opus-4-20250514";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return client;
}

// ─── Core Completion ─────────────────────────────────────────────────────────

export async function complete(
  options: ClaudeCompletionOptions
): Promise<ClaudeCompletionResult> {
  const {
    model = SONNET_MODEL,
    maxTokens = 2048,
    temperature = 0.3,
    systemPrompt,
    messages,
  } = options;

  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock && "text" in textBlock ? textBlock.text : "";

  return {
    content,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    stopReason: response.stop_reason ?? "end_turn",
  };
}

// ─── Sentiment Analysis ──────────────────────────────────────────────────────

const SENTIMENT_SYSTEM = `You are a sentiment analysis engine for B2B customer communications.
Analyze the provided text and return a JSON object with:
- score: number from -1.0 (very negative) to 1.0 (very positive)
- label: "positive" | "neutral" | "negative"
- confidence: number from 0 to 1
- keyPhrases: array of 1-3 key phrases that indicate the sentiment

Consider business context: urgency, frustration, satisfaction, politeness.
A neutral business email scores around 0.1-0.3.
Return ONLY the JSON object, no other text.`;

export async function analyzeSentiment(
  text: string,
  context?: { customerName?: string; contactName?: string }
): Promise<SentimentAnalysis> {
  const contextLine = context
    ? `\nContext: From ${context.contactName ?? "unknown"} at ${context.customerName ?? "unknown"}`
    : "";

  const result = await complete({
    maxTokens: 256,
    temperature: 0.1,
    systemPrompt: SENTIMENT_SYSTEM,
    messages: [{ role: "user", content: `${contextLine}\n\nText:\n${text}` }],
  });

  try {
    return JSON.parse(result.content) as SentimentAnalysis;
  } catch {
    logger.warn({ response: result.content }, "Failed to parse sentiment response");
    return { score: 0, label: "neutral", confidence: 0, keyPhrases: [] };
  }
}

// ─── Signal Generation ───────────────────────────────────────────────────────

const SIGNAL_SYSTEM = `You are a Signal AI agent generating actionable intelligence for B2B account teams.
Generate a signal in JSON format with:
- title: concise signal title (max 80 chars)
- body: detailed signal body in markdown (2-4 paragraphs)
- recommendation: specific action the recipient should take (1-2 sentences)
- severity: "low" | "medium" | "high" | "critical"

The signal must be:
- Actionable: tell the recipient exactly what to do
- Contextual: reference specific data points (names, dates, amounts)
- Timely: explain why this matters NOW
- Professional: suitable for a CSM or AE to read before a customer interaction

Return ONLY the JSON object, no other text.`;

export async function generateSignalDraft(
  agentPrompt: string,
  context: MiniContext360,
  eventData: Record<string, unknown>
): Promise<SignalDraft> {
  const contextStr = serializeContext(context);

  const result = await complete({
    maxTokens: 1024,
    temperature: 0.4,
    systemPrompt: `${SIGNAL_SYSTEM}\n\n${agentPrompt}`,
    messages: [
      {
        role: "user",
        content: `## Customer Context\n${contextStr}\n\n## Triggering Event\n${JSON.stringify(eventData, null, 2)}`,
      },
    ],
  });

  try {
    return JSON.parse(result.content) as SignalDraft;
  } catch {
    logger.warn({ response: result.content }, "Failed to parse signal draft response");
    return {
      title: "Signal requires review",
      body: result.content,
      recommendation: "Review the generated content and take appropriate action.",
      severity: "medium",
    };
  }
}

// ─── Interaction Summary ─────────────────────────────────────────────────────

export async function summarizeInteraction(
  text: string,
  interactionType: "email" | "meeting" | "call"
): Promise<{ summary: string; keyPoints: string[] }> {
  const result = await complete({
    maxTokens: 512,
    temperature: 0.2,
    systemPrompt: `Summarize this ${interactionType} in a concise paragraph and extract key points.
Return JSON: { "summary": "...", "keyPoints": ["...", "..."] }
Key points should be actionable items, decisions, or commitments mentioned.
Return ONLY the JSON object.`,
    messages: [{ role: "user", content: text }],
  });

  try {
    return JSON.parse(result.content);
  } catch {
    return { summary: text.slice(0, 200), keyPoints: [] };
  }
}

// ─── Competitor Detection ────────────────────────────────────────────────────

export async function detectCompetitorMentions(
  text: string,
  knownCompetitors?: string[]
): Promise<{ mentioned: boolean; competitors: string[]; context: string }> {
  const competitorHint = knownCompetitors?.length
    ? `\nKnown competitors: ${knownCompetitors.join(", ")}`
    : "";

  const result = await complete({
    maxTokens: 256,
    temperature: 0.1,
    systemPrompt: `Detect competitor mentions in B2B communications.${competitorHint}
Return JSON: { "mentioned": boolean, "competitors": ["name1"], "context": "brief quote or context" }
Return ONLY the JSON object.`,
    messages: [{ role: "user", content: text }],
  });

  try {
    return JSON.parse(result.content);
  } catch {
    return { mentioned: false, competitors: [], context: "" };
  }
}

// ─── Signal Thesis (Opus) ────────────────────────────────────────────────────

/**
 * Generate a comprehensive Signal Thesis for a customer using Claude Opus.
 * This is the strategic "living document" that summarizes everything known about a customer.
 */
export async function generateSignalThesis(
  context: MiniContext360
): Promise<string> {
  const contextStr = serializeContext(context);

  const result = await complete({
    model: OPUS_MODEL,
    maxTokens: 4096,
    temperature: 0.5,
    systemPrompt: `You are a strategic account intelligence analyst. Generate a comprehensive Signal Thesis document for this customer.

The Signal Thesis should include:
1. **Account Summary**: Key facts, ARR, products, segment, health
2. **Relationship Map**: Key contacts, their roles, influence, and sentiment
3. **Risk Assessment**: Current risks, trajectory, mitigation opportunities
4. **Opportunity Assessment**: Expansion potential, timing considerations
5. **Strategic Recommendations**: Top 3 actions for the account team

Write in professional English. Be specific — reference actual data points.`,
    messages: [{ role: "user", content: contextStr }],
  });

  return result.content;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeContext(ctx: MiniContext360): string {
  const lines: string[] = [];

  lines.push(`### Customer: ${ctx.customer.name}`);
  lines.push(`- Segment: ${ctx.customer.segment ?? "Unknown"}`);
  lines.push(`- ARR: ${ctx.customer.arr ?? "Unknown"}`);
  lines.push(`- Tier: ${ctx.customer.tier}`);
  lines.push(`- Health Score: ${ctx.customer.healthScore}/100`);
  lines.push(`- Renewal: ${ctx.customer.renewalDate ?? "Unknown"}`);
  lines.push(`- Products: ${ctx.customer.products.join(", ") || "Unknown"}`);

  if (ctx.customer.signalThesis) {
    lines.push(`\n### Signal Thesis\n${ctx.customer.signalThesis}`);
  }

  if (ctx.csm) lines.push(`\n### CSM: ${ctx.csm.name} (${ctx.csm.email})`);
  if (ctx.ae) lines.push(`### AE: ${ctx.ae.name} (${ctx.ae.email})`);

  if (ctx.contacts.length > 0) {
    lines.push("\n### Key Contacts");
    for (const c of ctx.contacts) {
      lines.push(`- ${c.name} — ${c.title ?? "No title"} (${c.influence ?? "unknown influence"})`);
    }
  }

  if (ctx.recentInteractions.length > 0) {
    lines.push("\n### Recent Interactions");
    for (const i of ctx.recentInteractions.slice(0, 10)) {
      const sentimentStr = i.sentiment != null ? ` [sentiment: ${i.sentiment.toFixed(2)}]` : "";
      lines.push(`- ${i.occurredAt.split("T")[0]} ${i.type} (${i.direction}): ${i.subject ?? "No subject"}${sentimentStr}`);
    }
  }

  if (ctx.openTickets.length > 0) {
    lines.push("\n### Open Tickets");
    for (const t of ctx.openTickets) {
      lines.push(`- [${t.priority}] ${t.subject} — open ${t.ageDays} days`);
    }
  }

  if (ctx.activeDeals.length > 0) {
    lines.push("\n### Active Deals");
    for (const d of ctx.activeDeals) {
      lines.push(`- ${d.name}: ${d.stage} — $${d.amount ?? "TBD"} close ${d.closeDate}`);
    }
  }

  if (ctx.recentSignals.length > 0) {
    lines.push("\n### Recent Signals");
    for (const s of ctx.recentSignals.slice(0, 5)) {
      const fbStr = s.feedback ? ` (feedback: ${s.feedback})` : "";
      lines.push(`- [${s.agent}] ${s.title}${fbStr}`);
    }
  }

  return lines.join("\n");
}
