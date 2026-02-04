/**
 * Database schema initialization script
 * Run with: bun run src/lib/db/schema.ts
 *
 * This script is idempotent - safe to run multiple times.
 */

import { db } from "./client";

console.log("Initializing database schema...");

// Create accounts table - OAuth tokens for Gmail accounts
await db`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry INTEGER NOT NULL,
    history_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`;
console.log("  - accounts table created");

// Create emails table - Cached email data
await db`
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    subject TEXT,
    sender TEXT NOT NULL,
    recipients TEXT,
    snippet TEXT,
    body_text TEXT,
    body_html TEXT,
    date INTEGER NOT NULL,
    labels TEXT,
    has_attachments INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    raw_size INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  )
`;
console.log("  - emails table created");

// Create attachments table - Attachment metadata
await db`
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL
  )
`;
console.log("  - attachments table created");

// Create indexes for fast queries
// SQLite supports CREATE INDEX IF NOT EXISTS
await db`CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)`;
console.log("  - idx_emails_account index created");

await db`CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)`;
console.log("  - idx_emails_date index created");

await db`CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id)`;
console.log("  - idx_emails_thread index created");

await db`CREATE INDEX IF NOT EXISTS idx_emails_labels ON emails(labels)`;
console.log("  - idx_emails_labels index created");

await db`CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id)`;
console.log("  - idx_attachments_email index created");

console.log("\nDatabase schema initialization complete!");
console.log("Database location: data/email.db");
