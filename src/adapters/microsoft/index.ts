export {
  getGraphClient,
  graphGet,
  graphGetAllPages,
  graphPost,
  createSubscription,
  renewSubscription,
  clearClientCache,
  type MsGraphCredentials,
  type GraphPagedResponse,
} from "./client.js";

export {
  mapMessage,
  mapCalendarEvent,
  detectDirection,
  stripHtml,
  type GraphMessage,
  type GraphCalendarEvent,
  type MappedInteraction,
} from "./mapper.js";

export { syncMail, fetchMessage, type MailSyncOptions, type MailSyncResult } from "./mail.js";

export {
  syncCalendar,
  getUpcomingMeetings,
  type CalendarSyncOptions,
  type CalendarSyncResult,
  type UpcomingMeeting,
} from "./calendar.js";
