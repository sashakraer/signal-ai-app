import type { AgentDefinition, SignalOutput } from "./types.js";
import type { MiniContext360 } from "../engine/context-builder.js";
import type { DetectedEvent } from "../engine/event-detector.js";
import { EventType } from "../engine/event-detector.js";
import { generateSignalDraft } from "../engine/intelligence.js";

// ─── Timing Constants ────────────────────────────────────────────────────────

export const DEEP_BRIEF_HOURS_BEFORE = 24;
export const QUICK_BRIEF_HOURS_BEFORE = 2;
export const MIN_MEETING_DURATION_MINUTES = 15;

// ─── Prompts ─────────────────────────────────────────────────────────────────

const DEEP_BRIEF_PROMPT = `You are the Preparation Agent generating a Deep Brief for an upcoming customer meeting.

Your brief should include:
1. **Customer Snapshot**: Health score, ARR, renewal date, current products
2. **Relationship Status**: Key contacts attending, their influence level, last interaction
3. **Active Issues**: Open tickets, their age and priority
4. **Deal Status**: Any active deals, stage, amount, close date
5. **Recent History**: Summary of last 5 interactions and their sentiment trend
6. **Talking Points**: 3-5 specific topics the recipient should raise
7. **Risks & Opportunities**: Any signals that require attention

Format the body as a structured brief the recipient can scan in 2 minutes.`;

const QUICK_BRIEF_PROMPT = `You are the Preparation Agent generating a Quick Brief for a meeting starting soon.

Keep it brief (3-4 bullet points):
1. Any updates since the last brief or in the last 24 hours
2. Key reminder of the most important topic to address
3. One specific data point to reference in the meeting

Format as a quick-scan list. No need for full context — the recipient already has the deep brief.`;

// ─── Agent ───────────────────────────────────────────────────────────────────

async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  const meetingStart = event.data.startTime
    ? new Date(event.data.startTime as string)
    : event.occurredAt;

  const briefType = determineBriefType(meetingStart);
  if (!briefType) return [];

  // Determine recipient — CSM is primary, fallback to meeting organizer
  const recipientId = context.csm?.id ?? (event.data.employeeId as string);
  if (!recipientId) return [];

  const prompt = briefType === "deep_brief" ? DEEP_BRIEF_PROMPT : QUICK_BRIEF_PROMPT;
  const draft = await generateSignalDraft(prompt, context, event.data);

  // Schedule: deep brief at 08:00 day before, quick brief 2h before
  const scheduledFor = briefType === "deep_brief"
    ? getDeepBriefTime(meetingStart)
    : getQuickBriefTime(meetingStart);

  return [
    {
      tenantId: event.tenantId,
      customerId: event.customerId!,
      type: "meeting_prep",
      subtype: briefType,
      severity: draft.severity,
      agent: "preparation",
      recipientEmployeeId: recipientId,
      channel: "email",
      title: draft.title,
      body: draft.body,
      recommendation: draft.recommendation,
      scheduledFor,
      triggeringEventId: null,
      contextSnapshot: context,
      suppressed: false,
      suppressionReason: null,
    },
  ];
}

/**
 * Determine which brief type to generate based on time until meeting.
 */
export function determineBriefType(
  meetingStartTime: Date,
  now: Date = new Date()
): "deep_brief" | "quick_brief" | null {
  const hoursUntilMeeting =
    (meetingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilMeeting <= 0) return null;
  if (hoursUntilMeeting <= QUICK_BRIEF_HOURS_BEFORE + 1) return "quick_brief";
  if (hoursUntilMeeting <= DEEP_BRIEF_HOURS_BEFORE + 1) return "deep_brief";
  return null;
}

function getDeepBriefTime(meetingStart: Date): Date {
  const brief = new Date(meetingStart);
  brief.setDate(brief.getDate() - 1);
  brief.setHours(8, 0, 0, 0);
  return brief;
}

function getQuickBriefTime(meetingStart: Date): Date {
  return new Date(meetingStart.getTime() - QUICK_BRIEF_HOURS_BEFORE * 60 * 60 * 1000);
}

export const preparationAgent: AgentDefinition = {
  name: "preparation",
  description: "Generates meeting preparation briefs (deep and quick) for upcoming customer meetings",
  handles: [EventType.MEETING_SCHEDULED],
  process,
};
