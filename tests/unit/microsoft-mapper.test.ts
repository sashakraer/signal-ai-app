import { describe, it, expect } from "vitest";
import {
  mapMessage,
  mapCalendarEvent,
  detectDirection,
  stripHtml,
  type GraphMessage,
  type GraphCalendarEvent,
} from "../../src/adapters/microsoft/mapper.js";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const INTERNAL_DOMAINS = ["signal-ai.com", "signalai.co.il"];

const baseMessage: GraphMessage = {
  id: "msg-001",
  subject: "Q2 Renewal Discussion",
  bodyPreview: "Hi, let's discuss the renewal terms...",
  body: { contentType: "text", content: "Hi, let's discuss the renewal terms..." },
  from: { emailAddress: { name: "Yael Cohen", address: "yael@atlas-defense.com" } },
  toRecipients: [
    { emailAddress: { name: "David Levi", address: "david@signal-ai.com" } },
  ],
  ccRecipients: [],
  receivedDateTime: "2026-03-15T10:30:00Z",
  sentDateTime: "2026-03-15T10:29:55Z",
  isRead: false,
  importance: "normal",
  conversationId: "conv-abc",
  internetMessageId: "<msg-001@atlas-defense.com>",
};

const baseCalendarEvent: GraphCalendarEvent = {
  id: "evt-001",
  subject: "Quarterly Business Review",
  bodyPreview: "QBR with Atlas Defense team",
  start: { dateTime: "2026-03-20T14:00:00", timeZone: "Asia/Jerusalem" },
  end: { dateTime: "2026-03-20T15:00:00", timeZone: "Asia/Jerusalem" },
  organizer: { emailAddress: { name: "David Levi", address: "david@signal-ai.com" } },
  attendees: [
    {
      emailAddress: { name: "Yael Cohen", address: "yael@atlas-defense.com" },
      type: "required",
      status: { response: "accepted" },
    },
    {
      emailAddress: { name: "Rachel Stern", address: "rachel@signal-ai.com" },
      type: "required",
      status: { response: "tentativelyAccepted" },
    },
  ],
  location: { displayName: "Conference Room A" },
  isOnlineMeeting: true,
  isCancelled: false,
};

// ─── detectDirection ─────────────────────────────────────────────────────────

describe("detectDirection", () => {
  it("returns internal when all participants are from internal domains", () => {
    const result = detectDirection(true, [
      "david@signal-ai.com",
      "rachel@signal-ai.com",
      "yossi@signalai.co.il",
    ], INTERNAL_DOMAINS);
    expect(result).toBe("internal");
  });

  it("returns outbound when from monitored user with external recipients", () => {
    const result = detectDirection(true, [
      "david@signal-ai.com",
      "yael@atlas-defense.com",
    ], INTERNAL_DOMAINS);
    expect(result).toBe("outbound");
  });

  it("returns inbound when from external sender", () => {
    const result = detectDirection(false, [
      "yael@atlas-defense.com",
      "david@signal-ai.com",
    ], INTERNAL_DOMAINS);
    expect(result).toBe("inbound");
  });

  it("handles case-insensitive domain matching", () => {
    const result = detectDirection(true, [
      "David@Signal-AI.COM",
      "Rachel@SIGNAL-AI.com",
    ], INTERNAL_DOMAINS);
    expect(result).toBe("internal");
  });
});

// ─── mapMessage ──────────────────────────────────────────────────────────────

describe("mapMessage", () => {
  it("maps inbound email correctly", () => {
    const result = mapMessage(baseMessage, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.sourceId).toBe("<msg-001@atlas-defense.com>");
    expect(result.source).toBe("outlook");
    expect(result.type).toBe("email");
    expect(result.direction).toBe("inbound");
    expect(result.subject).toBe("Q2 Renewal Discussion");
    expect(result.occurredAt).toBe("2026-03-15T10:30:00Z");
    expect(result.participantEmails).toContain("yael@atlas-defense.com");
    expect(result.participantEmails).toContain("david@signal-ai.com");
  });

  it("maps outbound email correctly", () => {
    const outbound: GraphMessage = {
      ...baseMessage,
      from: { emailAddress: { name: "David Levi", address: "david@signal-ai.com" } },
      toRecipients: [
        { emailAddress: { name: "Yael Cohen", address: "yael@atlas-defense.com" } },
      ],
    };
    const result = mapMessage(outbound, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.direction).toBe("outbound");
  });

  it("maps internal email correctly", () => {
    const internal: GraphMessage = {
      ...baseMessage,
      from: { emailAddress: { name: "David Levi", address: "david@signal-ai.com" } },
      toRecipients: [
        { emailAddress: { name: "Rachel Stern", address: "rachel@signal-ai.com" } },
      ],
    };
    const result = mapMessage(internal, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.direction).toBe("internal");
  });

  it("includes CC recipients in participant emails", () => {
    const withCC: GraphMessage = {
      ...baseMessage,
      ccRecipients: [
        { emailAddress: { name: "Manager", address: "manager@atlas-defense.com" } },
      ],
    };
    const result = mapMessage(withCC, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.participantEmails).toContain("manager@atlas-defense.com");
  });

  it("falls back to msg.id when internetMessageId is empty", () => {
    const noInternet: GraphMessage = { ...baseMessage, internetMessageId: "" };
    const result = mapMessage(noInternet, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.sourceId).toBe("msg-001");
  });

  it("stores conversationId and importance in metadata", () => {
    const result = mapMessage(baseMessage, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.rawMetadata.conversationId).toBe("conv-abc");
    expect(result.rawMetadata.importance).toBe("normal");
  });
});

// ─── mapCalendarEvent ────────────────────────────────────────────────────────

describe("mapCalendarEvent", () => {
  it("maps external meeting correctly", () => {
    const result = mapCalendarEvent(baseCalendarEvent, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.sourceId).toBe("evt-001");
    expect(result.source).toBe("outlook");
    expect(result.type).toBe("meeting");
    expect(result.direction).toBe("outbound"); // organizer is monitored, has external attendee
    expect(result.subject).toBe("Quarterly Business Review");
    expect(result.occurredAt).toBe("2026-03-20T14:00:00");
  });

  it("includes all participant emails", () => {
    const result = mapCalendarEvent(baseCalendarEvent, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.participantEmails).toContain("david@signal-ai.com");
    expect(result.participantEmails).toContain("yael@atlas-defense.com");
    expect(result.participantEmails).toContain("rachel@signal-ai.com");
  });

  it("detects internal-only meeting", () => {
    const internalMeeting: GraphCalendarEvent = {
      ...baseCalendarEvent,
      attendees: [
        {
          emailAddress: { name: "Rachel Stern", address: "rachel@signal-ai.com" },
          type: "required",
          status: { response: "accepted" },
        },
      ],
    };
    const result = mapCalendarEvent(internalMeeting, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.direction).toBe("internal");
  });

  it("stores endTime, location, and online meeting info in metadata", () => {
    const result = mapCalendarEvent(baseCalendarEvent, "david@signal-ai.com", INTERNAL_DOMAINS);
    expect(result.rawMetadata.endTime).toBe("2026-03-20T15:00:00");
    expect(result.rawMetadata.location).toBe("Conference Room A");
    expect(result.rawMetadata.isOnlineMeeting).toBe(true);
    expect(result.rawMetadata.isCancelled).toBe(false);
  });

  it("includes attendee responses in metadata", () => {
    const result = mapCalendarEvent(baseCalendarEvent, "david@signal-ai.com", INTERNAL_DOMAINS);
    const responses = result.rawMetadata.attendeeResponses as Array<{
      email: string;
      response: string;
    }>;
    expect(responses).toHaveLength(2);
    expect(responses[0].response).toBe("accepted");
  });
});

// ─── stripHtml ───────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("returns plain text as-is", () => {
    expect(stripHtml("Hello world", "text")).toBe("Hello world");
  });

  it("strips HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>", "html")).toBe("Hello world");
  });

  it("removes style blocks", () => {
    expect(stripHtml("<style>.foo{color:red}</style><p>Hello</p>", "html")).toBe("Hello");
  });

  it("removes script blocks", () => {
    expect(stripHtml("<script>alert('xss')</script><p>Safe</p>", "html")).toBe("Safe");
  });

  it("decodes HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &nbsp;", "html")).toBe('& < > "');
  });

  it("returns null for null content", () => {
    expect(stripHtml(null, "html")).toBeNull();
  });

  it("returns null for undefined content", () => {
    expect(stripHtml(undefined, "text")).toBeNull();
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p>   <p>World</p>", "html")).toBe("Hello World");
  });
});
