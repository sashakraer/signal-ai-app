import { graphGet, graphGetAllPages, type MsGraphCredentials } from "./client";
import { mapCalendarEvent } from "./mapper";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarSyncOptions {
  tenantId: string;
  credentials: MsGraphCredentials;
  /** MS user IDs to sync calendars for */
  userIds: string[];
  /** Start of date range to sync */
  startDate: string;
  /** End of date range to sync */
  endDate: string;
}

export interface CalendarSyncResult {
  events: number;
  errors: number;
  durationMs: number;
}

export interface UpcomingMeeting {
  id: string;
  subject: string;
  startTime: Date;
  endTime: Date;
  employeeId: string;
  attendeeEmails: string[];
  customerId: string | null;
  isExternal: boolean;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync calendar events from Microsoft Graph for monitored users.
 */
export async function syncCalendar(options: CalendarSyncOptions): Promise<CalendarSyncResult> {
  const start = Date.now();

  // TODO: For each userId:
  // 1. GET /users/{userId}/calendarView?startDateTime=...&endDateTime=...
  // 2. Map each event via mapCalendarEvent
  // 3. Upsert into interactions table (type=meeting)
  // 4. Resolve external attendees to contacts via entity-resolver

  throw new Error("Not implemented");
}

/**
 * Fetch upcoming meetings within a time window for a specific user.
 * Used by the Preparation agent to find meetings needing briefs.
 */
export async function getUpcomingMeetings(
  userId: string,
  credentials: MsGraphCredentials,
  windowHours: number
): Promise<UpcomingMeeting[]> {
  // TODO: GET /users/{userId}/calendarView with start=now, end=now+windowHours
  // Filter to external meetings only
  // Resolve attendee emails to customers
  throw new Error("Not implemented");
}
