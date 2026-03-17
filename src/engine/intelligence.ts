import { config } from "@/config";
import type { MiniContext360 } from "./context-builder";

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
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
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

// ─── Claude API Integration ──────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Call the Anthropic Messages API.
 */
export async function complete(
  options: ClaudeCompletionOptions
): Promise<ClaudeCompletionResult> {
  // TODO: POST to https://api.anthropic.com/v1/messages
  // Headers: x-api-key, anthropic-version: 2023-06-01
  // Handle rate limiting, retries, and error responses
  throw new Error("Not implemented");
}

/**
 * Analyze sentiment of a text body (email, message, meeting notes).
 * Returns a score from -1.0 (very negative) to 1.0 (very positive).
 */
export async function analyzeSentiment(
  text: string,
  context?: { customerName?: string; contactName?: string }
): Promise<SentimentAnalysis> {
  // TODO: Build a sentiment analysis prompt with context
  // Parse structured JSON response from Claude
  throw new Error("Not implemented");
}

/**
 * Generate a signal draft using Claude with full customer context.
 * The agent provides a prompt template; this function handles the Claude call.
 */
export async function generateSignalDraft(
  agentPrompt: string,
  context: MiniContext360,
  eventData: Record<string, unknown>
): Promise<SignalDraft> {
  // TODO: Build prompt combining:
  // - System prompt with agent role and formatting instructions
  // - Serialized MiniContext360
  // - Event-specific data
  // - Output format instructions (JSON with title, body, recommendation, severity)
  // Parse and validate response
  throw new Error("Not implemented");
}

/**
 * Summarize an interaction (email or meeting) for storage.
 * Returns a concise summary and key points.
 */
export async function summarizeInteraction(
  text: string,
  interactionType: "email" | "meeting" | "call"
): Promise<{ summary: string; keyPoints: string[] }> {
  // TODO: Build summarization prompt, parse response
  throw new Error("Not implemented");
}

/**
 * Detect competitor mentions and product comparisons in text.
 */
export async function detectCompetitorMentions(
  text: string,
  knownCompetitors?: string[]
): Promise<{ mentioned: boolean; competitors: string[]; context: string }> {
  // TODO: Build detection prompt, optionally seeded with known competitors
  throw new Error("Not implemented");
}
