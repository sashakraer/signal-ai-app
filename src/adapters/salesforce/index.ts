export {
  getConnection,
  query,
  getUpdatedRecords,
  fetchRecordsByIds,
  clearAuthCache,
  type SalesforceCredentials,
  type SalesforceAuthResult,
  type SalesforceQueryResult,
  type UpdatedRecordsResult,
} from "./client.js";

export {
  mapAccount,
  mapContact,
  mapOpportunity,
  mapCase,
  inferSegment,
  inferTier,
  inferInfluence,
  inferPower,
  type SfAccount,
  type SfContact,
  type SfOpportunity,
  type SfCase,
  type MappedCustomer,
  type MappedContact,
  type MappedDeal,
  type MappedTicket,
} from "./mapper.js";

export { runSync, getLastSyncTimestamp, type SyncOptions, type SyncResult } from "./sync.js";
