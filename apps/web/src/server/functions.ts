import { createServerFn } from "@tanstack/react-start";

type MailCore = typeof import("@jack/mail-core");

const DEFAULT_ACCOUNT_ID = "default";
const STALE_MS = 5 * 60 * 1000;

async function getCore(): Promise<MailCore> {
  return await import("@jack/mail-core");
}

function splitAddresses(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toRecipients(to: string, cc: string): string[] {
  return [...splitAddresses(to), ...splitAddresses(cc)];
}

function isRawHtml(raw: string | null): boolean {
  if (!raw) return false;
  return /<\s*html|<\s*body|<\s*div|<\s*p|<!DOCTYPE/i.test(raw);
}

function toUnixSecondsFromMs(value: number): number {
  if (!value) return Math.floor(Date.now() / 1000);
  return Math.floor(value / 1000);
}

type StoredMessageLike = {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  snippet: string;
  internalDate: number;
  labelIds: string[];
  attachmentCount: number;
};

function toThreadSummary(message: StoredMessageLike, threadCount: number) {
  return {
    id: message.messageId,
    threadId: message.threadId,
    subject: message.subject || null,
    sender: message.from,
    recipients: toRecipients(message.to, message.cc),
    snippet: message.snippet || null,
    date: toUnixSecondsFromMs(message.internalDate),
    labels: message.labelIds,
    hasAttachments: message.attachmentCount > 0,
    isRead: !message.labelIds.includes("UNREAD"),
    threadCount,
  };
}

async function getAccountInfo(core: MailCore) {
  if (!core.isAuthenticated()) return null;

  const db = core.getDb();
  const state = core.getSyncState(db);

  if (state.emailAddress) {
    return {
      id: DEFAULT_ACCOUNT_ID,
      email: state.emailAddress,
      historyId: state.historyId,
      initialSyncDone: state.initialSyncDone,
    };
  }

  const profile = await core.getProfile();
  core.setSyncState(db, {
    emailAddress: profile.emailAddress,
    historyId: profile.historyId,
  });

  return {
    id: DEFAULT_ACCOUNT_ID,
    email: profile.emailAddress,
    historyId: profile.historyId,
    initialSyncDone: state.initialSyncDone,
  };
}

async function ensureSynced(core: MailCore) {
  if (!core.isAuthenticated()) return false;

  const db = core.getDb();
  const state = core.getSyncState(db);

  if (!state.initialSyncDone) {
    await core.initialSync(db);
    return true;
  }

  if (!state.lastSyncAt || Date.now() - state.lastSyncAt > STALE_MS) {
    await core.incrementalSync(db);
  }

  return true;
}

function getThreadMessageCount(core: MailCore, threadId: string): number {
  const db = core.getDb();
  const row = db
    .query("SELECT COUNT(*) as cnt FROM messages WHERE thread_id = ?")
    .get(threadId) as { cnt: number } | null;
  return row?.cnt ?? 1;
}

export const bootstrapAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const core = await getCore();
    const account = await getAccountInfo(core);

    if (!account) {
      return { success: false, error: "No authenticated Gmail account found" };
    }

    return {
      success: true,
      accountId: account.id,
      email: account.email,
      isNew: !account.initialSyncDone,
    };
  },
);

export const getConnectedAccounts = createServerFn({ method: "GET" }).handler(
  async () => {
    const core = await getCore();
    const account = await getAccountInfo(core);
    if (!account) return [];

    return [
      {
        id: account.id,
        email: account.email,
        history_id: account.historyId,
      },
    ];
  },
);

export const syncAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId: string }) => data)
  .handler(async () => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const db = core.getDb();
    const state = core.getSyncState(db);

    if (!state.initialSyncDone) {
      await core.initialSync(db);
      const nextState = core.getSyncState(db);
      return {
        emailCount: 0,
        historyId: nextState.historyId ?? "",
      };
    }

    await core.incrementalSync(db);
    const nextState = core.getSyncState(db);
    return {
      emailCount: 0,
      historyId: nextState.historyId ?? "",
    };
  });

export const getSidebarCounts = createServerFn({ method: "GET" }).handler(
  async () => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady)
      return {
        inbox: 0,
        primary: 0,
        promotions: 0,
        social: 0,
        updates: 0,
        forums: 0,
        unread: 0,
        starred: 0,
      };

    const db = core.getDb();
    return {
      inbox: core.countMessages(db, { labelFilter: "INBOX", unread: true }),
      primary: core.countMessages(db, { labelFilter: "CATEGORY_PERSONAL" }),
      promotions: core.countMessages(db, {
        labelFilter: "CATEGORY_PROMOTIONS",
      }),
      social: core.countMessages(db, { labelFilter: "CATEGORY_SOCIAL" }),
      updates: core.countMessages(db, { labelFilter: "CATEGORY_UPDATES" }),
      forums: core.countMessages(db, { labelFilter: "CATEGORY_FORUMS" }),
      unread: core.countMessages(db, { labelFilter: "INBOX", unread: true }),
      starred: core.countMessages(db, { labelFilter: "INBOX", starred: true }),
    };
  },
);

export const getInboxEmails = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return { emails: [], accountId: null };

    const db = core.getDb();
    const rows = core.queryThreads(db, {
      labelFilter: "INBOX",
      maxResults: data.limit || 50,
    });

    return {
      emails: rows.map((r) => toThreadSummary(r.latest, r.count)),
      accountId: DEFAULT_ACCOUNT_ID,
    };
  });

export const getEmailById = createServerFn({ method: "GET" })
  .inputValidator((data: { emailId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return null;

    const db = core.getDb();
    const stored = core.getMessageById(db, data.emailId);
    if (!stored) return null;

    let cached = core.getCachedBody(db, data.emailId);
    if (!cached) {
      const result = await core.getEmail(data.emailId);
      core.cacheBody(db, data.emailId, result.body, result.rawBody);
      cached = { bodyText: result.body, bodyRaw: result.rawBody };
    }

    const bodyHtml = isRawHtml(cached.bodyRaw) ? cached.bodyRaw : null;

    return {
      id: stored.messageId,
      accountId: DEFAULT_ACCOUNT_ID,
      threadId: stored.threadId,
      subject: stored.subject || null,
      sender: stored.from,
      recipients: toRecipients(stored.to, stored.cc),
      snippet: stored.snippet || null,
      bodyText: cached.bodyText || null,
      bodyHtml,
      date: toUnixSecondsFromMs(stored.internalDate),
      labels: stored.labelIds,
      hasAttachments: stored.attachmentCount > 0,
      isRead: !stored.labelIds.includes("UNREAD"),
    };
  });

export const getAttachments = createServerFn({ method: "GET" })
  .inputValidator((data: { emailId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return [];

    const result = await core.getEmail(data.emailId);
    return result.attachments.map((attachment) => ({
      id: attachment.attachmentId,
      emailId: data.emailId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    }));
  });

const CATEGORY_LABELS: Record<string, string> = {
  primary: "CATEGORY_PERSONAL",
  promotions: "CATEGORY_PROMOTIONS",
  social: "CATEGORY_SOCIAL",
  updates: "CATEGORY_UPDATES",
  forums: "CATEGORY_FORUMS",
  unread: "INBOX",
  starred: "INBOX",
};

export type CategoryKey = keyof typeof CATEGORY_LABELS;

export const getThreadedInboxEmails = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountId?: string;
      limit?: number;
      threadsOnly?: boolean;
      category?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return { threads: [], accountId: null };

    const db = core.getDb();
    const labelFilter =
      data.category && data.category in CATEGORY_LABELS
        ? CATEGORY_LABELS[data.category]
        : "INBOX";
    const rows = core.queryThreads(db, {
      labelFilter,
      maxResults: data.limit || 50,
      ...(data.threadsOnly ? { minThreadCount: 2 } : {}),
      ...(data.category === "unread"
        ? {
            extraWhere: {
              clauses: [
                "EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = 'UNREAD')",
              ],
              params: [],
            },
          }
        : {}),
      ...(data.category === "starred"
        ? {
            extraWhere: {
              clauses: [
                "EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = 'STARRED')",
              ],
              params: [],
            },
          }
        : {}),
    });

    return {
      threads: rows.map((r) => toThreadSummary(r.latest, r.count)),
      accountId: DEFAULT_ACCOUNT_ID,
    };
  });

export const searchThreadedInboxEmails = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { accountId?: string; query: string; limit?: number }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return { threads: [], accountId: null };

    const db = core.getDb();
    const limit = data.limit || 50;

    // Parse Gmail-style query (from:, to:, is:unread, etc.)
    const parsed = core.parseGmailQuery(data.query);

    // If the query has structured operators that can run locally, use queryThreads
    if (parsed.canRunLocally && parsed.whereClauses.length > 0) {
      const rows = core.queryThreads(db, {
        maxResults: limit,
        extraWhere: {
          clauses: parsed.whereClauses,
          params: parsed.params,
        },
      });

      return {
        threads: rows.map((r) => toThreadSummary(r.latest, r.count)),
        accountId: DEFAULT_ACCOUNT_ID,
      };
    }

    // Fall back to FTS5 full-text search for plain text queries
    const maxResults = Math.max(limit * 4, 100);
    const hits = core.searchMessages(db, { query: data.query, maxResults });

    const seenThreadIds = new Set<string>();
    const threads: Array<ReturnType<typeof toThreadSummary>> = [];

    for (const hit of hits) {
      if (seenThreadIds.has(hit.message.threadId)) continue;
      seenThreadIds.add(hit.message.threadId);
      threads.push(
        toThreadSummary(
          hit.message,
          getThreadMessageCount(core, hit.message.threadId),
        ),
      );
      if (threads.length >= limit) break;
    }

    return {
      threads,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  });

export const getThreadEmails = createServerFn({ method: "GET" })
  .inputValidator((data: { threadId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = await ensureSynced(core);
    if (!isReady) return [];

    const db = core.getDb();
    const rows = db
      .query(
        `
          SELECT
            m.message_id,
            m.thread_id,
            m.subject,
            m."from",
            m."to",
            m.cc,
            m.snippet,
            m.internal_date,
            m.attachment_count,
            mb.body_text,
            mb.body_raw,
            COALESCE(GROUP_CONCAT(ml.label_id), '') AS label_ids
          FROM messages m
          LEFT JOIN message_bodies mb ON mb.message_id = m.message_id
          LEFT JOIN message_labels ml ON ml.message_id = m.message_id
          WHERE m.thread_id = ?
          GROUP BY m.message_id
          ORDER BY m.internal_date DESC
        `,
      )
      .all(data.threadId) as Array<{
      message_id: string;
      thread_id: string;
      subject: string | null;
      from: string;
      to: string;
      cc: string;
      snippet: string;
      internal_date: number;
      attachment_count: number;
      body_text: string | null;
      body_raw: string | null;
      label_ids: string;
    }>;

    const result = [] as Array<{
      id: string;
      accountId: string;
      threadId: string;
      subject: string | null;
      sender: string;
      recipients: string[];
      snippet: string | null;
      bodyText: string | null;
      bodyHtml: string | null;
      date: number;
      labels: string[];
      hasAttachments: boolean;
      isRead: boolean;
    }>;

    for (const row of rows) {
      let bodyText = row.body_text;
      let bodyRaw = row.body_raw;

      if (!bodyText && !bodyRaw) {
        const fetched = await core.getEmail(row.message_id);
        core.cacheBody(db, row.message_id, fetched.body, fetched.rawBody);
        bodyText = fetched.body;
        bodyRaw = fetched.rawBody;
      }

      const labels = row.label_ids
        ? row.label_ids.split(",").map((l) => l.trim()).filter(Boolean)
        : [];

      result.push({
        id: row.message_id,
        accountId: DEFAULT_ACCOUNT_ID,
        threadId: row.thread_id,
        subject: row.subject || null,
        sender: row.from,
        recipients: toRecipients(row.to, row.cc),
        snippet: row.snippet || null,
        bodyText: bodyText || null,
        bodyHtml: isRawHtml(bodyRaw) ? bodyRaw : null,
        date: toUnixSecondsFromMs(row.internal_date),
        labels,
        hasAttachments: row.attachment_count > 0,
        isRead: !labels.includes("UNREAD"),
      });
    }

    return result;
  });

export const downloadAttachment = createServerFn({ method: "GET" })
  .inputValidator((data: { emailId: string; attachmentId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const file = await core.downloadAttachment(data.emailId, data.attachmentId);
    const attachmentMeta = (await core.getEmail(data.emailId)).attachments.find(
      (a) => a.attachmentId === data.attachmentId,
    );

    return {
      data: file.toString("base64url"),
      mimeType: attachmentMeta?.mimeType || "application/octet-stream",
      filename: attachmentMeta?.filename || "attachment",
      size: attachmentMeta?.size || file.byteLength,
    };
  });
