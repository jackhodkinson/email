import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import type { EmailSummary } from "./gmail.ts";
import { emitStateChange } from "./realtime.ts";

// ─── Paths ───────────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), ".cache", "cmail");
const DB_PATH = join(CACHE_DIR, "mail.sqlite");
const OLD_CACHE_PATH = join(CACHE_DIR, "cache.sqlite");

// ─── Types ───────────────────────────────────────────────────────────

export interface SyncState {
  historyId: string | null;
  lastSyncAt: number | null;
  initialSyncDone: boolean;
  emailAddress: string | null;
  syncSince: string | null;
}

export interface StoredMessage {
  messageId: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  dateEpoch: number;
  internalDate: number;
  attachmentCount: number;
  labelIds: string[];
}

export interface ThreadQueryOpts {
  labelFilter?: string;
  from?: string;
  to?: string;
  unread?: boolean;
  starred?: boolean;
  maxResults?: number;
  query?: string;
  extraWhere?: { clauses: string[]; params: any[] };
  minThreadCount?: number;
}

export interface ThreadResult {
  latest: StoredMessage;
  count: number;
}

// ─── Connection ──────────────────────────────────────────────────────

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Clean up old key-value cache
  if (existsSync(OLD_CACHE_PATH)) {
    try { unlinkSync(OLD_CACHE_PATH); } catch {}
    try { unlinkSync(OLD_CACHE_PATH + "-wal"); } catch {}
    try { unlinkSync(OLD_CACHE_PATH + "-shm"); } catch {}
  }

  _db = new Database(DB_PATH);
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");
  _db.run("PRAGMA busy_timeout = 5000");
  initSchema(_db);
  ensureSearchIndex(_db);
  return _db;
}

// ─── Schema ──────────────────────────────────────────────────────────

function initSchema(db: Database): void {
  const exists = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    .get();
  if (exists) return;

  db.run(`
    CREATE TABLE sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      history_id TEXT,
      last_sync_at INTEGER,
      initial_sync_done INTEGER NOT NULL DEFAULT 0,
      email_address TEXT,
      sync_since TEXT
    )
  `);

  db.run(`
    CREATE TABLE labels (
      label_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT
    )
  `);

  db.run(`
    CREATE TABLE messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      history_id TEXT,
      snippet TEXT,
      subject TEXT,
      "from" TEXT,
      "to" TEXT,
      cc TEXT,
      date TEXT,
      date_epoch INTEGER,
      internal_date INTEGER,
      attachment_count INTEGER NOT NULL DEFAULT 0,
      size_estimate INTEGER,
      raw_headers TEXT
    )
  `);

  db.run(`
    CREATE TABLE message_labels (
      message_id TEXT NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
      label_id TEXT NOT NULL,
      PRIMARY KEY (message_id, label_id)
    )
  `);

  db.run(`
    CREATE TABLE message_bodies (
      message_id TEXT PRIMARY KEY REFERENCES messages(message_id) ON DELETE CASCADE,
      body_text TEXT,
      body_raw TEXT,
      fetched_at INTEGER
    )
  `);

  db.run(`
    CREATE TABLE id_map (
      short_id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run("CREATE INDEX idx_messages_thread ON messages(thread_id)");
  db.run("CREATE INDEX idx_messages_date ON messages(internal_date DESC)");
  db.run('CREATE INDEX idx_messages_from ON messages("from")');
  db.run("CREATE INDEX idx_message_labels_label ON message_labels(label_id)");

  // Seed sync_state singleton
  db.run("INSERT INTO sync_state (id) VALUES (1)");

  // Full-text search index
  db.run(`CREATE VIRTUAL TABLE search_index USING fts5(message_id UNINDEXED, subject, snippet, "from", "to", body)`);
}

// ─── FTS5 Migration ─────────────────────────────────────────────────

function ensureSearchIndex(db: Database): void {
  const hasFts = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='search_index'")
    .get();
  if (hasFts) return;

  db.run(`CREATE VIRTUAL TABLE search_index USING fts5(message_id UNINDEXED, subject, snippet, "from", "to", body)`);

  // Backfill from existing data
  db.run(`
    INSERT INTO search_index (message_id, subject, snippet, "from", "to", body)
    SELECT m.message_id, COALESCE(m.subject, ''), COALESCE(m.snippet, ''),
           COALESCE(m."from", ''), COALESCE(m."to", ''), COALESCE(mb.body_text, '')
    FROM messages m
    LEFT JOIN message_bodies mb ON mb.message_id = m.message_id
  `);
}

// ─── Sync State ──────────────────────────────────────────────────────

export function getSyncState(db: Database): SyncState {
  const row = db
    .query("SELECT history_id, last_sync_at, initial_sync_done, email_address, sync_since FROM sync_state WHERE id = 1")
    .get() as any;
  return {
    historyId: row?.history_id ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    initialSyncDone: !!row?.initial_sync_done,
    emailAddress: row?.email_address ?? null,
    syncSince: row?.sync_since ?? null,
  };
}

export function setSyncState(db: Database, state: Partial<SyncState>): void {
  const sets: string[] = [];
  const vals: any[] = [];
  if (state.historyId !== undefined) { sets.push("history_id = ?"); vals.push(state.historyId); }
  if (state.lastSyncAt !== undefined) { sets.push("last_sync_at = ?"); vals.push(state.lastSyncAt); }
  if (state.initialSyncDone !== undefined) { sets.push("initial_sync_done = ?"); vals.push(state.initialSyncDone ? 1 : 0); }
  if (state.emailAddress !== undefined) { sets.push("email_address = ?"); vals.push(state.emailAddress); }
  if (state.syncSince !== undefined) { sets.push("sync_since = ?"); vals.push(state.syncSince); }
  if (sets.length === 0) return;
  db.run(`UPDATE sync_state SET ${sets.join(", ")} WHERE id = 1`, vals);
  emitStateChange("all");
}

// ─── Labels ──────────────────────────────────────────────────────────

export function upsertLabels(db: Database, labels: { id: string; name: string; type: string }[]): void {
  if (labels.length === 0) return;
  const stmt = db.prepare("INSERT OR REPLACE INTO labels (label_id, name, type) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (const l of labels) {
      stmt.run(l.id, l.name, l.type);
    }
  });
  tx();
  emitStateChange("labels");
}

export function updateLabel(db: Database, labelId: string, name: string): void {
  db.run("UPDATE labels SET name = ? WHERE label_id = ?", [name, labelId]);
  emitStateChange("labels");
}

export function deleteLabel(db: Database, labelId: string): void {
  db.run("DELETE FROM message_labels WHERE label_id = ?", [labelId]);
  db.run("DELETE FROM labels WHERE label_id = ?", [labelId]);
  emitStateChange("labels");
}

// ─── Labels (query) ──────────────────────────────────────────────────

export interface LabelRow {
  labelId: string;
  name: string;
  type: string;
}

export function getLabels(db: Database): LabelRow[] {
  const rows = db.query("SELECT label_id, name, type FROM labels ORDER BY type, name").all() as any[];
  return rows.map((r) => ({ labelId: r.label_id, name: r.name, type: r.type }));
}

export function getLabelNameMap(db: Database): Map<string, string> {
  const rows = db.query("SELECT label_id, name FROM labels").all() as any[];
  return new Map(rows.map((r) => [r.label_id, r.name]));
}

export function resolveLabelName(db: Database, name: string): string | null {
  // Exact match on label_id (e.g., "INBOX", "STARRED")
  const byId = db.query("SELECT label_id FROM labels WHERE label_id = ?").get(name) as any;
  if (byId) return byId.label_id;

  // Case-insensitive match on name
  const byName = db.query("SELECT label_id FROM labels WHERE name = ? COLLATE NOCASE").get(name) as any;
  if (byName) return byName.label_id;

  return null;
}

// ─── Messages ────────────────────────────────────────────────────────

export interface MessageRow {
  messageId: string;
  threadId: string;
  historyId: string | null;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  dateEpoch: number;
  internalDate: number;
  attachmentCount: number;
  sizeEstimate: number;
  labelIds: string[];
  rawHeaders: Record<string, string>;
}

export function insertMessageBatch(db: Database, messages: MessageRow[]): void {
  if (messages.length === 0) return;
  const insertMsg = db.prepare(`
    INSERT OR REPLACE INTO messages
    (message_id, thread_id, history_id, snippet, subject,
     "from", "to", cc, date, date_epoch, internal_date,
     attachment_count, size_estimate, raw_headers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteLabels = db.prepare("DELETE FROM message_labels WHERE message_id = ?");
  const insertLabel = db.prepare("INSERT OR IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)");
  const deleteFts = db.prepare("DELETE FROM search_index WHERE message_id = ?");
  const insertFts = db.prepare(`
    INSERT INTO search_index (message_id, subject, snippet, "from", "to", body)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT body_text FROM message_bodies WHERE message_id = ?), ''))
  `);

  const tx = db.transaction((msgs: MessageRow[]) => {
    for (const msg of msgs) {
      insertMsg.run(
        msg.messageId, msg.threadId, msg.historyId,
        msg.snippet, msg.subject, msg.from, msg.to, msg.cc,
        msg.date, msg.dateEpoch, msg.internalDate,
        msg.attachmentCount, msg.sizeEstimate,
        JSON.stringify(msg.rawHeaders),
      );
      deleteLabels.run(msg.messageId);
      for (const labelId of msg.labelIds) {
        insertLabel.run(msg.messageId, labelId);
      }
      deleteFts.run(msg.messageId);
      insertFts.run(msg.messageId, msg.subject || '', msg.snippet || '', msg.from || '', msg.to || '', msg.messageId);
    }
  });

  tx(messages);
  emitStateChange("mail");
}

export function deleteMessage(db: Database, messageId: string): void {
  db.run("DELETE FROM search_index WHERE message_id = ?", [messageId]);
  db.run("DELETE FROM messages WHERE message_id = ?", [messageId]);
  emitStateChange("mail");
}

export function addLabels(db: Database, messageId: string, labelIds: string[]): void {
  if (labelIds.length === 0) return;
  const exists = db
    .query("SELECT 1 FROM messages WHERE message_id = ?")
    .get(messageId);
  if (!exists) return;

  const stmt = db.prepare("INSERT OR IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)");
  for (const labelId of labelIds) {
    stmt.run(messageId, labelId);
  }
  emitStateChange("mail");
}

export function removeLabels(db: Database, messageId: string, labelIds: string[]): void {
  if (labelIds.length === 0) return;
  const exists = db
    .query("SELECT 1 FROM messages WHERE message_id = ?")
    .get(messageId);
  if (!exists) return;

  const stmt = db.prepare("DELETE FROM message_labels WHERE message_id = ? AND label_id = ?");
  for (const labelId of labelIds) {
    stmt.run(messageId, labelId);
  }
  emitStateChange("mail");
}

export function removeThreadLabels(db: Database, threadId: string, labelIds: string[]): void {
  if (labelIds.length === 0) return;
  const stmt = db.prepare(
    "DELETE FROM message_labels WHERE message_id IN (SELECT message_id FROM messages WHERE thread_id = ?) AND label_id = ?"
  );
  for (const labelId of labelIds) {
    stmt.run(threadId, labelId);
  }
  emitStateChange("mail");
}

export function addThreadLabels(db: Database, threadId: string, labelIds: string[]): void {
  if (labelIds.length === 0) return;
  const msgIds = db
    .query("SELECT message_id FROM messages WHERE thread_id = ?")
    .all(threadId) as { message_id: string }[];
  const stmt = db.prepare("INSERT OR IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)");
  for (const { message_id } of msgIds) {
    for (const labelId of labelIds) {
      stmt.run(message_id, labelId);
    }
  }
  emitStateChange("mail");
}

export function getMessageById(db: Database, messageId: string): StoredMessage | null {
  const row = db.query(`
    SELECT message_id, thread_id, snippet, subject, "from", "to", cc, date,
           date_epoch, internal_date, attachment_count
    FROM messages WHERE message_id = ?
  `).get(messageId) as any;
  if (!row) return null;

  const labels = db
    .query("SELECT label_id FROM message_labels WHERE message_id = ?")
    .all(messageId) as { label_id: string }[];

  return {
    messageId: row.message_id,
    threadId: row.thread_id,
    snippet: row.snippet || "",
    subject: row.subject || "",
    from: row.from || "",
    to: row.to || "",
    cc: row.cc || "",
    date: row.date || "",
    dateEpoch: row.date_epoch || 0,
    internalDate: row.internal_date || 0,
    attachmentCount: row.attachment_count || 0,
    labelIds: labels.map((l) => l.label_id),
  };
}

// ─── Count Queries ───────────────────────────────────────────────────

export interface CountOpts {
  labelFilter?: string;
  from?: string;
  to?: string;
  unread?: boolean;
  starred?: boolean;
  all?: boolean;
  extraWhere?: { clauses: string[]; params: any[] };
}

export function countMessages(db: Database, opts: CountOpts): number {
  const params: any[] = [];
  const whereClauses: string[] = [];

  if (opts.labelFilter) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = ?)");
    params.push(opts.labelFilter);
  }

  if (opts.from) {
    whereClauses.push('m."from" LIKE ?');
    params.push(`%${opts.from}%`);
  }

  if (opts.to) {
    whereClauses.push('m."to" LIKE ?');
    params.push(`%${opts.to}%`);
  }

  if (opts.unread) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = 'UNREAD')");
  }

  if (opts.starred) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = 'STARRED')");
  }

  if (opts.extraWhere) {
    whereClauses.push(...opts.extraWhere.clauses);
    params.push(...opts.extraWhere.params);
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const row = db.query(`SELECT COUNT(*) as cnt FROM messages m ${where}`).get(...params) as any;
  return row.cnt;
}

// ─── Thread Queries ──────────────────────────────────────────────────

export function queryThreads(db: Database, opts: ThreadQueryOpts): ThreadResult[] {
  const params: any[] = [];
  const whereClauses: string[] = [];

  // Label filter (default: INBOX)
  if (opts.labelFilter) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = ?)");
    params.push(opts.labelFilter);
  }

  if (opts.from) {
    whereClauses.push('m."from" LIKE ?');
    params.push(`%${opts.from}%`);
  }

  if (opts.to) {
    whereClauses.push('m."to" LIKE ?');
    params.push(`%${opts.to}%`);
  }

  if (opts.unread) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = 'UNREAD')");
  }

  if (opts.starred) {
    whereClauses.push("EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.message_id AND ml.label_id = 'STARRED')");
  }

  if (opts.extraWhere) {
    whereClauses.push(...opts.extraWhere.clauses);
    params.push(...opts.extraWhere.params);
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const limit = opts.maxResults ?? 20;

  const outerConditions = ["rn = 1"];
  if (opts.minThreadCount && opts.minThreadCount > 1) {
    outerConditions.push("thread_count >= ?");
    params.push(opts.minThreadCount);
  }
  params.push(limit);

  const sql = `
    WITH ranked AS (
      SELECT m.*,
        ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.internal_date DESC) AS rn,
        COUNT(*) OVER (PARTITION BY m.thread_id) AS thread_count
      FROM messages m
      ${where}
    )
    SELECT * FROM ranked WHERE ${outerConditions.join(" AND ")}
    ORDER BY internal_date DESC
    LIMIT ?
  `;

  const rows = db.query(sql).all(...params) as any[];

  return rows.map((row) => {
    const labels = db
      .query("SELECT label_id FROM message_labels WHERE message_id = ?")
      .all(row.message_id) as { label_id: string }[];

    return {
      latest: {
        messageId: row.message_id,
        threadId: row.thread_id,
        snippet: row.snippet || "",
        subject: row.subject || "",
        from: row.from || "",
        to: row.to || "",
        cc: row.cc || "",
        date: row.date || "",
        dateEpoch: row.date_epoch || 0,
        internalDate: row.internal_date || 0,
        attachmentCount: row.attachment_count || 0,
        labelIds: labels.map((l) => l.label_id),
      },
      count: row.thread_count,
    };
  });
}

// ─── Search Queries ─────────────────────────────────────────────────

export interface SearchResult {
  message: StoredMessage;
  bodyText: string;
  threadCount: number;
}

export interface SearchOpts {
  query: string;
  from?: string;
  maxResults?: number;
}

export function searchMessages(db: Database, opts: SearchOpts): SearchResult[] {
  const params: any[] = [];
  const whereClauses: string[] = [];

  // Build FTS5 match query: quote each term for literal matching (implicit AND)
  const ftsQuery = opts.query
    .split(/\s+/)
    .filter(Boolean)
    .map(term => `"${term.replace(/"/g, '""')}"`)
    .join(' ');

  if (!ftsQuery) return [];

  whereClauses.push("search_index MATCH ?");
  params.push(ftsQuery);

  if (opts.from) {
    whereClauses.push('m."from" LIKE ?');
    params.push(`%${opts.from}%`);
  }

  const where = `WHERE ${whereClauses.join(" AND ")}`;
  const limit = opts.maxResults ?? 20;
  params.push(limit);

  const sql = `
    SELECT m.*, mb.body_text,
      COUNT(*) OVER (PARTITION BY m.thread_id) AS thread_count
    FROM search_index
    JOIN messages m ON m.message_id = search_index.message_id
    LEFT JOIN message_bodies mb ON mb.message_id = m.message_id
    ${where}
    ORDER BY m.internal_date DESC
    LIMIT ?
  `;

  const rows = db.query(sql).all(...params) as any[];

  return rows.map((row) => {
    const labels = db
      .query("SELECT label_id FROM message_labels WHERE message_id = ?")
      .all(row.message_id) as { label_id: string }[];

    return {
      message: {
        messageId: row.message_id,
        threadId: row.thread_id,
        snippet: row.snippet || "",
        subject: row.subject || "",
        from: row.from || "",
        to: row.to || "",
        cc: row.cc || "",
        date: row.date || "",
        dateEpoch: row.date_epoch || 0,
        internalDate: row.internal_date || 0,
        attachmentCount: row.attachment_count || 0,
        labelIds: labels.map((l) => l.label_id),
      },
      bodyText: row.body_text || "",
      threadCount: row.thread_count || 1,
    };
  });
}

// ─── Stored → EmailSummary conversion ────────────────────────────────

export function storedToSummary(msg: StoredMessage): EmailSummary {
  return {
    id: msg.messageId,
    threadId: msg.threadId,
    snippet: msg.snippet,
    from: msg.from,
    to: msg.to,
    cc: msg.cc,
    subject: msg.subject,
    date: msg.date,
    labels: msg.labelIds,
    attachmentCount: msg.attachmentCount,
  };
}

// ─── ID Map ──────────────────────────────────────────────────────────

export function saveIdMap(db: Database, entries: { shortId: string; messageId: string; threadId: string }[]): void {
  const stmt = db.prepare("INSERT OR REPLACE INTO id_map (short_id, message_id, thread_id, created_at) VALUES (?, ?, ?, ?)");
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const e of entries) {
      stmt.run(e.shortId, e.messageId, e.threadId, now);
    }
  });
  tx();
}

export function resolveShortId(db: Database, shortId: string): { messageId: string; threadId: string } | null {
  // Exact match
  const exact = db
    .query("SELECT message_id, thread_id FROM id_map WHERE short_id = ?")
    .get(shortId) as { message_id: string; thread_id: string } | null;
  if (exact) return { messageId: exact.message_id, threadId: exact.thread_id };

  // Prefix match
  const prefix = db
    .query("SELECT message_id, thread_id FROM id_map WHERE short_id LIKE (? || '%')")
    .all(shortId) as { message_id: string; thread_id: string }[];
  if (prefix.length === 1) return { messageId: prefix[0]!.message_id, threadId: prefix[0]!.thread_id };

  return null;
}

// ─── Last list (for positional read) ─────────────────────────────────

export function saveLastList(db: Database, entries: { messageId: string; threadId: string }[]): void {
  // Store as JSON in sync_state table wouldn't fit — use a simple approach:
  // Reuse the id_map with numeric keys
  const stmt = db.prepare("INSERT OR REPLACE INTO id_map (short_id, message_id, thread_id, created_at) VALUES (?, ?, ?, ?)");
  const now = Date.now();
  const tx = db.transaction(() => {
    // Clear previous positional entries (prefixed with #)
    db.run("DELETE FROM id_map WHERE short_id LIKE '#%'");
    for (let i = 0; i < entries.length; i++) {
      stmt.run(`#${i + 1}`, entries[i]!.messageId, entries[i]!.threadId, now);
    }
  });
  tx();
}

// ─── Body Cache ──────────────────────────────────────────────────────

export function getCachedBody(db: Database, messageId: string): { bodyText: string; bodyRaw: string } | null {
  const row = db
    .query("SELECT body_text, body_raw FROM message_bodies WHERE message_id = ?")
    .get(messageId) as { body_text: string; body_raw: string } | null;
  if (!row) return null;
  return { bodyText: row.body_text, bodyRaw: row.body_raw };
}

export function cacheBody(db: Database, messageId: string, bodyText: string, bodyRaw: string): void {
  db.run(
    "INSERT OR REPLACE INTO message_bodies (message_id, body_text, body_raw, fetched_at) VALUES (?, ?, ?, ?)",
    [messageId, bodyText, bodyRaw, Date.now()]
  );
  // Update FTS index with body content
  db.run("DELETE FROM search_index WHERE message_id = ?", [messageId]);
  db.run(`
    INSERT INTO search_index (message_id, subject, snippet, "from", "to", body)
    SELECT m.message_id, COALESCE(m.subject, ''), COALESCE(m.snippet, ''),
           COALESCE(m."from", ''), COALESCE(m."to", ''), ?
    FROM messages m WHERE m.message_id = ?
  `, [bodyText, messageId]);
  emitStateChange("mail");
}

export function cacheBodyBatch(
  db: Database,
  bodies: { messageId: string; bodyText: string; bodyRaw: string }[]
): void {
  if (bodies.length === 0) return;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO message_bodies (message_id, body_text, body_raw, fetched_at) VALUES (?, ?, ?, ?)"
  );
  const deleteFts = db.prepare("DELETE FROM search_index WHERE message_id = ?");
  const insertFts = db.prepare(`
    INSERT INTO search_index (message_id, subject, snippet, "from", "to", body)
    SELECT m.message_id, COALESCE(m.subject, ''), COALESCE(m.snippet, ''),
           COALESCE(m."from", ''), COALESCE(m."to", ''), ?
    FROM messages m WHERE m.message_id = ?
  `);
  const now = Date.now();
  const tx = db.transaction((items: typeof bodies) => {
    for (const b of items) {
      stmt.run(b.messageId, b.bodyText, b.bodyRaw, now);
      deleteFts.run(b.messageId);
      insertFts.run(b.bodyText, b.messageId);
    }
  });
  tx(bodies);
  emitStateChange("mail");
}

// ─── Contacts ─────────────────────────────────────────────────────────

export interface ContactRow {
  email: string;
  name: string;
  messageCount: number;
  threadCount: number;
  lastContactDate: number;
  firstContactDate: number;
}

export type ContactSortField =
  | "name"
  | "email"
  | "emails"
  | "threads"
  | "last_contacted"
  | "first_contacted";

export interface ContactQueryOpts {
  query?: string;
  sort?: ContactSortField;
  dir?: "asc" | "desc";
  limit?: number;
}

function parseAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, ""),
      email: match[2].trim(),
    };
  }
  return { name: raw.trim(), email: raw.trim() };
}

export function queryContacts(
  db: Database,
  opts?: ContactQueryOpts,
): ContactRow[] {
  const params: any[] = [];
  const whereClauses: string[] = [
    '"from" IS NOT NULL',
    "\"from\" != ''",
  ];

  // Exclude the user's own email
  const state = getSyncState(db);
  if (state.emailAddress) {
    whereClauses.push('"from" NOT LIKE ?');
    params.push(`%${state.emailAddress}%`);
  }

  if (opts?.query) {
    whereClauses.push('"from" LIKE ?');
    params.push(`%${opts.query}%`);
  }

  const where =
    whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

  const sortMap: Record<string, string> = {
    name: '"from"',
    email: '"from"',
    emails: "message_count",
    threads: "thread_count",
    last_contacted: "last_contact_date",
    first_contacted: "first_contact_date",
  };

  const sortCol =
    sortMap[opts?.sort || "last_contacted"] || "last_contact_date";
  const sortDir =
    opts?.dir === "asc" || opts?.dir === "desc" ? opts.dir : "desc";
  const limit = opts?.limit || 500;
  params.push(limit);

  const sql = `
    SELECT
      "from" AS raw_address,
      COUNT(*) AS message_count,
      COUNT(DISTINCT thread_id) AS thread_count,
      MAX(internal_date) AS last_contact_date,
      MIN(internal_date) AS first_contact_date
    FROM messages
    ${where}
    GROUP BY "from"
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ?
  `;

  const rows = db.query(sql).all(...params) as any[];

  return rows.map((row) => {
    const { name, email } = parseAddress(row.raw_address);
    return {
      email,
      name,
      messageCount: row.message_count,
      threadCount: row.thread_count,
      lastContactDate: row.last_contact_date,
      firstContactDate: row.first_contact_date,
    };
  });
}

// ─── Reset ───────────────────────────────────────────────────────────

export function resetDb(db: Database): void {
  db.run("DELETE FROM search_index");
  db.run("DELETE FROM message_bodies");
  db.run("DELETE FROM message_labels");
  db.run("DELETE FROM messages");
  db.run("DELETE FROM labels");
  db.run("DELETE FROM id_map");
  db.run("UPDATE sync_state SET history_id = NULL, last_sync_at = NULL, initial_sync_done = 0, sync_since = NULL WHERE id = 1");
  emitStateChange("all");
}
