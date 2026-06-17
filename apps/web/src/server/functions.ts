import { createServerFn } from "@tanstack/react-start";

type MailCore = typeof import("@jack/mail-core");

const DEFAULT_ACCOUNT_ID = "default";

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

function hasLocalMailbox(core: MailCore) {
  if (!core.isAuthenticated()) return false;

  const db = core.getDb();
  const state = core.getSyncState(db);
  return state.initialSyncDone;
}

function getThreadMessageCount(core: MailCore, threadId: string): number {
  const db = core.getDb();
  const row = db
    .query("SELECT COUNT(*) as cnt FROM messages WHERE thread_id = ?")
    .get(threadId) as { cnt: number } | null;
  return row?.cnt ?? 1;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistSentMessage(core: MailCore, messageId: string) {
  const db = core.getDb();

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const sent = await core.getMessageFull(messageId);
      core.insertMessageBatch(db, [
        {
          messageId: sent.messageId,
          threadId: sent.threadId,
          historyId: sent.historyId,
          snippet: sent.snippet,
          subject: sent.subject,
          from: sent.from,
          to: sent.to,
          cc: sent.cc,
          date: sent.date,
          dateEpoch: sent.dateEpoch,
          internalDate: sent.internalDate,
          attachmentCount: sent.attachmentCount,
          sizeEstimate: sent.sizeEstimate,
          labelIds: sent.labelIds,
          rawHeaders: sent.rawHeaders,
        },
      ]);
      core.cacheBody(db, sent.messageId, sent.bodyText, sent.bodyRaw);
      return;
    } catch (error) {
      if (attempt === 3) {
        console.warn("Failed to persist sent message locally", {
          messageId,
          error,
        });
        return;
      }

      await sleep(200 * (attempt + 1));
    }
  }
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
    const isReady = hasLocalMailbox(core);
    if (!isReady)
      return {
        inbox: 0,
        primary: 0,
        promotions: 0,
        social: 0,
        updates: 0,
        forums: 0,
        starred: 0,
      };

    const db = core.getDb();
    const inboxFilter = {
      extraWhere: {
        clauses: [
          "EXISTS (SELECT 1 FROM message_labels ml_inbox WHERE ml_inbox.message_id = m.message_id AND ml_inbox.label_id = 'INBOX')",
        ],
        params: [] as any[],
      },
    };
    return {
      inbox: core.countMessages(db, { labelFilter: "INBOX", unread: true }),
      primary: core.countMessages(db, {
        labelFilter: "CATEGORY_PERSONAL",
        unread: true,
        ...inboxFilter,
      }),
      promotions: core.countMessages(db, {
        labelFilter: "CATEGORY_PROMOTIONS",
        unread: true,
        ...inboxFilter,
      }),
      social: core.countMessages(db, {
        labelFilter: "CATEGORY_SOCIAL",
        unread: true,
        ...inboxFilter,
      }),
      updates: core.countMessages(db, {
        labelFilter: "CATEGORY_UPDATES",
        unread: true,
        ...inboxFilter,
      }),
      forums: core.countMessages(db, {
        labelFilter: "CATEGORY_FORUMS",
        unread: true,
      }),
      starred: core.countMessages(db, {
        starred: true,
      }),
    };
  },
);

export const getInboxEmails = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
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
    const isReady = hasLocalMailbox(core);
    if (!isReady) return null;

    const db = core.getDb();
    const stored = core.getMessageById(db, data.emailId);
    if (!stored) return null;

    let cached = core.getCachedBody(db, data.emailId);
    let fetchedAttachments: Awaited<
      ReturnType<MailCore["getEmail"]>
    >["attachments"] | null = null;
    if (!cached) {
      const result = await core.getEmail(data.emailId);
      core.cacheBody(db, data.emailId, result.body, result.rawBody);
      cached = { bodyText: result.body, bodyRaw: result.rawBody };
      fetchedAttachments = result.attachments;
    }

    const bodyHtml = isRawHtml(cached.bodyRaw) ? cached.bodyRaw : null;

    // If the body has cid: references and we don't yet know the parts,
    // fetch metadata so inline images can resolve.
    let inlineParts: Array<{
      attachmentId: string;
      contentId: string | null;
      filename: string;
      mimeType: string;
    }> = [];
    if (bodyHtml && /\bsrc=["']?cid:/i.test(bodyHtml)) {
      const atts =
        fetchedAttachments ?? (await core.getEmail(data.emailId)).attachments;
      inlineParts = atts
        .filter((a) => a.isInline || a.contentId)
        .map((a) => ({
          attachmentId: a.attachmentId,
          contentId: a.contentId ?? null,
          filename: a.filename,
          mimeType: a.mimeType,
        }));
    }

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
      inlineParts,
    };
  });

export const getAttachments = createServerFn({ method: "GET" })
  .inputValidator((data: { emailId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
    if (!isReady) return [];

    const result = await core.getEmail(data.emailId);
    return result.attachments.map((attachment) => ({
      id: attachment.attachmentId,
      emailId: data.emailId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      contentId: attachment.contentId ?? null,
      isInline: !!attachment.isInline,
    }));
  });

const CATEGORY_LABELS: Record<string, string> = {
  primary: "CATEGORY_PERSONAL",
  promotions: "CATEGORY_PROMOTIONS",
  social: "CATEGORY_SOCIAL",
  updates: "CATEGORY_UPDATES",
  forums: "CATEGORY_FORUMS",
  unread: "INBOX",
  starred: "STARRED",
};

/** Categories that are subsets of inbox — views and counts require INBOX label */
const INBOX_SCOPED_CATEGORIES = new Set([
  "primary",
  "promotions",
  "social",
  "updates",
]);

export type CategoryKey = keyof typeof CATEGORY_LABELS;

type MailViewFilter = {
  labelFilter?: string;
  extraWhere?: { clauses: string[]; params: any[] };
};

function buildMailViewFilter(options: {
  category?: string;
  labelId?: string;
}): MailViewFilter {
  if (options.labelId) {
    const filter: MailViewFilter = { labelFilter: options.labelId };
    if (options.category) {
      filter.extraWhere = {
        clauses: [
          "EXISTS (SELECT 1 FROM message_labels ml_inbox WHERE ml_inbox.message_id = m.message_id AND ml_inbox.label_id = 'INBOX')",
        ],
        params: [],
      };
    }
    return filter;
  }

  const isArchive = options.category === "archive";
  const labelFilter = isArchive
    ? undefined
    : options.category && options.category in CATEGORY_LABELS
      ? CATEGORY_LABELS[options.category]
      : "INBOX";

  const clauses: string[] = [];
  const params: any[] = [];

  if (options.category && INBOX_SCOPED_CATEGORIES.has(options.category)) {
    clauses.push(
      "EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = 'INBOX')",
    );
  }
  if (isArchive) {
    clauses.push(
      "NOT EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = 'INBOX')",
    );
  }
  if (options.category === "unread") {
    clauses.push(
      "EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = 'UNREAD')",
    );
  }

  return {
    labelFilter,
    ...(clauses.length > 0 ? { extraWhere: { clauses, params } } : {}),
  };
}

function messageMatchesMailView(
  labelIds: string[],
  options: {
    category?: string;
    labelId?: string;
  },
): boolean {
  if (options.labelId) {
    if (options.category) {
      return labelIds.includes(options.labelId) && labelIds.includes("INBOX");
    }
    return labelIds.includes(options.labelId);
  }

  const category = options.category;
  if (!category) {
    return labelIds.includes("INBOX");
  }
  if (category === "archive") {
    return !labelIds.includes("INBOX");
  }
  if (category === "unread") {
    return labelIds.includes("INBOX") && labelIds.includes("UNREAD");
  }

  const categoryLabel = CATEGORY_LABELS[category];
  if (!categoryLabel) return labelIds.includes("INBOX");
  if (INBOX_SCOPED_CATEGORIES.has(category)) {
    return labelIds.includes("INBOX") && labelIds.includes(categoryLabel);
  }
  return labelIds.includes(categoryLabel);
}

function mergeExtraWhere(
  ...parts: Array<{ clauses: string[]; params: any[] } | undefined>
): { clauses: string[]; params: any[] } | undefined {
  const clauses = parts.flatMap((part) => part?.clauses ?? []);
  const params = parts.flatMap((part) => part?.params ?? []);
  if (clauses.length === 0) return undefined;
  return { clauses, params };
}

export const getThreadedInboxEmails = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountId?: string;
      limit?: number;
      threadsOnly?: boolean;
      category?: string;
      labelId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
    if (!isReady) return { threads: [], accountId: null };

    const db = core.getDb();
    const filter = buildMailViewFilter({
      category: data.category,
      labelId: data.labelId,
    });
    const rows = core.queryThreads(db, {
      labelFilter: filter.labelFilter,
      maxResults: data.limit || 50,
      ...(data.threadsOnly ? { minThreadCount: 2 } : {}),
      ...(filter.extraWhere ? { extraWhere: filter.extraWhere } : {}),
    });

    return {
      threads: rows.map((r) => toThreadSummary(r.latest, r.count)),
      accountId: DEFAULT_ACCOUNT_ID,
    };
  });

export const searchThreadedInboxEmails = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountId?: string;
      query: string;
      limit?: number;
      category?: string;
      labelId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
    if (!isReady) return { threads: [], accountId: null };

    const db = core.getDb();
    const limit = data.limit || 50;
    const filter = buildMailViewFilter({
      category: data.category,
      labelId: data.labelId,
    });

    // Parse Gmail-style query (from:, to:, is:unread, etc.)
    const parsed = core.parseGmailQuery(data.query);

    // If the query has structured operators that can run locally, use queryThreads
    if (parsed.canRunLocally && parsed.whereClauses.length > 0) {
      const extraWhere = mergeExtraWhere(
        filter.extraWhere,
        {
          clauses: parsed.whereClauses,
          params: parsed.params,
        },
      );
      const rows = core.queryThreads(db, {
        labelFilter: filter.labelFilter,
        maxResults: limit,
        ...(extraWhere ? { extraWhere } : {}),
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
      if (
        !messageMatchesMailView(hit.message.labelIds, {
          category: data.category,
          labelId: data.labelId,
        })
      ) {
        continue;
      }
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

export const getUserLabels = createServerFn({ method: "GET" }).handler(
  async () => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
    if (!isReady) return { labels: [] as Array<{ id: string; name: string; unread: number }> };

    const db = core.getDb();
    const inboxFilter = {
      extraWhere: {
        clauses: [
          "EXISTS (SELECT 1 FROM message_labels ml_inbox WHERE ml_inbox.message_id = m.message_id AND ml_inbox.label_id = 'INBOX')",
        ],
        params: [] as any[],
      },
    };
    const labels = core.getLabels(db)
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.labelId,
        name: label.name,
        unread: core.countMessages(db, {
          labelFilter: label.labelId,
          unread: true,
          ...(label.name.startsWith("Cmail/") ? inboxFilter : {}),
        }),
      }));

    return { labels };
  },
);

export const createLabelAction = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const created = await core.createLabel(data.name.trim());
    const db = core.getDb();
    core.upsertLabels(db, [{ id: created.id, name: created.name, type: "user" }]);

    return created;
  });

export const updateLabelAction = createServerFn({ method: "POST" })
  .inputValidator((data: { labelId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const updated = await core.updateLabel(data.labelId, data.name.trim());
    const db = core.getDb();
    core.updateStoredLabel(db, updated.id, updated.name);

    return updated;
  });

export const deleteLabelAction = createServerFn({ method: "POST" })
  .inputValidator((data: { labelId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    await core.deleteLabel(data.labelId);
    const db = core.getDb();
    core.deleteStoredLabel(db, data.labelId);

    return { success: true };
  });

export const getThreadEmails = createServerFn({ method: "GET" })
  .inputValidator((data: { threadId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
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
      inlineParts: Array<{
        attachmentId: string;
        contentId: string | null;
        filename: string;
        mimeType: string;
      }>;
    }>;

    for (const row of rows) {
      let bodyText = row.body_text;
      let bodyRaw = row.body_raw;
      let fetchedAttachments: Awaited<
        ReturnType<MailCore["getEmail"]>
      >["attachments"] | null = null;

      if (!bodyText && !bodyRaw) {
        const fetched = await core.getEmail(row.message_id);
        core.cacheBody(db, row.message_id, fetched.body, fetched.rawBody);
        bodyText = fetched.body;
        bodyRaw = fetched.rawBody;
        fetchedAttachments = fetched.attachments;
      }

      const labels = row.label_ids
        ? row.label_ids.split(",").map((l) => l.trim()).filter(Boolean)
        : [];

      const bodyHtml = isRawHtml(bodyRaw) ? bodyRaw : null;
      let inlineParts: Array<{
        attachmentId: string;
        contentId: string | null;
        filename: string;
        mimeType: string;
      }> = [];
      if (bodyHtml && /\bsrc=["']?cid:/i.test(bodyHtml)) {
        const atts =
          fetchedAttachments ??
          (await core.getEmail(row.message_id)).attachments;
        inlineParts = atts
          .filter((a) => a.isInline || a.contentId)
          .map((a) => ({
            attachmentId: a.attachmentId,
            contentId: a.contentId ?? null,
            filename: a.filename,
            mimeType: a.mimeType,
          }));
      }

      result.push({
        id: row.message_id,
        accountId: DEFAULT_ACCOUNT_ID,
        threadId: row.thread_id,
        subject: row.subject || null,
        sender: row.from,
        recipients: toRecipients(row.to, row.cc),
        snippet: row.snippet || null,
        bodyText: bodyText || null,
        bodyHtml,
        date: toUnixSecondsFromMs(row.internal_date),
        labels,
        hasAttachments: row.attachment_count > 0,
        isRead: !labels.includes("UNREAD"),
        inlineParts,
      });
    }

    return result;
  });

export const createDraftAction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
      replyToMessageId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    if (data.replyToMessageId) {
      const result = await core.createReplyDraft({
        messageId: data.replyToMessageId,
        body: data.body,
        cc: data.cc,
        bcc: data.bcc,
      });
      return { id: result.id, messageId: result.messageId, threadId: result.threadId };
    }

    const result = await core.createDraft({
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      body: data.body,
    });
    return { id: result.id, messageId: result.messageId, threadId: result.threadId };
  });

export const sendEmailAction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
      replyToMessageId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    if (data.replyToMessageId) {
      const result = await core.sendReply({
        messageId: data.replyToMessageId,
        body: data.body,
        cc: data.cc,
        bcc: data.bcc,
      });
      if (result.messageId) {
        void persistSentMessage(core, result.messageId);
      }
      return { messageId: result.messageId, threadId: result.threadId };
    }

    const result = await core.sendMessage({
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      body: data.body,
    });
    if (result.messageId) {
      void persistSentMessage(core, result.messageId);
    }
    return { messageId: result.messageId, threadId: result.threadId };
  });

export const setReadStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { messageId: string; isRead: boolean }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const db = core.getDb();

    if (data.isRead) {
      await core.markAsRead(data.messageId);
      core.removeLabels(db, data.messageId, ["UNREAD"]);
    } else {
      await core.markAsUnread(data.messageId);
      core.addLabels(db, data.messageId, ["UNREAD"]);
    }

    return { success: true };
  });

export const removeFromInboxAction = createServerFn({ method: "POST" })
  .inputValidator((data: { threadId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const db = core.getDb();
    console.log(`[archive] request thread=${data.threadId}`);

    // Update the local cache before the network call. The UI has already hidden
    // the thread optimistically; doing the DB change first keeps a page refresh
    // from resurrecting the row while Gmail is still processing the archive.
    core.removeThreadLabels(db, data.threadId, ["INBOX"]);
    try {
      await core.removeThreadFromInbox(data.threadId);
      console.log(`[archive] success thread=${data.threadId}`);
    } catch (error) {
      console.error(`[archive] failed thread=${data.threadId}`, error);
      core.addThreadLabels(db, data.threadId, ["INBOX"]);
      throw error;
    }

    return { success: true };
  });

export const addToInboxAction = createServerFn({ method: "POST" })
  .inputValidator((data: { threadId: string }) => data)
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    const db = core.getDb();

    core.addThreadLabels(db, data.threadId, ["INBOX"]);
    try {
      await core.addThreadToInbox(data.threadId);
    } catch (error) {
      core.removeThreadLabels(db, data.threadId, ["INBOX"]);
      throw error;
    }

    return { success: true };
  });

export const setThreadLabelsAction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { threadId: string; addLabelIds: string[]; removeLabelIds: string[] }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();

    if (!core.isAuthenticated()) {
      throw new Error("Not authenticated. Run 'cmail auth' first.");
    }

    await core.modifyThreadLabels(data.threadId, data.addLabelIds, data.removeLabelIds);
    const db = core.getDb();

    if (data.addLabelIds.length > 0) {
      core.addThreadLabels(db, data.threadId, data.addLabelIds);
    }
    if (data.removeLabelIds.length > 0) {
      core.removeThreadLabels(db, data.threadId, data.removeLabelIds);
    }

    return { success: true };
  });

export const getContactsList = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { query?: string; sort?: string; dir?: string }) => data,
  )
  .handler(async ({ data }) => {
    const core = await getCore();
    const isReady = hasLocalMailbox(core);
    if (!isReady) return { contacts: [] as Array<{ email: string; name: string; messageCount: number; threadCount: number; lastContactDate: number; firstContactDate: number }> };

    const db = core.getDb();
    const contacts = core.queryContacts(db, {
      query: data.query,
      sort: data.sort as any,
      dir: data.dir as any,
    });

    return {
      contacts: contacts.map((c) => ({
        email: c.email,
        name: c.name,
        messageCount: c.messageCount,
        threadCount: c.threadCount,
        lastContactDate: toUnixSecondsFromMs(c.lastContactDate),
        firstContactDate: toUnixSecondsFromMs(c.firstContactDate),
      })),
    };
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
