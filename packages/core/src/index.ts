export {
  createOAuth2Client,
  exchangeCodeForTokens,
  getAuthUrl,
  isAuthenticated,
} from "./auth.ts";

export {
  cacheBody,
  cacheBodyBatch,
  countMessages,
  getCachedBody,
  getDb,
  getLabelNameMap,
  getLabels,
  getMessageById,
  getSyncState,
  queryThreads,
  resolveLabelName,
  resolveShortId,
  saveIdMap,
  saveLastList,
  searchMessages,
  setSyncState,
  storedToSummary,
  type CountOpts,
  type SearchOpts,
  type SearchResult,
  type StoredMessage,
  type SyncState,
  type ThreadQueryOpts,
  type ThreadResult,
} from "./db.ts";

export {
  buildSinceQuery,
  incrementalSync,
  initialSync,
  shouldAutoSync,
} from "./sync.ts";

export {
  createLabel,
  downloadAttachment,
  getEmail,
  getHistory,
  getMessageFull,
  getMessageMetadata,
  getProfile,
  getThread,
  modifyLabels,
  searchEmails,
  searchThreads,
  type AttachmentInfo,
  type EmailSummary,
  type HistoryEvent,
  type ParsedMessageFull,
  type ParsedMessageMetadata,
} from "./gmail.ts";

export { parseGmailQuery, type ParsedQuery } from "./query.ts";
