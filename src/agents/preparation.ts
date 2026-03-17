import type { AgentDefinition, SignalOutput } from "./types";
import type { MiniContext360 } from "@/engine/context-builder";
import type { DetectedEvent } from "@/engine/event-detector";
import { EventType } from "@/engine/event-detector";

// ─── Timing Constants ────────────────────────────────────────────────────────

/** Hours before meeting to send a deep brief */
export const DEEP_BRIEF_HOURS_BEFORE = 24;

/** Hours before meeting to send a quick brief */
export const QUICK_BRIEF_HOURS_BEFORE = 2;

/** Minimum meeting duration in minutes to warrant a brief */
export const MIN_MEETING_DURATION_MINUTES = 15;

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * Preparation Agent: generates meeting briefs for upcoming customer meetings.
 *
 * - Deep Brief: sent ~24h before, includes full context, history, and recommendations
 * - Quick Brief: sent ~2h before, includes latest updates since the deep brief
 */
async function process(
  event: DetectedEvent,
  context: MiniContext360
): Promise<SignalOutput[]> {
  // TODO: Implementation steps:
  // 1. Extract meeting details from event.data (start time, attendees, subject)
  // 2. Determine if meeting is with an external customer contact
  // 3. Calculate timing: is this a deep brief window or quick brief window?
  // 4. Check if a deep brief was already sent for this meeting
  // 5. Identify the recipient (CSM or meeting organizer)
  // 6. Build prompt with context and call intelligence.generateSignalDraft()
  // 7. Return SignalOutput with appropriate scheduling

  throw new Error("Not implemented");
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

  if (hoursUntilMeeting <= 0) return null; // Meeting already started
  if (hoursUntilMeeting <= QUICK_BRIEF_HOURS_BEFORE + 1) return "quick_brief";
  if (hoursUntilMeeting <= DEEP_BRIEF_HOURS_BEFORE + 1) return "deep_brief";
  return null; // Too far out
}

export const preparationAgent: AgentDefinition = {
  name: "preparation",
  description: "Generates meeting preparation briefs (deep and quick) for upcoming customer meetings",
  handles: [EventType.MEETING_SCHEDULED],
  process,
};
