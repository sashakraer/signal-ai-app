// ─── Graph API Raw Types ─────────────────────────────────────────────────────

export interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  importance: string;
  conversationId: string;
  internetMessageId: string;
  [key: string]: unknown;
}

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  attendees: Array<{
    emailAddress: { name: string; address: string };
    type: string;
    status: { response: string };
  }>;
  location: { displayName: string } | null;
  isOnlineMeeting: boolean;
  isCancelled: boolean;
  [key: string]: unknown;
}

// ─── Internal Types ──────────────────────────────────────────────────────────

export interface MappedInteraction {
  sourceId: string;
  source: "outlook";
  type: "email" | "meeting";
  direction: "inbound" | "outbound" | "internal";
  occurredAt: string;
  subject: string;
  bodyText: string | null;
  participantEmails: string[];
  rawMetadata: Record<string, unknown>;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Map a Graph API Message to our internal Interaction shape.
 */
export function mapMessage(
  msg: GraphMessage,
  monitoredUserEmail: string
): MappedInteraction {
  const fromEmail = msg.from.emailAddress.address.toLowerCase();
  const isFromMonitored = fromEmail === monitoredUserEmail.toLowerCase();

  // TODO: Determine direction more accurately:
  // - If all participants are internal domain -> "internal"
  // - If from monitored user -> "outbound"
  // - Otherwise -> "inbound"
  const direction: MappedInteraction["direction"] = isFromMonitored ? "outbound" : "inbound";

  const allRecipients = [
    ...msg.toRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    ...msg.ccRecipients.map((r) => r.emailAddress.address.toLowerCase()),
  ];

  return {
    sourceId: msg.internetMessageId || msg.id,
    source: "outlook",
    type: "email",
    direction,
    occurredAt: msg.receivedDateTime,
    subject: msg.subject,
    bodyText: msg.body?.content ?? null, // TODO: strip HTML if contentType=html
    participantEmails: [fromEmail, ...allRecipients],
    rawMetadata: {
      conversationId: msg.conversationId,
      importance: msg.importance,
    },
  };
}

/**
 * Map a Graph API CalendarEvent to our internal Interaction shape.
 */
export function mapCalendarEvent(
  event: GraphCalendarEvent,
  monitoredUserEmail: string
): MappedInteraction {
  const attendeeEmails = event.attendees.map((a) =>
    a.emailAddress.address.toLowerCase()
  );
  const organizerEmail = event.organizer.emailAddress.address.toLowerCase();

  // TODO: Determine if meeting is internal or external based on email domains
  const direction: MappedInteraction["direction"] = "outbound"; // TODO: compute properly

  return {
    sourceId: event.id,
    source: "outlook",
    type: "meeting",
    direction,
    occurredAt: event.start.dateTime,
    subject: event.subject,
    bodyText: event.bodyPreview || null,
    participantEmails: [organizerEmail, ...attendeeEmails],
    rawMetadata: {
      endTime: event.end.dateTime,
      location: event.location?.displayName,
      isOnlineMeeting: event.isOnlineMeeting,
      isCancelled: event.isCancelled,
    },
  };
}
