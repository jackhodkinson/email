import type { Database } from "bun:sqlite";
import {
  getSyncState,
  setSyncState,
  upsertLabels,
  insertMessageBatch,
  cacheBodyBatch,
  deleteMessage,
  addLabels,
  removeLabels,
  resetDb,
  type MessageRow,
} from "./db.ts";
import {
  getProfile,
  getLabels,
  listAllMessageIds,
  getMessageFull,
  getHistory,
  type ParsedMessageFull,
} from "./gmail.ts";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CONCURRENT_FETCHES = 2;
const BATCH_SIZE = 500;

// ─── Public API ──────────────────────────────────────────────────────

export function shouldAutoSync(db: Database): boolean {
  const state = getSyncState(db);
  if (!state.initialSyncDone) return true;
  if (!state.lastSyncAt) return true;
  return Date.now() - state.lastSyncAt > STALE_THRESHOLD_MS;
}

export async function initialSync(db: Database, since?: string): Promise<void> {
  // Get profile for historyId watermark
  const profile = await getProfile();
  process.stderr.write(`Syncing ${profile.emailAddress}...\n`);

  // Sync labels
  const labels = await getLabels();
  upsertLabels(db, labels);

  // Build the since query
  const sinceQuery = since ?? buildSinceQuery("3m");
  setSyncState(db, { emailAddress: profile.emailAddress, syncSince: sinceQuery });

  // Collect all message IDs
  process.stderr.write("Listing messages...\r");
  const messageIds: { id: string; threadId: string }[] = [];
  for await (const msg of listAllMessageIds(sinceQuery ?? undefined)) {
    messageIds.push(msg);
    if (messageIds.length % 500 === 0) {
      process.stderr.write(`Listing messages... ${messageIds.length}\r`);
    }
  }
  process.stderr.write(`Found ${messageIds.length} messages\n`);

  // Fetch full messages in concurrent batches
  let fetched = 0;
  let batch: MessageRow[] = [];
  let bodyBatch: { messageId: string; bodyText: string; bodyRaw: string }[] = [];

  for (let i = 0; i < messageIds.length; i += CONCURRENT_FETCHES) {
    const chunk = messageIds.slice(i, i + CONCURRENT_FETCHES);
    const results = await Promise.allSettled(
      chunk.map((msg) => fetchWithRetry(() => getMessageFull(msg.id)))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const full = result.value;
        batch.push(metadataToRow(full));
        bodyBatch.push({
          messageId: full.messageId,
          bodyText: full.bodyText,
          bodyRaw: full.bodyRaw,
        });
      }
      // Skip failed messages silently — they'll be picked up on next sync
    }

    fetched += chunk.length;
    process.stderr.write(
      `Syncing messages... ${fetched}/${messageIds.length}\r`
    );

    // Flush batch to DB periodically
    if (batch.length >= BATCH_SIZE) {
      insertMessageBatch(db, batch);
      cacheBodyBatch(db, bodyBatch);
      batch = [];
      bodyBatch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    insertMessageBatch(db, batch);
    cacheBodyBatch(db, bodyBatch);
  }

  process.stderr.write(`\nSync complete: ${fetched} messages\n`);

  setSyncState(db, {
    historyId: profile.historyId,
    lastSyncAt: Date.now(),
    initialSyncDone: true,
  });
}

export async function incrementalSync(db: Database): Promise<void> {
  const state = getSyncState(db);

  if (!state.initialSyncDone || !state.historyId) {
    await initialSync(db, state.syncSince ?? undefined);
    return;
  }

  // Refresh labels
  const labels = await getLabels();
  upsertLabels(db, labels);

  // Process history events
  const newMessageIds: string[] = [];
  let newHistoryId = state.historyId;

  try {
    for await (const event of getHistory(state.historyId)) {
      switch (event.type) {
        case "messageAdded":
          newMessageIds.push(event.messageId);
          break;
        case "messageDeleted":
          deleteMessage(db, event.messageId);
          break;
        case "labelsAdded":
          addLabels(db, event.messageId, event.labelIds);
          break;
        case "labelsRemoved":
          removeLabels(db, event.messageId, event.labelIds);
          break;
        case "syncComplete":
          newHistoryId = event.historyId;
          break;
      }
    }
  } catch (err: any) {
    if (err?.code === 404 || err?.response?.status === 404) {
      process.stderr.write("Sync state expired. Running full re-sync...\n");
      resetDb(db);
      await initialSync(db, state.syncSince ?? undefined);
      return;
    }
    throw err;
  }

  // Fetch full messages for new arrivals
  if (newMessageIds.length > 0) {
    const batch: MessageRow[] = [];
    const bodyBatch: { messageId: string; bodyText: string; bodyRaw: string }[] = [];
    for (let i = 0; i < newMessageIds.length; i += CONCURRENT_FETCHES) {
      const chunk = newMessageIds.slice(i, i + CONCURRENT_FETCHES);
      const results = await Promise.allSettled(
        chunk.map((id) => fetchWithRetry(() => getMessageFull(id)))
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          const full = result.value;
          batch.push(metadataToRow(full));
          bodyBatch.push({
            messageId: full.messageId,
            bodyText: full.bodyText,
            bodyRaw: full.bodyRaw,
          });
        }
      }
    }
    if (batch.length > 0) {
      insertMessageBatch(db, batch);
      cacheBodyBatch(db, bodyBatch);
    }
  }

  setSyncState(db, {
    historyId: newHistoryId,
    lastSyncAt: Date.now(),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function metadataToRow(meta: ParsedMessageFull): MessageRow {
  return {
    messageId: meta.messageId,
    threadId: meta.threadId,
    historyId: meta.historyId,
    snippet: meta.snippet,
    subject: meta.subject,
    from: meta.from,
    to: meta.to,
    cc: meta.cc,
    date: meta.date,
    dateEpoch: meta.dateEpoch,
    internalDate: meta.internalDate,
    attachmentCount: meta.attachmentCount,
    sizeEstimate: meta.sizeEstimate,
    labelIds: meta.labelIds,
    rawHeaders: meta.rawHeaders,
  };
}

export function buildSinceQuery(since: string): string | null {
  if (since === "all") return null;

  const match = since.match(/^(\d+)(d|m|y)$/);
  if (!match) return null;

  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const date = new Date();

  switch (unit) {
    case "d":
      date.setDate(date.getDate() - amount);
      break;
    case "m":
      date.setMonth(date.getMonth() - amount);
      break;
    case "y":
      date.setFullYear(date.getFullYear() - amount);
      break;
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `after:${yyyy}/${mm}/${dd}`;
}

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status;
      const message = String(err?.message ?? "");
      const isQuotaError =
        status === 429 ||
        (status === 403 && /quota|rate limit|userRateLimitExceeded/i.test(message));
      if (isQuotaError && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
