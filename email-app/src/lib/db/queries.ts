/**
 * Typed query functions for database operations
 */

import { db } from "./client";

// =============================================================================
// Type Definitions
// =============================================================================

export interface Account {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: number;
  history_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface AccountInput {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: number;
  history_id?: string | null;
}

export interface Email {
  id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  sender: string;
  recipients: string | null; // JSON array as string
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  date: number;
  labels: string | null; // JSON array as string
  has_attachments: number;
  is_read: number;
  raw_size: number | null;
  created_at: number;
}

export interface EmailInput {
  id: string;
  account_id: string;
  thread_id: string;
  subject?: string | null;
  sender: string;
  recipients?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  date: number;
  labels?: string | null;
  has_attachments?: number;
  is_read?: number;
  raw_size?: number | null;
}

export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

export interface AttachmentInput {
  id: string;
  email_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

// =============================================================================
// Account Queries
// =============================================================================

/**
 * Get all accounts
 */
export async function getAccounts(): Promise<Account[]> {
  const rows = await db`SELECT * FROM accounts ORDER BY created_at DESC`;
  return rows as Account[];
}

/**
 * Get account by ID
 */
export async function getAccountById(id: string): Promise<Account | null> {
  const rows = await db`SELECT * FROM accounts WHERE id = ${id}`;
  return (rows[0] as Account) ?? null;
}

/**
 * Get account by email
 */
export async function getAccountByEmail(email: string): Promise<Account | null> {
  const rows = await db`SELECT * FROM accounts WHERE email = ${email}`;
  return (rows[0] as Account) ?? null;
}

/**
 * Insert or update an account
 */
export async function upsertAccount(account: AccountInput): Promise<void> {
  await db`
    INSERT INTO accounts (id, email, access_token, refresh_token, token_expiry, history_id, updated_at)
    VALUES (${account.id}, ${account.email}, ${account.access_token}, ${account.refresh_token}, ${account.token_expiry}, ${account.history_id ?? null}, unixepoch())
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expiry = excluded.token_expiry,
      history_id = excluded.history_id,
      updated_at = unixepoch()
  `;
}

/**
 * Update account's history_id for delta sync
 */
export async function updateAccountHistoryId(id: string, historyId: string): Promise<void> {
  await db`
    UPDATE accounts
    SET history_id = ${historyId}, updated_at = unixepoch()
    WHERE id = ${id}
  `;
}

/**
 * Update account tokens (after refresh)
 */
export async function updateAccountTokens(
  id: string,
  accessToken: string,
  tokenExpiry: number
): Promise<void> {
  await db`
    UPDATE accounts
    SET access_token = ${accessToken}, token_expiry = ${tokenExpiry}, updated_at = unixepoch()
    WHERE id = ${id}
  `;
}

/**
 * Delete an account and all associated data (cascades to emails and attachments)
 */
export async function deleteAccount(id: string): Promise<void> {
  await db`DELETE FROM accounts WHERE id = ${id}`;
}

// =============================================================================
// Email Queries
// =============================================================================

/**
 * Get emails for an account, ordered by date descending
 */
export async function getEmailsByAccount(
  accountId: string,
  limit: number = 100
): Promise<Email[]> {
  const rows = await db`
    SELECT * FROM emails
    WHERE account_id = ${accountId}
    ORDER BY date DESC
    LIMIT ${limit}
  `;
  return rows as Email[];
}

/**
 * Get email by ID
 */
export async function getEmailById(id: string): Promise<Email | null> {
  const rows = await db`SELECT * FROM emails WHERE id = ${id}`;
  return (rows[0] as Email) ?? null;
}

/**
 * Get emails by thread ID
 */
export async function getEmailsByThread(threadId: string): Promise<Email[]> {
  const rows = await db`
    SELECT * FROM emails
    WHERE thread_id = ${threadId}
    ORDER BY date ASC
  `;
  return rows as Email[];
}

/**
 * Insert or update an email
 */
export async function upsertEmail(email: EmailInput): Promise<void> {
  await db`
    INSERT INTO emails (
      id, account_id, thread_id, subject, sender, recipients, snippet,
      body_text, body_html, date, labels, has_attachments, is_read, raw_size
    )
    VALUES (
      ${email.id}, ${email.account_id}, ${email.thread_id}, ${email.subject ?? null},
      ${email.sender}, ${email.recipients ?? null}, ${email.snippet ?? null},
      ${email.body_text ?? null}, ${email.body_html ?? null}, ${email.date},
      ${email.labels ?? null}, ${email.has_attachments ?? 0}, ${email.is_read ?? 0},
      ${email.raw_size ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      thread_id = excluded.thread_id,
      subject = excluded.subject,
      sender = excluded.sender,
      recipients = excluded.recipients,
      snippet = excluded.snippet,
      body_text = excluded.body_text,
      body_html = excluded.body_html,
      date = excluded.date,
      labels = excluded.labels,
      has_attachments = excluded.has_attachments,
      is_read = excluded.is_read,
      raw_size = excluded.raw_size
  `;
}

/**
 * Bulk insert emails (for initial sync)
 */
export async function insertEmails(emails: EmailInput[]): Promise<void> {
  if (emails.length === 0) return;

  await db.begin(async (tx) => {
    for (const email of emails) {
      await tx`
        INSERT INTO emails (
          id, account_id, thread_id, subject, sender, recipients, snippet,
          body_text, body_html, date, labels, has_attachments, is_read, raw_size
        )
        VALUES (
          ${email.id}, ${email.account_id}, ${email.thread_id}, ${email.subject ?? null},
          ${email.sender}, ${email.recipients ?? null}, ${email.snippet ?? null},
          ${email.body_text ?? null}, ${email.body_html ?? null}, ${email.date},
          ${email.labels ?? null}, ${email.has_attachments ?? 0}, ${email.is_read ?? 0},
          ${email.raw_size ?? null}
        )
        ON CONFLICT (id) DO UPDATE SET
          thread_id = excluded.thread_id,
          subject = excluded.subject,
          sender = excluded.sender,
          recipients = excluded.recipients,
          snippet = excluded.snippet,
          body_text = excluded.body_text,
          body_html = excluded.body_html,
          date = excluded.date,
          labels = excluded.labels,
          has_attachments = excluded.has_attachments,
          is_read = excluded.is_read,
          raw_size = excluded.raw_size
      `;
    }
  });
}

/**
 * Update email labels
 */
export async function updateEmailLabels(id: string, labels: string): Promise<void> {
  await db`UPDATE emails SET labels = ${labels} WHERE id = ${id}`;
}

/**
 * Mark email as read/unread
 */
export async function updateEmailReadStatus(id: string, isRead: boolean): Promise<void> {
  await db`UPDATE emails SET is_read = ${isRead ? 1 : 0} WHERE id = ${id}`;
}

/**
 * Delete an email by ID
 */
export async function deleteEmail(id: string): Promise<void> {
  await db`DELETE FROM emails WHERE id = ${id}`;
}

/**
 * Delete all emails for an account
 */
export async function deleteEmailsByAccount(accountId: string): Promise<void> {
  await db`DELETE FROM emails WHERE account_id = ${accountId}`;
}

// =============================================================================
// Attachment Queries
// =============================================================================

/**
 * Get attachments for an email
 */
export async function getAttachmentsByEmail(emailId: string): Promise<Attachment[]> {
  const rows = await db`
    SELECT * FROM attachments
    WHERE email_id = ${emailId}
  `;
  return rows as Attachment[];
}

/**
 * Get attachment by ID
 */
export async function getAttachmentById(id: string): Promise<Attachment | null> {
  const rows = await db`SELECT * FROM attachments WHERE id = ${id}`;
  return (rows[0] as Attachment) ?? null;
}

/**
 * Insert an attachment
 */
export async function insertAttachment(attachment: AttachmentInput): Promise<void> {
  await db`
    INSERT INTO attachments (id, email_id, filename, mime_type, size)
    VALUES (${attachment.id}, ${attachment.email_id}, ${attachment.filename}, ${attachment.mime_type}, ${attachment.size})
    ON CONFLICT (id) DO UPDATE SET
      filename = excluded.filename,
      mime_type = excluded.mime_type,
      size = excluded.size
  `;
}

/**
 * Bulk insert attachments
 */
export async function insertAttachments(attachments: AttachmentInput[]): Promise<void> {
  if (attachments.length === 0) return;

  await db.begin(async (tx) => {
    for (const attachment of attachments) {
      await tx`
        INSERT INTO attachments (id, email_id, filename, mime_type, size)
        VALUES (${attachment.id}, ${attachment.email_id}, ${attachment.filename}, ${attachment.mime_type}, ${attachment.size})
        ON CONFLICT (id) DO UPDATE SET
          filename = excluded.filename,
          mime_type = excluded.mime_type,
          size = excluded.size
      `;
    }
  });
}

/**
 * Delete attachments for an email
 */
export async function deleteAttachmentsByEmail(emailId: string): Promise<void> {
  await db`DELETE FROM attachments WHERE email_id = ${emailId}`;
}
