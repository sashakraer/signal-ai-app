import { db } from "../../db/index.js";
import { interactions } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { graphGetAllPages, graphGet, type MsGraphCredentials } from "./client.js";
import { mapCalendarEvent, detectDirection, type GraphCalendarEvent } from "./mapper.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarSyncOptions {
  tenantId: string;
  credentials: MsGraphCredentials;
  /** MS user IDs to sync calendars for */
  userIds: string[];
  /** Email addresses corresponding to userIds (same order) */
  userEmails: string[];
  /** Internal company domains for direction detection */
  internalDomains: string[];
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
  employeeUserId: string;
  attendeeEmails: string[];
  isExternal: boolean;
}

// ─── Calendar Fields ─────────────────────────────────────────────────────────

const EVENT_SELECT = [
  "id", "subject", "bodyPreview", "start", "end",
  "organizer", "attendees", "location", "isOnlineMeeting", "isCancelled",
].join(",");

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync calendar events from Microsoft Graph for monitored users.
 */
export async function syncCalendar(options: CalendarSyncOptions): Promise<CalendarSyncResult> {
  const start = Date.now();
  const {
    tenantId, credentials, userIds, userEmails, internalDomains,
    startDate, endDate,
  } = options;
  const log = logger.child({ tenantId, job: "calendar-sync" });

  let totalEvents = 0;
  let totalErrors = 0;

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const userEmail = userEmails[i];
    const userLog = log.child({ userId });

    try {
      const { records } = await graphGetAllPages<GraphCalendarEvent>(
        `/users/${userId}/calendarView`,
        credentials,
        {
          startDateTime: startDate,
          endDateTime: endDate,
          $select: EVENT_SELECT,
          $top: "50",
        }
      );

      for (const event of records) {
        if (event.isCancelled) continue;

        try {
          const mapped = mapCalendarEvent(event, userEmail, internalDomains);

          // Skip internal-only meetings
          if (mapped.direction === "internal") continue;

          await db
            .insert(interactions)
            .values({
              tenantId,
              type: mapped.type,
              direction: mapped.direction,
              occurredAt: new Date(mapped.occurredAt),
              subject: mapped.subject,
              bodyText: mapped.bodyText,
              sourceId: mapped.sourceId,
              source: mapped.source,
              rawMetadata: mapped.rawMetadata,
            })
            .onConflictDoNothing({
              target: [interactions.tenantId, interactions.source, interactions.sourceId],
            });

          totalEvents++;
        } catch (err) {
          userLog.error(
            { eventId: event.id, error: (err as Error).message },
            "Failed to process calendar event"
          );
          totalErrors++;
        }
      }

      userLog.info({ events: records.length }, "User calendar synced");
    } catch (err) {
      userLog.error({ error: (err as Error).message }, "Failed to sync user calendar");
      totalErrors++;
    }
  }

  const durationMs = Date.now() - start;
  log.info({ totalEvents, totalErrors, durationMs }, "Calendar sync completed");

  return { events: totalEvents, errors: totalErrors, durationMs };
}

/**
 * Fetch upcoming meetings within a time window for a specific user.
 * Used by the Preparation agent to find meetings needing briefs.
 * Returns only external meetings (those with attendees outside internal domains).
 */
export async function getUpcomingMeetings(
  userId: string,
  userEmail: string,
  credentials: MsGraphCredentials,
  internalDomains: string[],
  windowHours: number
): Promise<UpcomingMeeting[]> {
  const now = new Date();
  const end = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  const { records } = await graphGetAllPages<GraphCalendarEvent>(
    `/users/${userId}/calendarView`,
    credentials,
    {
      startDateTime: now.toISOString(),
      endDateTime: end.toISOString(),
      $select: EVENT_SELECT,
      $top: "50",
    }
  );

  const domainSet = new Set(internalDomains.map((d) => d.toLowerCase()));

  return records
    .filter((event) => !event.isCancelled)
    .map((event) => {
      const attendeeEmails = event.attendees.map((a) =>
        a.emailAddress.address.toLowerCase()
      );
      const organizerEmail = event.organizer.emailAddress.address.toLowerCase();
      const allEmails = [organizerEmail, ...attendeeEmails];

      const hasExternal = allEmails.some((email) => {
        const domain = email.split("@")[1];
        return domain && !domainSet.has(domain);
      });

      return {
        id: event.id,
        subject: event.subject,
        startTime: new Date(event.start.dateTime),
        endTime: new Date(event.end.dateTime),
        employeeUserId: userId,
        attendeeEmails: allEmails,
        isExternal: hasExternal,
      };
    })
    .filter((m) => m.isExternal); // Only return external meetings
}
