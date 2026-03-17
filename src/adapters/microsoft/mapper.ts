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
  monitoredUserEmail: string,
  internalDomains: string[]
): MappedInteraction {
  const fromEmail = msg.from.emailAddress.address.toLowerCase();
  const isFromMonitored = fromEmail === monitoredUserEmail.toLowerCase();

  const allRecipients = [
    ...msg.toRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    ...msg.ccRecipients.map((r) => r.emailAddress.address.toLowerCase()),
  ];

  const allParticipants = [fromEmail, ...allRecipients];
  const direction = detectDirection(isFromMonitored, allParticipants, internalDomains);

  return {
    sourceId: msg.internetMessageId || msg.id,
    source: "outlook",
    type: "email",
    direction,
    occurredAt: msg.receivedDateTime,
    subject: msg.subject,
    bodyText: stripHtml(msg.body?.content, msg.body?.contentType),
    participantEmails: allParticipants,
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
  monitoredUserEmail: string,
  internalDomains: string[]
): MappedInteraction {
  const attendeeEmails = event.attendees.map((a) =>
    a.emailAddress.address.toLowerCase()
  );
  const organizerEmail = event.organizer.emailAddress.address.toLowerCase();
  const allParticipants = [organizerEmail, ...attendeeEmails];

  const isOrganizer = organizerEmail === monitoredUserEmail.toLowerCase();
  const direction = detectDirection(isOrganizer, allParticipants, internalDomains);

  return {
    sourceId: event.id,
    source: "outlook",
    type: "meeting",
    direction,
    occurredAt: event.start.dateTime,
    subject: event.subject,
    bodyText: event.bodyPreview || null,
    participantEmails: allParticipants,
    rawMetadata: {
      endTime: event.end.dateTime,
      location: event.location?.displayName,
      isOnlineMeeting: event.isOnlineMeeting,
      isCancelled: event.isCancelled,
      attendeeResponses: event.attendees.map((a) => ({
        email: a.emailAddress.address,
        response: a.status.response,
      })),
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detect email/meeting direction based on participants and internal domains.
 * - All participants from internal domains → "internal"
 * - From monitored user with external recipients → "outbound"
 * - Otherwise → "inbound"
 */
export function detectDirection(
  isFromMonitoredUser: boolean,
  allParticipantEmails: string[],
  internalDomains: string[]
): MappedInteraction["direction"] {
  const domainSet = new Set(internalDomains.map((d) => d.toLowerCase()));

  const allInternal = allParticipantEmails.every((email) => {
    const domain = email.toLowerCase().split("@")[1];
    return domain && domainSet.has(domain);
  });

  if (allInternal) return "internal";
  if (isFromMonitoredUser) return "outbound";
  return "inbound";
}

/**
 * Strip HTML tags from email body if content type is HTML.
 * Returns plain text or null.
 */
export function stripHtml(
  content: string | null | undefined,
  contentType: string | null | undefined
): string | null {
  if (!content) return null;
  if (contentType?.toLowerCase() !== "html") return content;

  // Basic HTML stripping — removes tags and decodes common entities
  return content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
